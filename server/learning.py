"""Immutable, validated exercise packages and version-bound learning attempts."""
from pathlib import Path
import json, re, uuid
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import Field
from .answers import Answer, normalize, validate_answer, answer_identity

router=APIRouter()
WORD=re.compile(r"[A-Za-z0-9]+(?:['’‘\-][A-Za-z0-9]+)*")

def tokenize(english):
    matches=list(WORD.finditer(english))
    return [{'word':m.group(), 'prefix':english[:m.start()] if i==0 else '', 'suffix':english[m.end():matches[i+1].start()] if i+1<len(matches) else english[m.end():]} for i,m in enumerate(matches)]

def publish_package(material_id,payload,*,generation_task_id=None,lease=None,generation_config=None):
    from .app import connect,get_material,DATA
    if not isinstance(payload,dict): raise ValueError('练习包必须为 JSON 对象')
    material=get_material(material_id)
    cues={c['id']:c for c in json.loads(material['subtitles'])}
    questions=payload.get('questions')
    if not isinstance(questions,list) or not questions: raise ValueError('练习包必须包含题目')
    ids=set(); previous=-1
    for q in questions:
        if not isinstance(q,dict) or not isinstance(q.get('id'),str) or q['id'] in ids: raise ValueError('题号缺失或重复')
        ids.add(q['id'])
        source=q.get('source_ids')
        if not isinstance(source,list) or not source or len(set(source))!=len(source) or any(i not in cues for i in source): raise ValueError('来源字幕无效')
        english=q.get('english')
        if english != ' '.join(cues[i]['text'].replace('\n',' ') for i in source): raise ValueError('原句必须与来源字幕完全一致')
        if not isinstance(q.get('chinese'),str) or not q['chinese'].strip(): raise ValueError('缺少中文题意')
        times=[q.get(k) for k in ['pause_ms','start_ms','end_ms']]
        if any(type(t) is not int for t in times) or not (previous < times[0] < times[1] < times[2] <= material['duration_ms']): raise ValueError('练习时间表无效或重叠')
        previous=times[2]
        if not isinstance(q.get('card'),dict) or any(not isinstance(q['card'].get(k),str) or not q['card'][k].strip() for k in ['usage','pattern','explanation','example','translation']): raise ValueError('句式卡资料不完整')
        tokens=tokenize(english)
        if not tokens: raise ValueError('原句没有可填写单词')
        if 'tokens' in q and q['tokens']!=tokens: raise ValueError('词单元与原句不一致')
        q['tokens']=tokens
        hints=q.get('hint_indices',[0])
        if not isinstance(hints,list) or not hints or len(hints)>=len(tokens) or len(set(hints))!=len(hints) or any(type(i) is not int or not 0<=i<len(tokens) for i in hints): raise ValueError('揭词索引无效')
        q['hint_indices']=hints
    package_id=uuid.uuid4().hex
    from .package_metadata import source_identity, generation_snapshot, public_provenance
    package={'id':package_id,'material_id':material_id,'schema_version':1,'provenance':public_provenance(payload.get('provenance',{'provider':'local','model':'none'})),'questions':questions,
             'source_fingerprints':source_identity(material),'generation_config':generation_snapshot(generation_config)}
    directory=DATA/'packages';directory.mkdir(exist_ok=True)
    path=directory/f'{package_id}.json';temp=path.with_suffix('.tmp')
    temp.write_text(json.dumps(package,ensure_ascii=False),encoding='utf-8');temp.replace(path)
    with connect() as db:
        if generation_task_id:
            db.execute('BEGIN IMMEDIATE')
            task=db.execute('SELECT status,lease,stages,package_id FROM preprocessing_tasks WHERE id=?',(generation_task_id,)).fetchone()
            existing=db.execute('SELECT path FROM packages WHERE generation_task_id=?',(generation_task_id,)).fetchone()
            if existing and task and task['lease']==lease and task['status']=='succeeded':
                path.unlink(missing_ok=True)
                return json.loads(Path(existing['path']).read_text(encoding='utf-8'))
            if task is None or task['lease']!=lease or task['status'] not in ('queued','running'):
                path.unlink(missing_ok=True)
                raise InterruptedError('预处理执行权已撤销')
            if existing:
                path.unlink(missing_ok=True)
                return json.loads(Path(existing['path']).read_text(encoding='utf-8'))
            db.execute('INSERT INTO packages(id,material_id,path,generation_task_id) VALUES(?,?,?,?)',(package_id,material_id,str(path),generation_task_id))
            history=json.loads(task['stages'])
            if 'publish' not in history: history.append('publish')
            db.execute("UPDATE preprocessing_tasks SET status='succeeded',stage='publish',stages=?,package_id=?,error=NULL WHERE id=?",(json.dumps(history),package_id,generation_task_id))
            db.execute("UPDATE materials SET status='ready' WHERE id=?",(material_id,))
        else:
            db.execute('INSERT INTO packages(id,material_id,path) VALUES(?,?,?)',(package_id,material_id,str(path)))
    return package

def get_package(package_id):
    from .app import connect
    with connect() as db: row=db.execute('SELECT * FROM packages WHERE id=?',(package_id,)).fetchone()
    if row is None: raise HTTPException(404,'练习包不存在')
    return json.loads(Path(row['path']).read_text(encoding='utf-8'))

@router.get('/api/materials/{material_id}/packages')
def list_packages(material_id:str):
    from .app import connect,get_material
    get_material(material_id)
    with connect() as db: rows=db.execute('SELECT id,material_id,created_at FROM packages WHERE material_id=? ORDER BY rowid DESC',(material_id,)).fetchall()
    return [dict(r) for r in rows]

@router.post('/api/materials/{material_id}/packages',status_code=201)
async def import_package(material_id:str,package:UploadFile=File(...)):
    try: return publish_package(material_id,json.loads((await package.read()).decode('utf-8-sig')))
    except (ValueError,TypeError,KeyError,UnicodeDecodeError) as exc: raise HTTPException(422,f'练习包校验失败：{exc}')

@router.get('/api/packages/{package_id}')
def read_package(package_id:str): return get_package(package_id)

@router.get('/api/packages/{package_id}/attempts')
def list_attempts(package_id:str):
    from .app import connect
    get_package(package_id)
    with connect() as db: rows=db.execute('SELECT question_id,record FROM attempts WHERE package_id=?',(package_id,)).fetchall()
    return {row['question_id']:json.loads(row['record']) for row in rows}

class Attempt(Answer):
    generation:int=Field(default=0,ge=0)
    revision:int=Field(default=0,ge=0)
    session_id:str|None=None

@router.put('/api/packages/{package_id}/attempts/{question_id}')
def save_attempt(package_id:str,question_id:str,record:Attempt):
    from .app import connect
    package=get_package(package_id)
    q=next((q for q in package['questions'] if q['id']==question_id),None)
    if q is None: raise HTTPException(404,'题目不存在')
    data=record.model_dump()
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        existing=db.execute('SELECT record FROM attempts WHERE package_id=? AND question_id=?',(package_id,question_id)).fetchone()
        old=None
        if existing:
            old=json.loads(existing['record'])
            if old.get('generation',0)!=data['generation']: raise HTTPException(409,'作答版本已更换，请重新读取题目')
            if old.get('revision',0)>data['revision']: return old
        try: data=validate_answer(q,data,old)
        except ValueError as error: raise HTTPException(422,str(error)) from None
        if old and answer_identity(old)==answer_identity(data):
            from .sessions import resolve
            duplicate_session=resolve(db,package_id,data['session_id'])
            if data['revision']>old.get('revision',0) and (duplicate_session is None or duplicate_session['status']=='open'):
                old={**old,'revision':data['revision']}
                db.execute('UPDATE attempts SET record=? WHERE package_id=? AND question_id=?',(json.dumps(old,ensure_ascii=False),package_id,question_id))
            return old
        from .sessions import writable, record_attempt
        session=writable(db,package_id,data['session_id'])
        if session is not None:data['session_id']=session['id']
        record_attempt(db,session,question_id,data,old)
        encoded=json.dumps(data,ensure_ascii=False)
        db.execute('INSERT INTO attempts(package_id,question_id,record) VALUES(?,?,?) ON CONFLICT(package_id,question_id) DO UPDATE SET record=excluded.record',(package_id,question_id,encoded))
        db.execute('INSERT INTO attempt_history(package_id,question_id,record) VALUES(?,?,?)',(package_id,question_id,encoded))
    return data
