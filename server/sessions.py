"""Durable boundaries for one learning session, independent of lifetime progress."""
import json
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


def initialize(db):
    db.execute("CREATE TABLE IF NOT EXISTS learning_sessions (id TEXT PRIMARY KEY, package_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', start_ms INTEGER NOT NULL, report_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)")
    db.execute("CREATE UNIQUE INDEX IF NOT EXISTS one_open_learning_session ON learning_sessions(package_id) WHERE status='open'")
    db.execute('CREATE TABLE IF NOT EXISTS session_attempts (session_id TEXT NOT NULL, question_id TEXT NOT NULL, record TEXT NOT NULL, errors INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(session_id,question_id))')
    db.execute('CREATE TABLE IF NOT EXISTS session_history (id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, question_id TEXT NOT NULL, record TEXT NOT NULL, error_delta INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)')


def current(db, package_id):
    initialize(db)
    return db.execute("SELECT * FROM learning_sessions WHERE package_id=? AND status='open'", (package_id,)).fetchone()


def resolve(db, package_id, session_id=None):
    initialize(db)
    row = db.execute('SELECT * FROM learning_sessions WHERE id=?', (session_id,)).fetchone() if session_id else current(db, package_id)
    if session_id and (row is None or row['package_id'] != package_id):
        raise HTTPException(409, '本次学习标识无效，请重新打开素材')
    return row


def writable(db, package_id, session_id=None):
    row = resolve(db, package_id, session_id)
    if row is not None and row['status'] != 'open':
        raise HTTPException(409, '本次学习已结束，不能追加作答')
    return row


def record_attempt(db, session, question_id, record, previous=None):
    if session is None:
        return  # Legacy API clients can retain records without inventing a session.
    same_generation = previous and previous.get('generation', 0) == record.get('generation', 0)
    delta = max(0, record['errors'] - (previous['errors'] if same_generation else 0))
    encoded = json.dumps(record, ensure_ascii=False)
    db.execute('INSERT INTO session_attempts VALUES(?,?,?,?) ON CONFLICT(session_id,question_id) DO UPDATE SET record=excluded.record,errors=session_attempts.errors+excluded.errors', (session['id'], question_id, encoded, delta))
    db.execute('INSERT INTO session_history(session_id,question_id,record,error_delta) VALUES(?,?,?,?)', (session['id'], question_id, encoded, delta))


class StartLearning(BaseModel):
    start_ms: int = Field(default=0, ge=0)


@router.post('/api/packages/{package_id}/sessions')
def start_learning(package_id: str, request: StartLearning):
    from .app import connect, get_material
    from .learning import get_package
    package = get_package(package_id)
    if request.start_ms > get_material(package['material_id'])['duration_ms']:
        raise HTTPException(422, '学习位置超出视频时长')
    with connect() as db:
        initialize(db)
        db.execute('BEGIN IMMEDIATE')
        session = current(db, package_id)
        if session is None:
            session_id = uuid.uuid4().hex
            db.execute('INSERT INTO learning_sessions(id,package_id,start_ms) VALUES(?,?,?)', (session_id, package_id, request.start_ms))
            session = current(db, package_id)
        return dict(session)


@router.get('/api/packages/{package_id}/sessions/current')
def read_current(package_id: str):
    from .app import connect
    from .learning import get_package
    get_package(package_id)
    with connect() as db:
        session = current(db, package_id)
    return dict(session) if session else None
