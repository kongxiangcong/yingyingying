"""Conservative semantic word correspondence plus acoustic pause certification.

Silence alone never proves a sentence boundary. Without an explicitly configured
independent local recognizer, publication fails closed. Recognition probabilities
and timestamp padding are policy heuristics and retain their evidence limits.
"""
import hashlib,json,math,os,re,subprocess
from pathlib import Path
from .learning import normalize,tokenize

POLICY_VERSION='independent-words-quiet-gap-v1'
MIN_CONFIDENCE=.85
QUIET_DB=-42


def alignment_identity():
    raw=os.environ.get('SCENE_ALIGNMENT_COMMAND','')
    if not raw:return {'policy':POLICY_VERSION,'configured':False}
    try:command=json.loads(raw)
    except (ValueError,TypeError):raise ValueError('声音对齐入口必须是 argv JSON 数组') from None
    if not isinstance(command,list) or not command or any(not isinstance(x,str) or not x for x in command):raise ValueError('声音对齐入口必须是非空 argv JSON 数组')
    if command[0].lower().endswith(('.cmd','.bat','.ps1')):raise ValueError('声音对齐不运行 shell 包装器')
    sources=[]
    for arg in command:
        path=Path(arg)
        if path.is_file() and path.suffix.lower() in ('.py','.js','.json'):sources.append(hashlib.sha256(path.read_bytes()).hexdigest())
        if path.is_dir():
            for candidate in [path/'model.bin',path/'config.json',*path.glob('faster_whisper-*.dist-info/METADATA'),*path.glob('ctranslate2-*.dist-info/METADATA')]:
                if candidate.is_file():sources.append(hashlib.sha256(candidate.read_bytes()).hexdigest())
    return {'policy':POLICY_VERSION,'configured':True,'command_hash':hashlib.sha256(raw.encode()).hexdigest(),'sources':sources,'profile':os.environ.get('SCENE_ALIGNMENT_PROFILE','normal')}


def acoustic_audio(video:Path,directory:Path):
    from .app import FFMPEG
    directory.mkdir(parents=True,exist_ok=True);audio=directory/'alignment.wav'
    try:
        result=subprocess.run([FFMPEG,'-hide_banner','-y','-i',str(video),'-vn','-af',f'aresample=16000,aformat=channel_layouts=mono,silencedetect=noise={QUIET_DB}dB:d=0.08','-c:a','pcm_s16le',str(audio)],capture_output=True,encoding='utf-8',errors='replace',timeout=120)
    except (OSError,subprocess.TimeoutExpired):raise ValueError('声音检查失败：无法本机解码音轨') from None
    if result.returncode or not audio.is_file():raise ValueError('声音检查失败：无法本机解码音轨')
    silence=[];start=None
    for line in result.stderr.splitlines():
        begin=re.search(r'silence_start: ([0-9.]+)',line);end=re.search(r'silence_end: ([0-9.]+)',line)
        if begin:start=round(float(begin[1])*1000)
        if end and start is not None:silence.append((start,round(float(end[1])*1000)));start=None
    return audio,silence


def request_alignment(audio:Path,video:Path,duration_ms:int):
    identity=alignment_identity()
    if not identity['configured']:raise ValueError('没有可用题目，请更换素材或配置可靠的本地声音对齐；不能仅凭字幕时间发布')
    command=json.loads(os.environ['SCENE_ALIGNMENT_COMMAND'])
    audio_hash=hashlib.sha256(audio.read_bytes()).hexdigest()
    request={'schema_version':1,'audio_path':str(audio.resolve()),'audio_sha256':audio_hash,'source_media_sha256':hashlib.sha256(video.read_bytes()).hexdigest(),'duration_ms':duration_ms}
    try:
        #09's process owner contains descendants when available, including timeout.
        try:from .processes import OwnedProcess
        except ImportError:OwnedProcess=None
        timeout=float(os.environ.get('SCENE_ALIGNMENT_TIMEOUT','300'))
        if not math.isfinite(timeout) or not 1<=timeout<=900:raise ValueError('声音对齐超时必须在 1–900 秒')
        if OwnedProcess is not None:
            owner=OwnedProcess(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,encoding='utf-8')
            try:
                try:stdout,_=owner.process.communicate(json.dumps(request),timeout=timeout)
                except subprocess.TimeoutExpired:owner.stop();raise
                if owner.process.returncode:raise ValueError('本地声音对齐入口失败，未发布练习包')
            finally:owner.close()
        else:
            child=subprocess.run(command,input=json.dumps(request),capture_output=True,encoding='utf-8',timeout=timeout,shell=False)
            if child.returncode:raise ValueError('本地声音对齐入口失败，未发布练习包')
            stdout=child.stdout
    except subprocess.TimeoutExpired:raise ValueError('本地声音对齐超时，未发布练习包') from None
    except OSError:raise ValueError('本地声音对齐入口无法启动，未发布练习包') from None
    try:response=json.loads(stdout)
    except (ValueError,TypeError):raise ValueError('本地声音对齐返回无效 JSON') from None
    if not isinstance(response,dict) or response.get('method')!='independent_asr' or response.get('audio_sha256')!=audio_hash:raise ValueError('声音对齐来源或方法不符，不能确认首词边界')
    uncertainty=response.get('timing_uncertainty_ms');words=response.get('words')
    if type(uncertainty) is not int or not 0<=uncertainty<=600 or not isinstance(words,list):raise ValueError('声音对齐缺少可校验的逐词时间')
    previous=-1
    for word in words:
        if not isinstance(word,dict) or not isinstance(word.get('word'),str):raise ValueError('声音对齐词结构非法')
        start,end,confidence=word.get('start_ms'),word.get('end_ms'),word.get('confidence')
        if type(start) is not int or type(end) is not int or not 0<=start<=end<=duration_ms or start<previous or type(confidence) not in (int,float) or not math.isfinite(confidence) or not 0<=confidence<=1:raise ValueError('声音对齐时间或置信度非法')
        if ('speaker' in word and word['speaker'] is not None and not isinstance(word['speaker'],str)) or ('overlap' in word and type(word['overlap']) is not bool):raise ValueError('声音对齐说话人结构非法')
        previous=start
        tokens=tokenize(word['word'])
        word['normalized']=normalize(tokens[0]['word']) if len(tokens)==1 and end>start else None
    return response


def certify_questions(material_id,questions,directory=None):
    from .app import DATA,get_material
    material=get_material(material_id);video=DATA/'media'/material_id/'video.mp4'
    identity=alignment_identity()
    if not identity['configured']:raise ValueError('没有可用题目，请更换素材或配置可靠的本地声音对齐；不能仅凭字幕时间发布')
    directory=Path(directory) if directory else DATA/'timing'/material_id
    audio,silences=acoustic_audio(video,directory)
    response=request_alignment(audio,video,material['duration_ms'])
    (directory/'alignment-result.json').write_text(json.dumps(response,ensure_ascii=False,indent=2),encoding='utf-8')
    if alignment_identity()!=identity:raise ValueError('声音对齐配置在处理期间变化，未发布练习包')
    words=response['words'];recognized=[w['normalized'] for w in words]
    uncertainty=max(250,response['timing_uncertainty_ms']);accepted=[];skipped=[];certificates=[]
    for question in questions:
        expected=[normalize(t['word']) for t in tokenize(question['english'])]
        matches=[i for i in range(len(words)-len(expected)+1) if recognized[i:i+len(expected)]==expected]
        if len(matches)!=1:skipped.append({'question_id':question['id'],'reason':'ambiguous_or_missing_transcript'});continue
        index=matches[0];matched=words[index:index+len(expected)];first=matched[0]['start_ms'];last=matched[-1]['end_ms']
        speakers={w['speaker'] for w in matched if w.get('speaker') is not None}
        if len(speakers)>1 or any(w.get('overlap') is True for w in matched):skipped.append({'question_id':question['id'],'reason':'multiple_or_overlapping_speakers'});continue
        if any(w['confidence']<MIN_CONFIDENCE for w in matched):skipped.append({'question_id':question['id'],'reason':'low_recognition_confidence'});continue
        previous_end=max((w['end_ms'] for w in words[:index]),default=0)
        if first<previous_end or any(a['end_ms']>b['start_ms'] for a,b in zip(matched,matched[1:])):skipped.append({'question_id':question['id'],'reason':'overlapping_words'});continue
        if any(b['start_ms']-a['end_ms']>1200 for a,b in zip(matched,matched[1:])):skipped.append({'question_id':question['id'],'reason':'discontinuous_transcript'});continue
        gaps=[]
        for start,end in silences:
            # Keep both an acoustic clearance after prior audio and an independent
            # word-time clearance before the first target. No within-sentence gap.
            left=max(start+120,previous_end+uncertainty+120)
            right=min(end-120,first-uncertainty-150)
            if right-left>=80 and end>=first-uncertainty and start<first:gaps.append((left,right,start,end))
        if not gaps:skipped.append({'question_id':question['id'],'reason':'no_safe_quiet_gap'});continue
        left,right,start,end=max(gaps,key=lambda gap:gap[1]);pause=(left+right)//2
        if accepted and pause<=accepted[-1]['end_ms']:skipped.append({'question_id':question['id'],'reason':'schedule_overlap'});continue
        accepted.append({**question,'pause_ms':pause,'start_ms':first,'end_ms':last})
        certificates.append({'question_id':question['id'],'first_word_ms':first,'previous_word_end_ms':previous_end,'quiet_start_ms':start,'quiet_end_ms':end,'pause_ms':pause,'timestamp_padding_ms':uncertainty,'min_word_confidence':min(w['confidence'] for w in matched)})
    evidence={'policy':POLICY_VERSION,'quiet_db':QUIET_DB,'engine':response.get('engine','unknown'),'fixture_only':bool(response.get('fixture_only',False)),'audio_sha256':response['audio_sha256'],'certificates':certificates,'skipped':skipped,'alignment_identity':identity}
    (directory/'timing-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
    if not accepted:raise ValueError('没有可用题目，请更换素材；声音对齐或静音边界无法可靠确认，不需要逐题核准')
    return accepted,evidence
