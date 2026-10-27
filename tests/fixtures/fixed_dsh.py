"""External DSH event fixture, intentionally different from Codex's JSON protocol."""
import json, os, sys
from pathlib import Path
assert '--profile' in sys.argv and sys.argv[sys.argv.index('--profile')+1]=='headless'
assert '--json' in sys.argv and sys.argv[-1]=='-'
assert os.environ['DSH_PERMISSION_MODE']=='read-only' and 'DSH_SESSION_ID' not in os.environ
patch=json.loads(Path(sys.argv[sys.argv.index('--patch')+1]).read_text())
assert patch==[{'id':'agent-default-model','config':{'provider':'fixture-deepseek-provider','model':'fixture-deepseek-model'}}]
request=json.loads(sys.stdin.read());control=Path(os.environ.get('SCENE_DSH_FAULT_CONTROL','unused.json'))
mode=json.loads(control.read_text()).get('mode','healthy') if control.is_file() else 'healthy'
if mode in ('auth','unknown'):
    print(json.dumps({'type':'status','phase':'turn_end','reason':{'kind':'error','error':{'code':'AUTH' if mode=='auth' else 'fixture-secret-token-must-never-be-exposed','message':'fixture-secret-token-must-never-be-exposed'}}}))
    sys.exit(1)
if request['stage']=='select':response={'selected_ids':[unit['id'] for unit in request['units']]}
else:
    translations={"Don't re-enter, please.":'请不要再次进入。','Try it again.':'再试一次。'}
    response={'questions':[{'unit_id':unit['id'],'english':unit['english'],'chinese':translations[unit['english']],'hint_indices':[0],'card':{'usage':'提出请求或鼓励','pattern':'动词原形 / please','explanation':'结合前后文选择礼貌表达。','example':'Try this again.','translation':'再试试这个。'}} for unit in request['units']]}
print(json.dumps({'type':'session','sessionId':'fixture-dsh-session'}))
print(json.dumps({'type':'final','text':'```json\n'+json.dumps(response,ensure_ascii=False)+'\n```'}))
if mode!='no_end':print(json.dumps({'type':'status','phase':'turn_end','reason':{'kind':'completed'}}))
