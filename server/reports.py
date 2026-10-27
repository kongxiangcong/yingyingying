"""Saved learning-report snapshots; unfinished answers never enter a report."""
from datetime import datetime, timezone
import json
import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .learning import get_package

router = APIRouter()


def report_connection():
    from .app import connect
    db = connect()
    db.execute('CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, package_id TEXT NOT NULL, material_id TEXT NOT NULL, created_at TEXT NOT NULL, snapshot TEXT NOT NULL)')
    if 'session_id' not in {row['name'] for row in db.execute('PRAGMA table_info(reports)')}:
        db.execute('ALTER TABLE reports ADD COLUMN session_id TEXT')
    db.execute('CREATE UNIQUE INDEX IF NOT EXISTS report_per_session ON reports(session_id) WHERE session_id IS NOT NULL')
    return db


class FinishLearning(BaseModel):
    reason: Literal['user', 'video_end']
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    session_id: str | None = None


@router.post('/api/packages/{package_id}/reports', status_code=201)
def finish_learning(package_id: str, finish: FinishLearning):
    from .app import get_material
    package = get_package(package_id)
    material = get_material(package['material_id'])
    if max(finish.start_ms, finish.end_ms) > material['duration_ms']:
        raise HTTPException(422, '学习位置超出视频时长')
    with report_connection() as db:
        from .sessions import resolve
        db.execute('BEGIN IMMEDIATE')
        session=resolve(db,package_id,finish.session_id)
        if session is None:raise HTTPException(409,'请先开始本次学习，再结束生成报告')
        if session['report_id']:
            saved=db.execute('SELECT snapshot FROM reports WHERE id=?',(session['report_id'],)).fetchone()
            return json.loads(saved['snapshot'])
        rows = db.execute('SELECT question_id,record,errors FROM session_attempts WHERE session_id=?', (session['id'],)).fetchall()
        attempts = {row['question_id']: json.loads(row['record']) | {'errors':row['errors']} for row in rows}
        finished, unfinished = [], []
        counts = {'completed': 0, 'revealed': 0, 'unfinished': 0, 'no_hint': 0, 'stalled': 0, 'errors': 0, 'hints': [0, 0, 0, 0]}
        for question in package['questions']:
            attempt = attempts.get(question['id'])
            if attempt:
                counts['errors'] += attempt['errors']
                counts['hints'][attempt['highest_hint']] += 1
                if attempt['highest_hint'] > 0:
                    counts['stalled'] += 1
            if not attempt or not attempt['completed']:
                counts['unfinished'] += 1
                unfinished.append({'question_id': question['id'], 'position_ms': question['start_ms']})
                continue
            status = 'revealed' if attempt['revealed'] else 'completed'
            counts[status] += 1
            if attempt['highest_hint'] == 0:
                counts['no_hint'] += 1
            finished.append({
                'question_id': question['id'], 'position_ms': question['start_ms'],
                'status': status, 'english': question['english'], 'chinese': question['chinese'],
                'card': question['card'], 'attempt': attempt,
            })
        snapshot = {
            'id': uuid.uuid4().hex, 'package_id': package_id, 'material_id': material['id'],
            'session_id':session['id'],
            'material_name': material['name'], 'created_at': datetime.now(timezone.utc).isoformat(),
            'reason': finish.reason, 'range': {'start_ms': session['start_ms'], 'end_ms': finish.end_ms},
            'counts': counts, 'finished': finished, 'unfinished': unfinished,
        }
        db.execute('INSERT INTO reports(id,package_id,material_id,created_at,snapshot,session_id) VALUES(?,?,?,?,?,?)', (snapshot['id'], package_id, material['id'], snapshot['created_at'], json.dumps(snapshot, ensure_ascii=False),session['id']))
        db.execute("UPDATE learning_sessions SET status='closed',report_id=? WHERE id=?",(snapshot['id'],session['id']))
    return snapshot


@router.get('/api/reports')
def list_reports():
    with report_connection() as db:
        rows = db.execute('SELECT snapshot FROM reports ORDER BY created_at DESC, rowid DESC').fetchall()
    return [{key: value for key, value in json.loads(row['snapshot']).items() if key not in ('finished', 'unfinished')} for row in rows]


@router.get('/api/reports/{report_id}')
def read_report(report_id: str):
    with report_connection() as db:
        row = db.execute('SELECT snapshot FROM reports WHERE id=?', (report_id,)).fetchone()
    if row is None:
        raise HTTPException(404, '学习报告不存在')
    return json.loads(row['snapshot'])
