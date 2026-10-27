"""Version-bound mistake notebook and user-paced review histories."""
import json
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .learning import Attempt, get_package
from .answers import validate_answer, answer_identity

router = APIRouter()


def connection():
    from .app import connect
    db = connect()
    db.execute('CREATE TABLE IF NOT EXISTS notebook_mastery (package_id TEXT NOT NULL, question_id TEXT NOT NULL, mastered INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(package_id,question_id))')
    db.execute('CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, items TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)')
    db.execute('CREATE TABLE IF NOT EXISTS review_attempts (review_id TEXT NOT NULL, position INTEGER NOT NULL, record TEXT NOT NULL, PRIMARY KEY(review_id,position))')
    db.execute('CREATE TABLE IF NOT EXISTS review_history (id INTEGER PRIMARY KEY, review_id TEXT NOT NULL, position INTEGER NOT NULL, package_id TEXT NOT NULL, question_id TEXT NOT NULL, record TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)')
    return db


def entries(db):
    # Membership is historical: a fresh video redo must not erase a past hint.
    rows = db.execute('SELECT package_id,question_id,record FROM attempt_history UNION ALL SELECT package_id,question_id,record FROM attempts').fetchall()
    hints = {}
    for row in rows:
        record = json.loads(row['record'])
        if record['highest_hint']:
            key = (row['package_id'], row['question_id'])
            hints[key] = max(hints.get(key, 0), record['highest_hint'])
    mastery = {(row['package_id'], row['question_id']): bool(row['mastered']) for row in db.execute('SELECT * FROM notebook_mastery')}
    packages, result = {}, []
    from .app import get_material
    for (package_id, question_id), highest_hint in hints.items():
        if package_id not in packages:
            packages[package_id] = get_package(package_id)
        package = packages[package_id]
        question = next((q for q in package['questions'] if q['id'] == question_id), None)
        if question is None:
            continue
        count = db.execute('SELECT COUNT(DISTINCT review_id) FROM review_history WHERE package_id=? AND question_id=?', (package_id, question_id)).fetchone()[0]
        result.append({'package_id': package_id, 'question_id': question_id, 'material_name': get_material(package['material_id'])['name'], 'chinese': question['chinese'], 'position_ms': question['start_ms'], 'highest_hint': highest_hint, 'mastered': mastery.get((package_id, question_id), False), 'review_count': count})
    return sorted(result, key=lambda entry: (entry['package_id'], entry['position_ms']))


def require_entry(db, package_id, question_id):
    entry = next((entry for entry in entries(db) if entry['package_id'] == package_id and entry['question_id'] == question_id), None)
    if entry is None:
        raise HTTPException(404, '错题不存在')
    return entry


@router.get('/api/notebook')
def read_notebook(include_mastered: bool = False):
    with connection() as db:
        return [entry for entry in entries(db) if include_mastered or not entry['mastered']]


class Mastery(BaseModel):
    mastered: bool


@router.put('/api/notebook/{package_id}/{question_id}/mastery')
def mark_mastery(package_id: str, question_id: str, mastery: Mastery):
    with connection() as db:
        require_entry(db, package_id, question_id)
        db.execute('INSERT INTO notebook_mastery VALUES(?,?,?) ON CONFLICT(package_id,question_id) DO UPDATE SET mastered=excluded.mastered', (package_id, question_id, int(mastery.mastered)))
    return mastery.model_dump()


@router.get('/api/notebook/{package_id}/{question_id}/history')
def read_history(package_id: str, question_id: str):
    with connection() as db:
        require_entry(db, package_id, question_id)
        learning = db.execute('SELECT id,record,created_at FROM attempt_history WHERE package_id=? AND question_id=? ORDER BY id', (package_id, question_id)).fetchall()
        reviews = db.execute('SELECT id,review_id,record,created_at FROM review_history WHERE package_id=? AND question_id=? ORDER BY id', (package_id, question_id)).fetchall()
    return {'learning': [dict(row) | {'record': json.loads(row['record'])} for row in learning], 'reviews': [dict(row) | {'record': json.loads(row['record'])} for row in reviews]}


class ReviewItem(BaseModel):
    package_id: str
    question_id: str


class StartReview(BaseModel):
    items: list[ReviewItem] = Field(min_length=1)


def read_session(db, review_id):
    row = db.execute('SELECT * FROM reviews WHERE id=?', (review_id,)).fetchone()
    if row is None:
        raise HTTPException(404, '复习记录不存在')
    attempts = db.execute('SELECT position,record FROM review_attempts WHERE review_id=?', (review_id,)).fetchall()
    return dict(row) | {'items': json.loads(row['items']), 'attempts': {str(row['position']): json.loads(row['record']) for row in attempts}}


@router.post('/api/reviews', status_code=201)
def start_review(review: StartReview):
    items = [item.model_dump() for item in review.items]
    keys = [(item['package_id'], item['question_id']) for item in items]
    if len(set(keys)) != len(keys):
        raise HTTPException(422, '复习题目重复')
    review_id = uuid.uuid4().hex
    with connection() as db:
        for item in items:
            require_entry(db, **item)
        db.execute('INSERT INTO reviews(id,items) VALUES(?,?)', (review_id, json.dumps(items)))
        return read_session(db, review_id)


@router.get('/api/reviews/{review_id}')
def read_review(review_id: str):
    with connection() as db:
        return read_session(db, review_id)


def question_at(session, position):
    if not 0 <= position < len(session['items']):
        raise HTTPException(404, '复习题目不存在')
    item = session['items'][position]
    return next(q for q in get_package(item['package_id'])['questions'] if q['id'] == item['question_id'])


@router.get('/api/reviews/{review_id}/questions/{position}')
def read_question(review_id: str, position: int):
    with connection() as db:
        return question_at(read_session(db, review_id), position)


@router.put('/api/reviews/{review_id}/attempts/{position}')
def save_review_attempt(review_id: str, position: int, attempt: Attempt):
    with connection() as db:
        session = read_session(db, review_id)
        if position != session['position']:
            raise HTTPException(409, '复习位置已改变，请重新读取')
        question = question_at(session, position)
        old = session['attempts'].get(str(position))
        try:
            record = validate_answer(question, attempt.model_dump(), old)
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        if old and old['completed']:
            if answer_identity(record) == answer_identity(old):
                return old
            raise HTTPException(409, '本次结果已保存，请开始新的复习')
        encoded = json.dumps(record, ensure_ascii=False)
        item = session['items'][position]
        db.execute('INSERT INTO review_attempts VALUES(?,?,?) ON CONFLICT(review_id,position) DO UPDATE SET record=excluded.record', (review_id, position, encoded))
        db.execute('INSERT INTO review_history(review_id,position,package_id,question_id,record) VALUES(?,?,?,?,?)', (review_id, position, item['package_id'], item['question_id'], encoded))
    return record


class AdvanceReview(BaseModel):
    position: int = Field(ge=0)


@router.post('/api/reviews/{review_id}/advance')
def advance_review(review_id: str, advance: AdvanceReview):
    with connection() as db:
        session = read_session(db, review_id)
        if advance.position != session['position']:
            raise HTTPException(409, '复习位置已改变，请重新读取')
        record = session['attempts'].get(str(advance.position))
        if not record or not record['completed']:
            raise HTTPException(422, '先完成或揭晓当前题目')
        db.execute('UPDATE reviews SET position=position+1 WHERE id=?', (review_id,))
        return read_session(db, review_id)
