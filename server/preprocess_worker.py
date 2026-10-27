"""One-shot preprocessing pipeline; only validated packages become readable."""
import json
import os
import re
import sys
from .model_adapter import PROMPT_VERSION, ModelError, provenance, request_model, settings
from .package_metadata import PIPELINE_VERSION


def dialogue_units(cues):
    units = []
    pending = []
    skipped = []
    def flush():
        if pending:
            units.append({'id': 'u' + pending[0]['id'], 'source_ids': [cue['id'] for cue in pending],
                          'english': ' '.join(cue['text'].replace('\n', ' ') for cue in pending),
                          'start_ms': pending[0]['start_ms'], 'end_ms': pending[-1]['end_ms']})
            pending.clear()
    for cue in cues:
        lines = cue['text'].splitlines()
        speakers = sum(bool(re.match(r'^\s*[-–—]\s*\S', line)) for line in lines)
        if speakers > 1 or len(re.findall(r'(?:^|\n)[A-Z][A-Za-z ]{0,25}:', cue['text'])) > 1:
            flush()
            skipped.append({'source_id': cue['id'], 'reason': 'multiple_speakers'})
            continue
        if pending and (cue['start_ms'] - pending[-1]['end_ms'] > 700 or len(pending) >= 4):
            flush()
        pending.append(cue)
        if re.search(r'[.!?]["\'’”]?\s*$', cue['text']):
            flush()
    flush()
    return units, skipped


def run(task_id, lease):
    import hashlib
    import threading
    import time
    from collections import Counter
    from .app import connect, get_material, DATA
    from .learning import publish_package, tokenize
    from .processes import process_identity
    directory = DATA / 'jobs' / task_id
    directory.mkdir(parents=True, exist_ok=True)
    stop = threading.Event()

    def ensure_lease():
        with connect() as db:
            row = db.execute('SELECT * FROM preprocessing_tasks WHERE id=?', (task_id,)).fetchone()
        if row is None or row['lease'] != lease or row['status'] not in ('queued', 'running'):
            raise InterruptedError('预处理执行权已撤销')
        return row

    def heartbeat():
        while not stop.is_set():
            try:
                with connect() as db:
                    db.execute("UPDATE preprocessing_tasks SET heartbeat=?,worker_pid=?,worker_identity=? WHERE id=? AND lease=? AND status IN ('queued','running')", (time.time(), os.getpid(), process_identity(os.getpid()), task_id, lease))
            except Exception:
                pass
            stop.wait(.5)

    def stage(name):
        row = ensure_lease()
        history = json.loads(row['stages'])
        if name not in history:
            history.append(name)
        with connect() as db:
            db.execute("UPDATE preprocessing_tasks SET status='running',stage=?,stages=?,heartbeat=? WHERE id=? AND lease=?", (name, json.dumps(history), time.time(), task_id, lease))

    def artifact(name, value):
        ensure_lease()
        path = directory / (name + '.json')
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps({'fingerprint': fingerprint, 'output': value}, ensure_ascii=False), encoding='utf-8')
        temporary.replace(path)

    def cached(name):
        previous_id = task['retry_of']
        seen = set()
        while previous_id and previous_id not in seen:
            seen.add(previous_id)
            path = DATA / 'jobs' / previous_id / (name + '.json')
            try:
                envelope = json.loads(path.read_text(encoding='utf-8'))
                if envelope.get('fingerprint') == fingerprint:
                    return envelope['output']
            except (OSError, ValueError, TypeError, KeyError):
                pass
            with connect() as db:
                previous = db.execute('SELECT retry_of FROM preprocessing_tasks WHERE id=?', (previous_id,)).fetchone()
            previous_id = previous['retry_of'] if previous else None
        return None

    def model_response(name, stage_name, chunk, context, validator):
        reusable = cached(name)
        if reusable is not None:
            try:
                validator(reusable)
                artifact(name, reusable)
                row = ensure_lease()
                reused = json.loads(row['reused_artifacts'])
                reused.append(name)
                with connect() as db:
                    db.execute('UPDATE preprocessing_tasks SET reused_artifacts=? WHERE id=? AND lease=?', (json.dumps(reused), task_id, lease))
                return reusable
            except (ValueError, TypeError, KeyError, AttributeError):
                pass
        last_error, last_code = '模型返回的结构无效', 'INVALID_OUTPUT'
        for attempt in range(config['max_attempts']):
            ensure_lease()
            with connect() as db:
                db.execute('UPDATE preprocessing_tasks SET model_attempts=model_attempts+1 WHERE id=? AND lease=?', (task_id, lease))
            try:
                request_context = {**context, 'previous_validation_error':last_error} if attempt else context
                response = request_model(config, stage_name, [{k:v for k,v in unit.items() if k not in ('start_ms','end_ms')} for unit in chunk], request_context, directory / 'model')
                validator(response)
                artifact(name, response)
                return response
            except ValueError as error:
                last_error = str(error)
                last_code = getattr(error, 'code', 'INVALID_OUTPUT')
            except (TypeError, KeyError, AttributeError):
                last_error = '模型返回的结构无效'
                last_code = 'INVALID_OUTPUT'
        raise ModelError(f'{last_error}（已尝试 {config["max_attempts"]} 次）', last_code)

    heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
    heartbeat_thread.start()
    try:
        task = ensure_lease()
        stage('check')
        config = json.loads(task['config'])
        if 'command' not in config:
            config = settings()  # Reproduce a precise configuration failure, without invoking a model.
        material = get_material(task['material_id'])
        media = DATA / 'media' / material['id'] / 'video.mp4'
        if not media.is_file():
            raise ValueError('本地视频文件不可读，请重新导入素材')
        digest = hashlib.sha256()
        with media.open('rb') as source:
            for block in iter(lambda:source.read(1024*1024), b''):
                digest.update(block)
        from .timing import alignment_identity
        alignment=alignment_identity()
        if not alignment['configured']: raise ValueError('没有可用题目，请更换素材或配置可靠的本地声音对齐；不能仅凭字幕时间发布')
        identity = {'alignment':alignment,'pipeline':PIPELINE_VERSION,'prompt':PROMPT_VERSION,'config':config,'subtitles':material['subtitles'],'video_sha256':digest.hexdigest()}
        command_sources = {}
        from pathlib import Path
        for argument in config['command']:
            path = Path(argument)
            if path.suffix.lower() in ('.py','.js') and path.is_file():
                command_sources[str(path.resolve())] = hashlib.sha256(path.read_bytes()).hexdigest()
        identity['command_sources'] = command_sources
        fingerprint = hashlib.sha256(json.dumps(identity,sort_keys=True,ensure_ascii=False).encode('utf-8')).hexdigest()
        with connect() as db:
            db.execute('UPDATE preprocessing_tasks SET fingerprint=? WHERE id=? AND lease=?', (fingerprint,task_id,lease))
        stage('parse')
        cues = json.loads(material['subtitles'])
        units, skipped = dialogue_units(cues)
        units = [unit for unit in units if len(tokenize(unit['english'])) >= 2]
        artifact('dialogue', {'units':units,'skipped':skipped})
        stage('context')
        size = config['chunk_size']
        overlap = min(4,size-1)
        chunks = [units[index:index+size] for index in range(0,len(units),size-overlap)]
        artifact('context',chunks)
        stage('select')
        selected = set()
        for index,chunk in enumerate(chunks):
            valid_ids = {unit['id'] for unit in chunk}
            def validate_selection(response):
                ids = response.get('selected_ids')
                if not isinstance(ids,list) or any(not isinstance(unit_id,str) for unit_id in ids) or len(set(ids)) != len(ids) or any(unit_id not in valid_ids for unit_id in ids):
                    raise ValueError('模型选句包含重复或不存在的来源')
            response = model_response(f'selection-{index}','select',chunk,{'ordered_dialogue':[{'id':unit['id'],'english':unit['english']} for unit in chunk]},validate_selection)
            selected.update(response['selected_ids'])
        selected_units = [unit for unit in units if unit['id'] in selected]
        # Certify eligibility before spending model calls on translations/cards.
        # Keep the full dialogue as context, but generate only learnable targets.
        from .timing import certify_questions
        scheduled,timing=certify_questions(material['id'],[
            {'id':unit['id'],'source_ids':unit['source_ids'],'english':unit['english']}
            for unit in selected_units],directory)
        schedule={question['id']:question for question in scheduled}
        selected_units=[unit for unit in selected_units if unit['id'] in schedule]
        artifact('timing',timing)
        stage('generate')
        generated = {}
        # Full bilingual cards need much more output than selection IDs. Bound
        # generation separately so a long subtitle chunk cannot become one huge
        # model response; validators still protect reused cache artifacts.
        generation_size = min(size, 4)
        for index in range(0,len(selected_units),generation_size):
            chunk = selected_units[index:index+generation_size]
            expected = {unit['id']:unit for unit in chunk}
            def validate_generation(response):
                questions = response.get('questions')
                if not isinstance(questions,list) or len(questions) != len(chunk):
                    raise ValueError('模型生成资料数量与选句不一致')
                seen = set()
                for question in questions:
                    unit_id = question.get('unit_id') if isinstance(question,dict) else None
                    if not isinstance(unit_id,str) or unit_id not in expected or unit_id in seen:
                        raise ValueError('模型生成资料包含重复或不存在的来源')
                    seen.add(unit_id)
                    unit = expected[unit_id]
                    if question.get('english') != unit['english']:
                        raise ValueError('模型改写了字幕原句')
                    if any(key in question for key in ('pause_ms','start_ms','end_ms')):
                        raise ValueError('模型不得生成音频时间边界')
                    if not isinstance(question.get('chinese'),str) or not question['chinese'].strip():
                        raise ValueError('模型缺少中文题意')
                    tokens = tokenize(unit['english'])
                    if 'tokens' in question and question['tokens'] != tokens:
                        raise ValueError('模型词单元与原句不一致')
                    if 'word_count' in question and (type(question['word_count']) is not int or question['word_count'] != len(tokens)):
                        raise ValueError('模型词数与原句不一致')
                    hints = question.get('hint_indices')
                    if not isinstance(hints,list) or not 0<len(hints)<len(tokens) or any(type(value) is not int or not 0<=value<len(tokens) for value in hints) or len(set(hints)) != len(hints):
                        raise ValueError('模型揭词索引无效')
                    if 'candidates' in question:
                        words = [token['word'] for i,token in enumerate(tokens) if i not in hints]
                        candidates = question['candidates']
                        if not isinstance(candidates,list) or any(not isinstance(value,str) for value in candidates) or Counter(candidates) != Counter(words):
                            raise ValueError('模型候选词数量或重复词与原句不一致')
                    card = question.get('card')
                    if not isinstance(card,dict) or any(not isinstance(card.get(key),str) or not card[key].strip() for key in ('usage','pattern','explanation','example','translation')):
                        raise ValueError('模型句式卡资料不完整')
            context = {'ordered_dialogue':[{'id':unit['id'],'english':unit['english']} for unit in units[max(0,units.index(chunk[0])-2):units.index(chunk[-1])+3]]}
            response = model_response(f'generation-{index}','generate',chunk,context,validate_generation)
            generated.update({question['unit_id']:question for question in response['questions']})
        stage('assemble')
        assembled = []
        for unit in selected_units:
            question = generated[unit['id']]
            assembled.append({'id': unit['id'], 'source_ids': unit['source_ids'], 'english': unit['english'],
                              'chinese': question.get('chinese'), 'hint_indices': question.get('hint_indices'), 'card': question.get('card'),
                              **{key:schedule[unit['id']][key] for key in ('pause_ms','start_ms','end_ms')}})
        if alignment_identity()!=timing['alignment_identity']:
            raise ValueError('声音对齐配置在生成期间变化，未发布练习包')
        if not assembled:
            raise ValueError('没有可用题目，请更换素材；不需要逐题核准时间')
        payload = {'questions':assembled,'provenance':{**provenance(config),'source_material_id':material['id'],'source_cue_ids':[cue['id'] for cue in cues],
                   'timing_method':timing['policy'],'alignment_engine':timing['engine'],'alignment_fixture_only':timing['fixture_only'],'timing_certificates':timing['certificates']}}
        artifact('assembled',payload)
        stage('validate')
        ensure_lease()
        publish_package(material['id'],payload,generation_task_id=task_id,lease=lease,generation_config=config)
    except InterruptedError:
        pass  # The task lease was revoked; an obsolete worker must never publish or overwrite status.
    except Exception as error:
        message = str(error) if isinstance(error,ValueError) else '预处理内部失败；未发布半成品，请检查本地运行环境'
        with connect() as db:
            db.execute("UPDATE preprocessing_tasks SET status='failed',error=?,error_code=?,lease=NULL WHERE id=? AND lease=?",(message,getattr(error,'code',None),task_id,lease))
    finally:
        stop.set()
        heartbeat_thread.join(timeout=1)


if __name__ == '__main__':
    run(sys.argv[1],sys.argv[2])

