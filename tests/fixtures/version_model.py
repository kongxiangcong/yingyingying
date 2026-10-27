"""Version-history test response at the external model boundary only."""
import json
import os
import sys
from pathlib import Path

assert sys.argv[1] == 'exec' and sys.argv[sys.argv.index('-s') + 1] == 'read-only'
request = json.loads(sys.stdin.read())
assert not any(key in request for key in ('video', 'video_path', 'media'))
control = json.loads(Path(os.environ['SCENE_VERSION_CONTROL']).read_text(encoding='utf-8'))
if request['stage'] == 'select':
    response = {'selected_ids': [unit['id'] for unit in request['units']]}
elif control.get('fail'):
    response = {'questions': 'invalid fixture response'}
else:
    tag = control['tag']
    response = {'questions': [{'unit_id': unit['id'], 'english': unit['english'], 'chinese': f'{tag}题意 {unit["id"]}', 'hint_indices': [0], 'card': {'usage': f'{tag}用途', 'pattern': '动词原形', 'explanation': f'{tag}结构说明', 'example': f'{tag} example.', 'translation': f'{tag}迁移译文'}} for unit in request['units']]}
print(json.dumps({'type': 'item.completed', 'item': {'type': 'agent_message', 'text': json.dumps(response, ensure_ascii=False)}}))
