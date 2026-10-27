"""Optional offline recognizer adapter. Merely importing/compiling this file runs no model.

The caller must explicitly configure this command. Audio stays local. Cached model
files are mandatory; no network lookup/download is allowed. Word confidence and
250ms padding are conservative policy inputs, not calibrated error guarantees.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import wave


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--library-dir',required=True)
    parser.add_argument('--model-dir',required=True)
    parser.add_argument('--threads',type=int,default=4)
    args=parser.parse_args()
    library=Path(args.library_dir).resolve();model=Path(args.model_dir).resolve()
    if not (library/'faster_whisper').is_dir() or not (model/'model.bin').is_file():
        raise ValueError('Offline alignment library or cached model is unavailable')
    request=json.loads(sys.stdin.read())
    audio=Path(request['audio_path']).resolve()
    if hashlib.sha256(audio.read_bytes()).hexdigest()!=request['audio_sha256']:
        raise ValueError('Alignment audio hash does not match request')
    os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
    sys.path.insert(0,str(library))
    from faster_whisper import WhisperModel
    import numpy as np
    with wave.open(str(audio),'rb') as wav:
        if wav.getnchannels()!=1 or wav.getframerate()!=16000 or wav.getsampwidth()!=2:raise ValueError('Expected local 16kHz mono PCM16 WAV')
        pcm=np.frombuffer(wav.readframes(wav.getnframes()),dtype=np.int16).astype(np.float32)/32768.0
    started=time.perf_counter();cpu_started=time.process_time()
    recognizer=WhisperModel(str(model),device='cpu',compute_type='int8',cpu_threads=max(1,min(8,args.threads)),local_files_only=True)
    segments,_=recognizer.transcribe(pcm,language='en',word_timestamps=True,beam_size=5,condition_on_previous_text=False,vad_filter=False)
    words=[]
    for segment in segments:
        for word in segment.words or []:
            words.append({'word':word.word.strip(),'start_ms':round(word.start*1000),'end_ms':round(word.end*1000),'confidence':float(word.probability)})
    repository=model.parent.parent.name
    model_name=repository.split('faster-whisper-',1)[1] if 'faster-whisper-' in repository else 'custom'
    print(json.dumps({'schema_version':1,'audio_sha256':request['audio_sha256'],'method':'independent_asr','engine':'faster-whisper-local-'+model_name,'fixture_only':False,'timing_uncertainty_ms':250,'speaker_detection':False,'runtime_seconds':round(time.perf_counter()-started,3),'cpu_seconds':round(time.process_time()-cpu_started,3),'words':words}))


if __name__=='__main__':
    main()
