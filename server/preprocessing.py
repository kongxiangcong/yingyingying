"""Persistent jobs, explicit retries, and lease-based interrupted-worker recovery."""
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException
from .model_adapter import settings
from .processes import OwnedProcess, process_identity

router = APIRouter()
_workers = {}


def initialize(db):
    if not db.in_transaction:
        db.execute('BEGIN IMMEDIATE')
    db.execute('CREATE TABLE IF NOT EXISTS preprocessing_tasks (id TEXT PRIMARY KEY, material_id TEXT NOT NULL, status TEXT NOT NULL, stage TEXT NOT NULL, error TEXT, package_id TEXT, worker_pid INTEGER, config TEXT NOT NULL, stages TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)')
    existing = {row['name'] for row in db.execute('PRAGMA table_info(preprocessing_tasks)')}
    fields = {'retry_of':'TEXT', 'heartbeat':'REAL', 'worker_identity':'TEXT', 'lease':'TEXT', 'model_attempts':'INTEGER NOT NULL DEFAULT 0', 'reused_artifacts':"TEXT NOT NULL DEFAULT '[]'", 'fingerprint':'TEXT', 'error_code':'TEXT'}
    for name, declaration in fields.items():
        if name not in existing:
            db.execute(f'ALTER TABLE preprocessing_tasks ADD COLUMN {name} {declaration}')
    package_fields = {row['name'] for row in db.execute('PRAGMA table_info(packages)')}
    if 'generation_task_id' not in package_fields:
        db.execute('ALTER TABLE packages ADD COLUMN generation_task_id TEXT')
    db.execute('CREATE UNIQUE INDEX IF NOT EXISTS packages_generation_task ON packages(generation_task_id)')
    db.execute('CREATE UNIQUE INDEX IF NOT EXISTS preprocessing_retry_once ON preprocessing_tasks(retry_of) WHERE retry_of IS NOT NULL')


def public_task(row):
    result = dict(row)
    config = json.loads(result.pop('config'))
    result.pop('lease', None)
    result.pop('worker_identity', None)
    result['provider'] = config.get('provider')
    result['model'] = config.get('model')
    result['stages'] = json.loads(result['stages'])
    result['reused_artifacts'] = json.loads(result['reused_artifacts'])
    return result


def reconcile():
    from .app import connect
    with connect() as db:
        initialize(db)
        rows = db.execute("SELECT * FROM preprocessing_tasks WHERE status IN ('queued','running')").fetchall()
        for row in rows:
            age = time.time() - (row['heartbeat'] or 0)
            identity = process_identity(row['worker_pid'])
            valid = identity is not None and identity == row['worker_identity']
            if (row['worker_pid'] and not valid) or age > 10:
                db.execute("UPDATE preprocessing_tasks SET status='failed',error=?,lease=NULL WHERE id=?", ('预处理进程已中断，或心跳过期；可安全重试并复用有效产物', row['id']))
                child = _workers.pop(row['id'], None)
                if child:
                    if child.process.poll() is None:
                        child.stop()  # Uses our retained process/job handle, never an arbitrary PID.
                    child.close()
    for task_id, child in list(_workers.items()):
        if child.process.poll() is not None:
            child.close()
            _workers.pop(task_id, None)


@router.get('/api/materials/{material_id}/tasks')
def tasks(material_id: str):
    from .app import connect, get_material
    get_material(material_id)
    reconcile()
    with connect() as db:
        rows = db.execute('SELECT * FROM preprocessing_tasks WHERE material_id=? ORDER BY rowid DESC', (material_id,)).fetchall()
    return [public_task(row) for row in rows]


def create_task(material_id, retry_of=None):
    from .app import connect, get_material
    get_material(material_id)
    reconcile()
    task_id, lease = uuid.uuid4().hex, uuid.uuid4().hex
    try:
        config = settings()
    except (ValueError, TypeError):
        config = {'provider': os.environ.get('SCENE_MODEL_PROVIDER', 'codex'), 'model': os.environ.get('SCENE_MODEL_MODEL', '')}
    with connect() as db:
        initialize(db)
        if retry_of:
            previous = db.execute('SELECT * FROM preprocessing_tasks WHERE id=? AND material_id=?', (retry_of, material_id)).fetchone()
            if previous is None:
                raise HTTPException(404, '原预处理任务不存在')
            if previous['status'] != 'failed':
                raise HTTPException(409, '只有失败或中断的任务可以重试')
            child = db.execute('SELECT * FROM preprocessing_tasks WHERE retry_of=?', (retry_of,)).fetchone()
            if child:
                return public_task(child)
        active = db.execute("SELECT * FROM preprocessing_tasks WHERE material_id=? AND status IN ('queued','running')", (material_id,)).fetchone()
        if active:
            return public_task(active)
        db.execute('INSERT INTO preprocessing_tasks(id,material_id,status,stage,config,stages,retry_of,heartbeat,lease) VALUES(?,?,?,?,?,?,?,?,?)', (task_id, material_id, 'queued', 'check', json.dumps(config), '[]', retry_of, time.time(), lease))
    try:
        child = OwnedProcess([sys.executable, '-m', 'server.preprocess_worker', task_id, lease], cwd=str(Path(__file__).resolve().parent.parent), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        _workers[task_id] = child
        with connect() as db:
            db.execute('UPDATE preprocessing_tasks SET worker_pid=?,worker_identity=? WHERE id=?', (child.pid, process_identity(child.pid), task_id))
    except OSError:
        with connect() as db:
            db.execute("UPDATE preprocessing_tasks SET status='failed',error=?,lease=NULL WHERE id=?", ('无法启动独立预处理进程', task_id))
    with connect() as db:
        row = db.execute('SELECT * FROM preprocessing_tasks WHERE id=?', (task_id,)).fetchone()
    return public_task(row)


@router.post('/api/materials/{material_id}/tasks', status_code=202)
def start(material_id: str):
    return create_task(material_id)


@router.post('/api/tasks/{task_id}/retry', status_code=202)
def retry(task_id: str):
    from .app import connect
    reconcile()
    with connect() as db:
        row = db.execute('SELECT material_id FROM preprocessing_tasks WHERE id=?', (task_id,)).fetchone()
    if row is None:
        raise HTTPException(404, '预处理任务不存在')
    return create_task(row['material_id'], task_id)
