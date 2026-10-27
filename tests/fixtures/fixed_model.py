"""External Codex response fixture; fault injection stays outside the application."""
import json, os, signal, sys, time
from pathlib import Path
def crash_owner():
    owner=os.getppid()
    if os.name=='nt':
        # A Windows venv executable is a launcher; skip that wrapper to reach its actual caller.
        import ctypes as c
        from ctypes import wintypes as w
        kernel=c.WinDLL('kernel32',use_last_error=True)
        class Entry(c.Structure):
            _fields_=[('size',w.DWORD),('usage',w.DWORD),('pid',w.DWORD),('heap',c.c_size_t),('module',w.DWORD),('threads',w.DWORD),('parent',w.DWORD),('priority',w.LONG),('flags',w.DWORD),('exe',w.WCHAR*260)]
        kernel.CreateToolhelp32Snapshot.argtypes=[w.DWORD,w.DWORD];kernel.CreateToolhelp32Snapshot.restype=w.HANDLE
        kernel.Process32FirstW.argtypes=[w.HANDLE,c.POINTER(Entry)];kernel.Process32NextW.argtypes=[w.HANDLE,c.POINTER(Entry)]
        kernel.OpenProcess.argtypes=[w.DWORD,w.BOOL,w.DWORD];kernel.OpenProcess.restype=w.HANDLE
        kernel.QueryFullProcessImageNameW.argtypes=[w.HANDLE,w.DWORD,w.LPWSTR,c.POINTER(w.DWORD)];kernel.CloseHandle.argtypes=[w.HANDLE]
        handle=kernel.OpenProcess(0x1000,False,owner);image=c.create_unicode_buffer(32768);length=w.DWORD(len(image))
        launcher=bool(handle and kernel.QueryFullProcessImageNameW(handle,0,image,c.byref(length)) and Path(image.value).resolve()==Path(sys.executable).resolve())
        if handle:kernel.CloseHandle(handle)
        if launcher:
            snapshot=kernel.CreateToolhelp32Snapshot(2,0);entry=Entry();entry.size=c.sizeof(entry);more=kernel.Process32FirstW(snapshot,c.byref(entry))
            while more:
                if entry.pid==owner:owner=entry.parent;break
                more=kernel.Process32NextW(snapshot,c.byref(entry))
            kernel.CloseHandle(snapshot)
    os.kill(owner,signal.SIGTERM)
assert sys.argv[1] == 'exec' and sys.argv[sys.argv.index('-s')+1] == 'read-only'
request=json.loads(sys.stdin.read())
if any(key in request for key in ('video','video_path','media')): raise RuntimeError('media must not be sent to model')
fault_case=any(unit['english'].startswith('Fault ') for unit in request['units'])
control=Path(os.environ.get('SCENE_FAULT_CONTROL','unused-control.json'))
mode=json.loads(control.read_text()).get('mode','healthy') if fault_case and control.is_file() else 'healthy'
if request['stage']=='select':
    response={'selected_ids':[unit['id'] for unit in request['units']]}
else:
    if mode=='timeout': time.sleep(5)
    if mode=='exception': sys.exit(2)
    if mode=='crash_worker': crash_owner();time.sleep(5)
    translations={"Don't re-enter, please.":'请不要再次进入。','Try it again.':'再试一次。'}
    response={'questions':[{'unit_id':unit['id'],'english':unit['english'],'chinese':'请清楚地表达。' if fault_case else translations[unit['english']],'hint_indices':[0],'card':{'usage':'提出请求或鼓励','pattern':'动词原形 / please','explanation':'结合前后文选择礼貌表达。','example':'Try this again.','translation':'再试试这个。'}} for unit in request['units']]}
    first=response['questions'][0]
    if mode=='shape': response={'questions':'not-a-list'}
    if mode=='rewrite': first['english']='The model changed the source.'
    if mode=='duplicate': response['questions'][-1]=dict(first)
    if mode=='index': first['hint_indices']=[999]
    if mode=='word_count': first['word_count']=999
    if mode=='tokens': first['tokens']=[]
    if mode=='candidates': first['candidates']=['unrequested','extra']
    if mode=='card': first['card'].pop('example')
text='{broken' if mode=='malformed' and request['stage']=='generate' else json.dumps(response,ensure_ascii=False)
print(json.dumps({'type':'item.completed','item':{'type':'agent_message','text':text}}))
