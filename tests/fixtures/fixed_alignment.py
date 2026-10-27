"""Artificial word-time fixtures. This is not a recognizer and is never a runtime default."""
import json,os,sys
from pathlib import Path
request=json.loads(sys.stdin.read())
assert not any(key in request for key in ('units','questions','subtitles','transcript'))
profile=os.environ.get('SCENE_ALIGNMENT_PROFILE','normal')
control=Path(os.environ.get('SCENE_FAULT_CONTROL','unused-control.json'))
if profile=='normal' and control.is_file():profile=json.loads(control.read_text()).get('alignment_profile','normal')
if '--profile' in sys.argv:profile=sys.argv[sys.argv.index('--profile')+1]
words=[]
def phrase(text,start,end):
    parts=text.split();width=(end-start)//len(parts)
    for index,word in enumerate(parts):words.append({'word':word,'start_ms':start+index*width,'end_ms':end if index==len(parts)-1 else start+(index+1)*width,'confidence':.999})
if profile=='peppa':
    assert request['source_media_sha256']=='1404e0ef7d06670b6214e51e5d91297f445eb777e596ac855f3dcaa479f5c87d'
    # Historical diagnostic times, deliberately labeled fixed fixture; not runtime authority.
    phrase('No, Daddy.',197120,198140)
    for word,start,end in [('Have',199540,199640),('you',199640,199800),('just',199800,199960),('had',199960,200080),('a',200080,200280),('bath?',200280,200660)]:
        words.append({'word':word,'start_ms':start,'end_ms':end,'confidence':.999})
else:
    if profile!='tight':assert request['source_media_sha256']=='2ea4cbec57ad5373c0d8fa5f8bb16d0920f1787dadd8501318f1581c8c851701'
    phrase('Previous.',1600 if profile=='tight' else 200,2180 if profile=='tight' else 500)
    if profile=='faults':phrase('Fault proof phrase.',2200,2700);phrase('Fault recovery phrase.',5200,5700)
    elif profile=='fault-restart':phrase('Fault recovery phrase.',2200,2700)
    else:phrase("Don't re-enter, please.",2200,2700);phrase('Try it again.',5200,5700)
    if profile=='low-confidence':
        for word in words:word['confidence']=.1
    if profile=='malformed-confidence':words[1]['confidence']=True
    if profile=='overlap':words[0]['end_ms']=2250
    if profile=='multi-speaker':words[1]['speaker']='a';words[2]['speaker']='b';words[3]['speaker']='a'
response={'schema_version':1,'method':'independent_asr','audio_sha256':request['audio_sha256'],'engine':'fixed-word-time-fixture','fixture_only':True,'timing_uncertainty_ms':250,'speaker_detection':False,'words':words}
print(json.dumps(response))
