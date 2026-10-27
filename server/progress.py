"""Version-specific player progress, explicit retries and immutable attempt history."""
import json
from fastapi import APIRouter,HTTPException
from pydantic import BaseModel,Field
from .learning import get_package
router=APIRouter()

def progress_table(db):
    db.execute('CREATE TABLE IF NOT EXISTS progress (package_id TEXT PRIMARY KEY, record TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS learning_activity (material_id TEXT PRIMARY KEY, package_id TEXT NOT NULL, position_ms INTEGER NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)')

class Progress(BaseModel):
    position_ms:int=Field(default=0,ge=0)
    active_question_id:str|None=None
    revision:int=Field(default=0,ge=0)
    session_id:str|None=None

@router.get('/api/packages/{package_id}/progress')
def read_progress(package_id:str):
    from .app import connect
    get_package(package_id)
    with connect() as db:
        progress_table(db)
        row=db.execute('SELECT record FROM progress WHERE package_id=?',(package_id,)).fetchone()
    return json.loads(row['record']) if row else {'position_ms':0,'active_question_id':None}

@router.put('/api/packages/{package_id}/progress')
def save_progress(package_id:str,record:Progress):
    from .app import connect,get_material
    package=get_package(package_id)
    if record.position_ms>get_material(package['material_id'])['duration_ms']: raise HTTPException(422,'播放位置超过视频时长')
    if record.active_question_id is not None and not any(q['id']==record.active_question_id for q in package['questions']): raise HTTPException(422,'恢复题目不属于该版本')
    data=record.model_dump()
    with connect() as db:
        progress_table(db)
        db.execute('BEGIN IMMEDIATE')
        old=db.execute('SELECT record FROM progress WHERE package_id=?',(package_id,)).fetchone()
        if record.session_id:
            from .sessions import resolve
            session=resolve(db,package_id,record.session_id)
            if session['status']!='open':return json.loads(old['record']) if old else {'position_ms':0,'active_question_id':None}
        if old and json.loads(old['record']).get('revision',0)>record.revision: return json.loads(old['record'])
        db.execute('INSERT INTO progress VALUES(?,?) ON CONFLICT(package_id) DO UPDATE SET record=excluded.record',(package_id,json.dumps(data)))
        db.execute('INSERT INTO learning_activity(material_id,package_id,position_ms) VALUES(?,?,?) ON CONFLICT(material_id) DO UPDATE SET package_id=excluded.package_id,position_ms=excluded.position_ms,updated_at=CURRENT_TIMESTAMP',(package['material_id'],package_id,data['position_ms']))
    return data

class RedoLearning(BaseModel):
    session_id:str|None=None

@router.post('/api/packages/{package_id}/attempts/{question_id}/redo')
def redo(package_id:str,question_id:str,request:RedoLearning=RedoLearning()):
    from .app import connect
    package=get_package(package_id)
    question=next((q for q in package['questions'] if q['id']==question_id),None)
    if question is None: raise HTTPException(404,'题目不存在')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        from .sessions import writable,record_attempt
        session=writable(db,package_id,request.session_id)
        row=db.execute('SELECT record FROM attempts WHERE package_id=? AND question_id=?',(package_id,question_id)).fetchone()
        previous=json.loads(row['record']) if row else None
        if not previous or not previous['completed']: raise HTTPException(409,'只有已完成题可主动重做')
        record={'inputs':['']*len(question['tokens']),'errors':0,'highest_hint':0,'completed':False,'revealed':False,'generation':previous.get('generation',0)+1,'session_id':session['id'] if session is not None else None}
        record_attempt(db,session,question_id,record,previous)
        encoded=json.dumps(record)
        db.execute('UPDATE attempts SET record=? WHERE package_id=? AND question_id=?',(encoded,package_id,question_id))
        db.execute('INSERT INTO attempt_history(package_id,question_id,record) VALUES(?,?,?)',(package_id,question_id,encoded))
    return record

@router.get('/api/packages/{package_id}/attempts/{question_id}/history')
def history(package_id:str,question_id:str):
    from .app import connect
    package=get_package(package_id)
    if not any(q['id']==question_id for q in package['questions']): raise HTTPException(404,'题目不存在')
    with connect() as db: rows=db.execute('SELECT id,record,created_at FROM attempt_history WHERE package_id=? AND question_id=? ORDER BY id',(package_id,question_id)).fetchall()
    return [{'id':row['id'],'created_at':row['created_at'],**json.loads(row['record'])} for row in rows]
