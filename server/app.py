from pathlib import Path
import json, os, re, sqlite3, subprocess, uuid
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import StreamingResponse, FileResponse

DATA = Path(os.environ.get('SCENE_DATA_DIR', '.data')).resolve()
DATA.mkdir(parents=True, exist_ok=True)
FFMPEG = os.environ.get('FFMPEG_PATH', next((str(parent / '.local-tools/bin/ffmpeg.exe') for parent in Path(__file__).resolve().parents if (parent / '.local-tools/bin/ffmpeg.exe').exists()), 'ffmpeg'))

def connect():
    conn = sqlite3.connect(DATA / 'scene.sqlite3')
    conn.row_factory = sqlite3.Row
    conn.execute('CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, name TEXT, duration_ms INTEGER, status TEXT, subtitles TEXT)')
    conn.execute('CREATE TABLE IF NOT EXISTS packages (id TEXT PRIMARY KEY, material_id TEXT NOT NULL, path TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)')
    conn.execute('CREATE TABLE IF NOT EXISTS attempts (package_id TEXT NOT NULL, question_id TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(package_id,question_id))')
    conn.execute('CREATE TABLE IF NOT EXISTS attempt_history (id INTEGER PRIMARY KEY, package_id TEXT NOT NULL, question_id TEXT NOT NULL, record TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)')
    conn.execute('CREATE TABLE IF NOT EXISTS programs (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)')
    conn.execute('CREATE TABLE IF NOT EXISTS material_programs (material_id TEXT PRIMARY KEY, program_id TEXT NOT NULL)')
    return conn

app = FastAPI(title='原句重构练习')

def timestamp(value):
    match=re.fullmatch(r'(?:(\d{2,}):)?([0-5]\d):([0-5]\d)[.,](\d{3})',value)
    if not match: raise ValueError('字幕时间格式错误')
    h,m,s,ms=match.groups()
    return (int(h or 0)*3600+int(m)*60+int(s))*1000+int(ms)

def parse_subtitles(raw, duration):
    try: text = raw.decode('utf-8-sig')
    except UnicodeDecodeError: raise ValueError('字幕必须为 UTF-8 编码')
    result=[]
    for block in re.split(r'\n\s*\n', text.replace('\r\n','\n').strip()):
        lines=block.splitlines()
        timing=next((i for i,l in enumerate(lines) if '-->' in l),None)
        if timing is None:
            if block.startswith(('WEBVTT','NOTE','STYLE')): continue
            raise ValueError('字幕格式错误：缺少时间范围')
        start,end=lines[timing].split('-->',1)
        start,end=timestamp(start.strip()),timestamp(end.strip().split()[0])
        content='\n'.join(lines[timing+1:]).strip()
        if not content: raise ValueError('字幕内容为空')
        if start < 0 or end <= start or end > duration or (result and start < result[-1]['start_ms']):
            raise ValueError('字幕时间顺序或视频时长范围错误')
        result.append({'id':str(len(result)+1),'start_ms':start,'end_ms':end,'text':re.sub('<[^>]+>','',content)})
    if not result: raise ValueError('没有可用字幕')
    return result

def get_material(material_id):
    with connect() as db: row=db.execute('SELECT * FROM materials WHERE id=?',(material_id,)).fetchone()
    if row is None: raise HTTPException(404,'素材不存在')
    return dict(row)

@app.get('/api/materials')
def list_materials():
    from .progress import progress_table
    with connect() as db:
        progress_table(db)
        rows=db.execute('SELECT id,name,duration_ms,status FROM materials ORDER BY rowid DESC').fetchall()
        result=[]
        for row in rows:
            item=dict(row)
            membership=db.execute('SELECT program_id FROM material_programs WHERE material_id=?',(row['id'],)).fetchone()
            item['program_id']=membership['program_id'] if membership else ('peppa' if re.search(r'peppa|佩奇|粉红猪|george pig',row['name'],re.I) else '')
            versions=[version['id'] for version in db.execute('SELECT id FROM packages WHERE material_id=? ORDER BY rowid',(row['id'],))]
            activity=db.execute('SELECT package_id,position_ms FROM learning_activity WHERE material_id=?',(row['id'],)).fetchone()
            if activity and activity['package_id'] in versions:
                item['learning_position']={'package_id':activity['package_id'],'version_number':versions.index(activity['package_id'])+1,'position_ms':activity['position_ms']}
            else:
                legacy=db.execute('SELECT p.package_id,p.record FROM progress p JOIN packages v ON v.id=p.package_id WHERE v.material_id=?',(row['id'],)).fetchall()
                if legacy:
                    saved=max(legacy,key=lambda entry:json.loads(entry['record']).get('revision',0))
                    item['learning_position']={'package_id':saved['package_id'],'version_number':versions.index(saved['package_id'])+1,'position_ms':json.loads(saved['record'])['position_ms']}
                else:item['learning_position']=None
            result.append(item)
    return result

@app.post('/api/materials',status_code=201)
async def import_material(video: UploadFile=File(...), subtitles: UploadFile | None=File(None), program_id: str=Form('')):
    material_id=uuid.uuid4().hex
    folder=DATA / 'media' / material_id
    folder.mkdir(parents=True)
    target=folder/'video.mp4'
    try:
        with target.open('wb') as dest:
            while chunk:=await video.read(1024*1024): dest.write(chunk)
        try: probe=subprocess.run([FFMPEG,'-hide_banner','-i',str(target)],capture_output=True,text=True,timeout=30)
        except (OSError, subprocess.TimeoutExpired): raise ValueError('无法检查媒体：请安装 FFmpeg 或设置 FFMPEG_PATH')
        info=probe.stderr
        if not re.search(r'Input #0,.*(?:mov|mp4)',info) or not re.search(r'Video: h264\b',info) or not re.search(r'Audio: aac\b',info):
            raise ValueError('仅支持实际编码为 H.264 视频和 AAC 音频的 MP4')
        duration_match=re.search(r'Duration: (\d+:\d+:\d+\.\d+)',info)
        if not duration_match: raise ValueError('无法读取视频时长')
        duration=round(sum(float(n)*scale for n,scale in zip(duration_match.group(1).split(':'),[3600,60,1]))*1000)
        subtitle_bytes=await subtitles.read() if subtitles and subtitles.filename else b''
        if not subtitle_bytes:
            # Select a declared English track, never silently use another language.
            tracks=re.findall(r'Stream #0:(\d+)(?:\[[^\]]+\])?\((eng|en)\): Subtitle: ([^,\s]+)',info)
            if not tracks: raise ValueError('未找到内嵌英文文本字幕。若字幕已烧录在画面中，请同时上传英文 SRT 或 VTT 文件。')
            try:
                extracted=subprocess.run([FFMPEG,'-v','error','-i',str(target),'-map',f'0:{tracks[0][0]}','-f','srt','-'],capture_output=True,timeout=60)
            except (OSError, subprocess.TimeoutExpired): raise ValueError('内嵌字幕提取失败，请补充英文 SRT 或 VTT 文件后重试。')
            if extracted.returncode or not extracted.stdout: raise ValueError('此字幕轨无法转换为文本，请补充英文 SRT 或 VTT 文件。')
            subtitle_bytes=extracted.stdout
        cues=parse_subtitles(subtitle_bytes,duration)
        (folder/'subtitles.source').write_bytes(subtitle_bytes)
        with connect() as db:
            if isinstance(program_id,str) and program_id and program_id!='peppa' and not db.execute('SELECT 1 FROM programs WHERE id=?',(program_id,)).fetchone(): raise ValueError('节目不存在，请重新选择')
            db.execute('INSERT INTO materials VALUES(?,?,?,?,?)',(material_id,Path(video.filename or '视频.mp4').name,duration,'imported',json.dumps(cues,ensure_ascii=False)))
            if isinstance(program_id,str) and program_id: db.execute('INSERT INTO material_programs VALUES(?,?)',(material_id,program_id))
        return {k:v for k,v in get_material(material_id).items() if k!='subtitles'}
    except ValueError as exc:
        target.unlink(missing_ok=True)
        (folder/'subtitles.source').unlink(missing_ok=True)
        folder.rmdir()
        raise HTTPException(422,str(exc))

@app.get('/api/programs')
def list_programs():
    with connect() as db: return [{'id':'peppa','name':'小猪佩奇'},*[dict(row) for row in db.execute('SELECT * FROM programs ORDER BY rowid')]]

@app.post('/api/programs',status_code=201)
async def create_program(request:Request):
    body=await request.json();name=str(body.get('name','')).strip()
    if not name or len(name)>80: raise HTTPException(422,'节目名称应为 1–80 个字符')
    if name=='小猪佩奇': raise HTTPException(409,'节目已存在')
    item={'id':uuid.uuid4().hex,'name':name}
    try:
        with connect() as db: db.execute('INSERT INTO programs VALUES(?,?)',(item['id'],name))
    except sqlite3.IntegrityError: raise HTTPException(409,'节目已存在')
    return item

@app.put('/api/materials/{material_id}/program')
async def assign_program(material_id:str,request:Request):
    get_material(material_id);body=await request.json();program_id=body.get('program_id','')
    if not isinstance(program_id,str): raise HTTPException(422,'节目格式错误')
    with connect() as db:
        if program_id and program_id!='peppa' and not db.execute('SELECT 1 FROM programs WHERE id=?',(program_id,)).fetchone(): raise HTTPException(422,'节目不存在')
        db.execute('INSERT OR REPLACE INTO material_programs VALUES(?,?)',(material_id,program_id))
    return {'program_id':program_id}

@app.get('/api/materials/{material_id}/poster')
def poster(material_id:str):
    item=get_material(material_id);folder=DATA/'media'/material_id;target=folder/'poster.jpg'
    if not target.exists():
        try:
            result=subprocess.run([FFMPEG,'-v','error','-ss',str(min(5,item['duration_ms']/2000)),'-i',str(folder/'video.mp4'),'-frames:v','1','-vf','scale=640:-2','-f','image2pipe','-vcodec','mjpeg','-'],capture_output=True,timeout=20)
            if result.returncode or not result.stdout: raise HTTPException(404,'封面暂不可用')
            target.write_bytes(result.stdout)
        except (OSError,subprocess.TimeoutExpired): raise HTTPException(404,'封面暂不可用')
    return FileResponse(target,media_type='image/jpeg')

@app.get('/api/materials/{material_id}/subtitles')
def subtitles(material_id:str): return json.loads(get_material(material_id)['subtitles'])

@app.get('/api/materials/{material_id}/media')
def media(material_id:str,request:Request):
    get_material(material_id)
    path=DATA/'media'/material_id/'video.mp4'
    total=path.stat().st_size
    start,end=0,total-1
    range_value=request.headers.get('range')
    if range_value:
        match=re.fullmatch(r'bytes=(\d*)-(\d*)',range_value)
        if not match or not any(match.groups()): raise HTTPException(416,headers={'Content-Range':f'bytes */{total}'})
        first,last=match.groups()
        if not first: start=max(0,total-int(last))
        else: start=int(first); end=min(total-1,int(last)) if last else total-1
        if start > end or start >= total: raise HTTPException(416,headers={'Content-Range':f'bytes */{total}'})
    def chunks():
        with path.open('rb') as src:
            src.seek(start)
            left=end-start+1
            while left:
                chunk=src.read(min(left,1024*1024))
                if not chunk: break
                left-=len(chunk)
                yield chunk
    headers={'Accept-Ranges':'bytes','Content-Length':str(end-start+1)}
    if range_value: headers['Content-Range']=f'bytes {start}-{end}/{total}'
    return StreamingResponse(chunks(),status_code=206 if range_value else 200,media_type='video/mp4',headers=headers)

from .learning import router as learning_router
app.include_router(learning_router)

from .progress import router as progress_router
app.include_router(progress_router)

from .reports import router as reports_router
app.include_router(reports_router)
from .notebook import router as notebook_router
app.include_router(notebook_router)
from .sessions import router as sessions_router
app.include_router(sessions_router)
from .preprocessing import router as preprocessing_router
app.include_router(preprocessing_router)
