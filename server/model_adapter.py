"""Subtitles-only adapters for the distinct Codex and DeepSeek Harness protocols."""
import json
import os
import shutil
import subprocess
from .processes import OwnedProcess

PROMPT_VERSION = 'scene-v1'


class ModelError(ValueError):
    def __init__(self, message, code='INVALID_OUTPUT'):
        super().__init__(message)
        self.code = code


def events(output):
    for line in output.splitlines():
        try:
            event = json.loads(line)
            if isinstance(event, dict):
                yield event
        except json.JSONDecodeError:
            continue


class CodexAdapter:
    command_variable = 'SCENE_CODEX_COMMAND'
    default_command = '["codex"]'

    def configure(self):
        return {}

    def invocation(self, config, directory):
        argv = config['command'] + ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '-C', str(directory), '-m', config['model']]
        if config.get('output_schema'):
            argv += ['--output-schema', config['output_schema']]
        argv += ['-']
        return argv, None

    def final_text(self, output, returncode):
        if returncode:
            raise ModelError('模型入口运行失败；请检查本机配置、登录和可用额度', 'RUN_FAILED')
        final = None
        for event in events(output):
            if event.get('type') in ('turn.failed', 'error'):
                raise ModelError('模型入口返回失败事件；未发布练习包', 'RUN_FAILED')
            item = event.get('item')
            if event.get('type') == 'item.completed' and isinstance(item, dict) and item.get('type') == 'agent_message':
                final = item.get('text')
        return final


class DeepSeekAdapter:
    command_variable = 'SCENE_DSH_COMMAND'
    default_command = '["dsh"]'
    safe_codes = frozenset({'MISSING_CREDENTIAL','INVALID_CREDENTIAL','AUTH','ACCOUNT_SIGN_IN_REQUIRED','ACCOUNT_TOKEN_INVALID','RATE_LIMIT','QUOTA','ACCOUNT_QUOTA','SERVER','TIMEOUT','TRANSPORT','INTERRUPTED','MAX_TOKENS','CONFIG'})

    def configure(self):
        provider = os.environ.get('SCENE_DSH_PROVIDER', '').strip()
        if not provider:
            raise ModelError('请设置 SCENE_DSH_PROVIDER，明确选择 Harness 中的实际供应商', 'CONFIG')
        result = {'model_provider': provider, 'profile': 'headless'}
        if os.environ.get('SCENE_DSH_HOME'):
            result['dsh_home'] = os.environ['SCENE_DSH_HOME']
        return result

    def invocation(self, config, directory):
        patch = directory / 'model.patch.json'
        patch.write_text(json.dumps([{'id':'agent-default-model','config':{'provider':config['model_provider'],'model':config['model']}}], ensure_ascii=False), encoding='utf-8')
        argv = config['command'] + ['--profile', 'headless', '--patch', str(patch.resolve()), '--json', '-']
        env = dict(os.environ)
        env['DSH_PERMISSION_MODE'] = 'read-only'
        env['ELECTRON_RUN_AS_NODE'] = '1'
        env.pop('DSH_SESSION_ID', None)
        if config.get('dsh_home'):
            env['DSH_HOME'] = config['dsh_home']
        return argv, env

    def final_text(self, output, returncode):
        final, ending, code, saw_error = None, None, 'UNKNOWN', False
        for event in events(output):
            kind = event.get('type')
            if kind == 'final':
                final = event.get('text')
            if kind == 'error':
                saw_error = True
            if kind == 'status' and event.get('phase') == 'turn_end':
                reason = event.get('reason')
                if isinstance(reason, dict):
                    ending = reason.get('kind')
                    error = reason.get('error')
                    if isinstance(error, dict) and isinstance(error.get('code'),str) and error['code'] in self.safe_codes:
                        code = error['code']
        if returncode or saw_error or ending != 'completed':
            raise ModelError(f'DeepSeek 入口未完成（{code}）；请检查本机配置和服务状态', code)
        if isinstance(final, str):
            final = final.strip()
            if final.startswith('```') and final.endswith('```'):
                final = '\n'.join(final.splitlines()[1:-1])
        return final


ADAPTERS = {'codex': CodexAdapter(), 'deepseek': DeepSeekAdapter()}


def settings():
    provider = os.environ.get('SCENE_MODEL_PROVIDER', 'codex').strip().lower()
    adapter = ADAPTERS.get(provider)
    if adapter is None:
        raise ModelError('SCENE_MODEL_PROVIDER 必须为 codex 或 deepseek', 'CONFIG')
    try:
        command = json.loads(os.environ.get(adapter.command_variable, adapter.default_command))
    except ValueError:
        raise ModelError(f'{adapter.command_variable} 必须是 argv JSON 数组', 'CONFIG') from None
    if not isinstance(command, list) or not command or any(not isinstance(arg, str) or not arg for arg in command):
        raise ModelError(f'{adapter.command_variable} 必须是非空 argv JSON 数组', 'CONFIG')
    executable=shutil.which(command[0]) or command[0]
    if executable.lower().endswith(('.cmd', '.bat', '.ps1')):
        raise ModelError('请配置原生入口或明确 [node/python, script]，不运行 shell 包装器', 'CONFIG')
    command[0]=executable
    model = os.environ.get('SCENE_MODEL_MODEL', '').strip()
    if not model:
        raise ModelError('请设置 SCENE_MODEL_MODEL 和本机模型入口；不会自动调用未配置模型', 'CONFIG')
    timeout = float(os.environ.get('SCENE_MODEL_TIMEOUT', '120'))
    if not 1 <= timeout <= 3600:
        raise ModelError('模型超时必须为 1–3600 秒', 'CONFIG')
    return {'provider':provider, 'model':model, 'timeout':timeout, 'command':command,
            'max_attempts':max(1,min(3,int(os.environ.get('SCENE_MODEL_MAX_ATTEMPTS','2')))),
            'chunk_size':max(2,min(100,int(os.environ.get('SCENE_CONTEXT_CHUNK_SIZE','40')))), **adapter.configure()}


def provenance(config):
    result = {'provider': config['provider'], 'model': config['model'], 'prompt_version': PROMPT_VERSION}
    if config['provider'] == 'deepseek':
        result.update(provider_id=config['model_provider'], harness_profile=config['profile'])
    return result


def request_model(config, stage, units, context, directory):
    directory.mkdir(parents=True, exist_ok=True)
    request = {'prompt_version':PROMPT_VERSION, 'stage':stage, 'units':units, 'context':context, 'expected_unit_ids':[unit['id'] for unit in units],
               'expected_question_count':len(units) if stage=='generate' else None,
               'instructions':'Return JSON only. Select reusable natural expressions, not greetings or visual-dependent lines. Never rewrite English or invent audio times. For select return {selected_ids:[unit id]}. For generate, produce exactly one question per item in units, in units order. Context is reference only: never create questions for context entries outside units. The question count MUST equal expected_question_count and unit_id values MUST match expected_unit_ids exactly once each. Copy English verbatim from the corresponding unit. Return {questions:[{unit_id,english,chinese,hint_indices,card:{usage,pattern,explanation,example,translation}}]}. hint_indices must reveal a nonempty proper subset of deterministic word units; contractions and hyphens count as one. Do not call tools or read files.'}
    adapter = ADAPTERS[config['provider']]
    invocation_config = config
    if config['provider'] == 'codex' and stage == 'generate':
        # This enforces the existing validator contract at the model boundary.
        string = {'type':'string'}
        card = {'type':'object','properties':{key:string for key in ('usage','pattern','explanation','example','translation')},
                'required':['usage','pattern','explanation','example','translation'],'additionalProperties':False}
        question = {'type':'object','properties':{
            'unit_id':{'type':'string','enum':[unit['id'] for unit in units]},
            'english':{'type':'string','enum':list(dict.fromkeys(unit['english'] for unit in units))},
            'chinese':string,'hint_indices':{'type':'array','items':{'type':'integer'}},'card':card},
            'required':['unit_id','english','chinese','hint_indices','card'],'additionalProperties':False}
        schema = {'type':'object','properties':{'questions':{'type':'array','items':question,'minItems':len(units),'maxItems':len(units)}},
                  'required':['questions'],'additionalProperties':False}
        schema_path = directory / 'output-schema.json'
        schema_path.write_text(json.dumps(schema,ensure_ascii=False),encoding='utf-8')
        invocation_config = {**config, 'output_schema':str(schema_path.resolve())}
    argv, env = adapter.invocation(invocation_config, directory)
    try:
        child = OwnedProcess(argv, cwd=str(directory), env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding='utf-8', shell=False)
        try:
            output, _ = child.process.communicate(json.dumps(request, ensure_ascii=False), timeout=config['timeout'])
            returncode = child.process.returncode
        except subprocess.TimeoutExpired:
            child.stop()
            child.process.communicate()
            raise
        finally:
            child.close()
    except subprocess.TimeoutExpired:
        raise ModelError('模型调用超时；未发布练习包', 'TIMEOUT') from None
    except OSError:
        raise ModelError('模型入口无法启动；请检查本机 argv 配置', 'START_FAILED') from None
    final = adapter.final_text(output, returncode)
    try:
        if not isinstance(final, str):
            raise ValueError()
        response = json.loads(final)
        if not isinstance(response, dict):
            raise ValueError()
        return response
    except (ValueError, TypeError):
        raise ModelError('模型返回的 JSON 结构无效；未发布练习包') from None
