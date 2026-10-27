"""Peppa generation fixture: the only selected expression is a known literal."""
import json,sys
request=json.loads(sys.stdin.read())
assert request['stage'] in ('select','generate')
expected='Have you just had a bath?'
if request['stage']=='select':response={'selected_ids':[unit['id'] for unit in request['units'] if unit['english']==expected]}
else:
    response={'questions':[{'unit_id':unit['id'],'english':expected,'chinese':'你刚洗过澡吗？','hint_indices':[0],'card':{'usage':'询问刚完成的事情','pattern':'Have you just + 过去分词','explanation':'用现在完成时询问刚结束的动作。','example':'Have you just had lunch?','translation':'你刚吃过午饭吗？'}} for unit in request['units'] if unit['english']==expected]}
print(json.dumps({'type':'item.completed','item':{'type':'agent_message','text':json.dumps(response,ensure_ascii=False)}}))
