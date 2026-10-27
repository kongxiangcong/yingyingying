import React,{useEffect,useRef,useState} from 'react';
import {api,type Material,type Cue,type ExercisePackage,type Attempt,type Question,type PlayerProgress} from './api';
import {WordExercise} from './WordExercise';
import {PreprocessingPanel} from './PreprocessingPanel';

export type LearningPlayerProps={material:Material;cues:Cue[];onError:(message:string)=>void;onFinish?:(packageId:string,reason:'user'|'video_end',startMs:number,endMs:number,sessionId:string)=>Promise<void>;packageId?:string;onPackagePublished?:(id:string)=>Promise<void>|void;onExercisesReady?:()=>Promise<void>|void;onBack?:()=>void;settingsSlot?:React.ReactNode};
export function LearningPlayer({material,cues,onError,onFinish,packageId,onExercisesReady,onBack,settingsSlot}:LearningPlayerProps){
 const video=useRef<HTMLVideoElement>(null),menu=useRef<HTMLDetailsElement>(null);
 const [fullscreen,setFullscreen]=useState(false);
 useEffect(()=>{const update=()=>setFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',update);return()=>document.removeEventListener('fullscreenchange',update)},[]);
 async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await video.current?.closest('.learning-shell')?.requestFullscreen();if(menu.current)menu.current.open=false}catch(e){onError((e as Error).message)}}
 async function leave(){if(document.fullscreenElement)await document.exitFullscreen();onBack?.()}
 function chooseMode(next:'exercise'|'scene'|'card'){changeMode(next);if(menu.current)menu.current.open=false}

 const [mode,setMode]=useState<'exercise'|'scene'|'card'>('exercise');
 const [mask,setMask]=useState(()=>{try{const saved=localStorage.getItem('scene:mask-opacity');const value=saved===null?74:Number(saved);return Number.isFinite(value)?Math.min(90,Math.max(50,value)):74}catch{return 74}});
 function changeMask(value:number){setMask(value);try{localStorage.setItem('scene:mask-opacity',String(value))}catch{/* The control still works without preference storage. */}}
 const [allDone,setAllDone]=useState(false);
 function changeMode(next:'exercise'|'scene'|'card'){
  if(next==='card')video.current?.pause();setMode(next);setAllDone(false);
  if(next==='exercise'&&!loading&&!loadFailed&&!latest.current.active){
   const state=latest.current,remaining=state.pack?.questions.filter(q=>!state.attempts[q.id]?.completed);
   if(remaining?.length){const now=(video.current?.currentTime||0)*1000;enter(remaining.find(q=>q.pause_ms>=now)||remaining[0],true)}
   else{video.current?.pause();if(state.pack)setAllDone(true)}
  }
 }
 async function exercisesReady(){try{if(onExercisesReady)await onExercisesReady();else await load()}catch(e){onError((e as Error).message)}}
 const [pack,setPack]=useState<ExercisePackage|null>(null),[attempts,setAttempts]=useState<Record<string,Attempt>>({}),[active,setActive]=useState<Question|null>(null);
 const [position,setPosition]=useState(0),[loading,setLoading]=useState(true),[loadFailed,setLoadFailed]=useState(false),[redoPending,setRedoPending]=useState(false);
 useEffect(()=>{if(active){setMode('exercise');setAllDone(false)}},[active?.id]);
 const latest=useRef({pack,attempts,active});latest.current={pack,attempts,active};
 const context=useRef<AudioContext|null>(null),gain=useRef<GainNode|null>(null),queue=useRef(Promise.resolve()),progressQueue=useRef(Promise.resolve());
 const progress=useRef<PlayerProgress>({position_ms:0,active_question_id:null}),restoreTime=useRef<number|null>(null),previousTime=useRef(0),seeking=useRef(false),restoring=useRef(false),lastWrite=useRef(0),restoreTargetMs=useRef<number|null>(null);
 const pendingRecords=useRef(new Map<string,{packageId:string;questionId:string;record:Attempt}>());
 const finishPending=useRef(false),sessionStartMs=useRef(0),sessionId=useRef('');

 async function load(id?:string){
  const versions=await api<{id:string}[]>(`/api/materials/${material.id}/packages`);
  const chosen=id||packageId||versions[0]?.id;
  if(chosen){
   const p=await api<ExercisePackage>(`/api/packages/${chosen}`);
   const [a,saved]=await Promise.all([api<Record<string,Attempt>>(`/api/packages/${chosen}/attempts`),api<PlayerProgress>(`/api/packages/${chosen}/progress`)]);
   const session=await api<{id:string;start_ms:number}>(`/api/packages/${chosen}/sessions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start_ms:saved.position_ms})});sessionId.current=session.id;
   const q=p.questions.find(q=>q.id===saved.active_question_id&&!a[q.id]?.completed)||null;
   setPack(p);setAttempts(a);setActive(q);latest.current={pack:p,attempts:a,active:q};
   progress.current=saved;restoreTime.current=saved.position_ms;previousTime.current=saved.position_ms;sessionStartMs.current=session.start_ms;setPosition(saved.position_ms);
   if(video.current?.readyState){restoreVideo()}
  }
  setLoading(false);
 }
 function snapshot():PlayerProgress{
  const position_ms=Math.min(material.duration_ms,Math.max(0,Math.round((video.current?.currentTime??progress.current.position_ms/1000)*1000)));
  const record={position_ms,active_question_id:latest.current.active?.id||null,revision:Math.max((progress.current.revision||0)+1,Date.now()*1000),session_id:sessionId.current||null};
  progress.current=record;return record;
 }
 function persistProgress(force=false,unloading=false){
  const packageId=latest.current.pack?.id;if(!packageId)return;
  const record=snapshot();if(!force&&performance.now()-lastWrite.current<500)return;
  lastWrite.current=performance.now();
  const send=()=>api<PlayerProgress>(`/api/packages/${packageId}/progress`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(record),keepalive:true}).then(()=>{});
  if(unloading){void send().catch(()=>{});return}
  progressQueue.current=progressQueue.current.then(send).catch(e=>onError(e.message));
 }
 useEffect(()=>{
  void load().catch(e=>{onError(e.message);setLoadFailed(true);setLoading(false)});
  const leave=()=>{
   persistProgress(true,true);
   for(const {packageId,questionId,record} of pendingRecords.current.values())void api(`/api/packages/${packageId}/attempts/${questionId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(record),keepalive:true}).catch(()=>{});
  };window.addEventListener('pagehide',leave);
  const visibility=()=>{if(document.visibilityState==='hidden')persistProgress(true,true)};document.addEventListener('visibilitychange',visibility);
  return()=>{leave();window.removeEventListener('pagehide',leave);document.removeEventListener('visibilitychange',visibility);void context.current?.close()};
 },[material.id]);
 function ensureAudio(){
  if(!video.current)return;
  if(!context.current){const ctx=new AudioContext(),source=ctx.createMediaElementSource(video.current),g=ctx.createGain();source.connect(g);g.connect(ctx.destination);context.current=ctx;gain.current=g}
  void context.current.resume();
 }
 function mute(){const ctx=context.current,g=gain.current;if(ctx&&g){g.gain.cancelScheduledValues(ctx.currentTime);g.gain.setValueAtTime(0,ctx.currentTime)}}
 function armAudio(){
  const v=video.current,ctx=context.current,g=gain.current;if(!v||!ctx||!g)return;
  g.gain.cancelScheduledValues(ctx.currentTime);g.gain.setValueAtTime(latest.current.active||v.paused?0:1,ctx.currentTime);
  const next=latest.current.pack?.questions.find(q=>!latest.current.attempts[q.id]?.completed&&q.pause_ms>v.currentTime*1000);
  if(next&&!v.paused)g.gain.setValueAtTime(0,ctx.currentTime+(next.pause_ms/1000-v.currentTime)/v.playbackRate);
 }
 function restoreVideo(){
  const v=video.current;if(!v||restoreTime.current===null)return;
  v.pause();restoring.current=Math.abs(v.currentTime*1000-restoreTime.current)>1;restoreTargetMs.current=restoring.current?restoreTime.current:null;v.currentTime=restoreTime.current/1000;previousTime.current=restoreTime.current;restoreTime.current=null;
 }
 function enter(q:Question,jump=false){
  const v=video.current;if(!v)return;
  v.pause();mute();if(jump||v.currentTime*1000>=q.start_ms){restoring.current=true;restoreTargetMs.current=q.pause_ms;v.currentTime=q.pause_ms/1000;previousTime.current=q.pause_ms;setPosition(q.pause_ms);}
  setActive(q);latest.current.active=q;persistProgress(true);
 }
 useEffect(()=>{
  let handle=0;
  const tick=()=>{
   const v=video.current,state=latest.current;
   if(v&&!v.paused&&!v.seeking&&!seeking.current&&!state.active&&state.pack){
    const now=v.currentTime*1000;
    const q=state.pack.questions.find(q=>!state.attempts[q.id]?.completed&&previousTime.current<q.pause_ms&&now>=q.pause_ms);
    if(q)enter(q);else armAudio();
    previousTime.current=now;
   }
   handle=requestAnimationFrame(tick);
  };
  handle=requestAnimationFrame(tick);return()=>cancelAnimationFrame(handle);
 },[]);
 function seekStart(){
  seeking.current=true;mute();
  const restoringTarget=restoring.current&&restoreTargetMs.current!==null&&Math.abs((video.current?.currentTime||0)*1000-restoreTargetMs.current)<5;
  if(!restoringTarget){restoring.current=false;restoreTargetMs.current=null;if(latest.current.active){setActive(null);latest.current.active=null}}
 }
 function seekEnd(){
  const v=video.current;if(!v)return;
  previousTime.current=v.currentTime*1000;setPosition(previousTime.current);seeking.current=false;restoring.current=false;restoreTargetMs.current=null;armAudio();persistProgress(true);
 }
 function play(){
  const v=video.current;if(!v)return;
  if(loading||latest.current.active){v.pause();return}
  previousTime.current=v.currentTime*1000;ensureAudio();armAudio();
 }
 function persist(q:Question,record:Attempt,done=false){
  const packageId=latest.current.pack!.id;
  record={...record,revision:Math.max((latest.current.attempts[q.id]?.revision||0)+1,Date.now()*1000),session_id:sessionId.current};
  const pendingKey=`${packageId}:${q.id}`;pendingRecords.current.set(pendingKey,{packageId,questionId:q.id,record});
  const next={...latest.current.attempts,[q.id]:done?{...record,completed:false}:record};setAttempts(next);latest.current.attempts=next;
  queue.current=queue.current.then(async()=>{
   await api(`/api/packages/${packageId}/attempts/${q.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(record),keepalive:true});
   if(pendingRecords.current.get(pendingKey)?.record.revision===record.revision)pendingRecords.current.delete(pendingKey);
   if(done){const saved={...latest.current.attempts,[q.id]:record};setAttempts(saved);latest.current.attempts=saved;setActive(null);latest.current.active=null;persistProgress(true);ensureAudio();await video.current?.play();armAudio()}
  }).catch(e=>onError(e.message));
 }
 function current(q:Question):Attempt{return latest.current.attempts[q.id]||{inputs:q.tokens.map(()=>''),errors:0,highest_hint:0,completed:false,revealed:false,generation:0}}
 async function redo(q:Question){
  if(redoPending)return;setRedoPending(true);video.current?.pause();
  try{await queue.current;const record=await api<Attempt>(`/api/packages/${latest.current.pack!.id}/attempts/${q.id}/redo`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sessionId.current})});const next={...latest.current.attempts,[q.id]:record};setAttempts(next);latest.current.attempts=next;setActive(q);latest.current.active=q;if(video.current){restoring.current=true;restoreTargetMs.current=q.pause_ms;video.current.currentTime=q.pause_ms/1000};mute();persistProgress(true)}catch(e){onError((e as Error).message)}finally{setRedoPending(false)}
 }
 async function replay(q:Question){
  const v=video.current;if(!v)return;
  setActive(null);latest.current.active=null;seeking.current=true;v.currentTime=Math.max(q.pause_ms,q.start_ms-150)/1000;ensureAudio();await v.play();armAudio();persistProgress(true);
 }
 async function finish(reason:'user'|'video_end'){
  const state=latest.current;if(!state.pack||!onFinish||finishPending.current)return;
  finishPending.current=true;
  try{video.current?.pause();await queue.current;persistProgress(true);await progressQueue.current;await onFinish(state.pack.id,reason,sessionStartMs.current,Math.round((video.current?.currentTime||0)*1000),sessionId.current)}catch(e){onError((e as Error).message)}finally{finishPending.current=false}
 }
 const hidden=new Set(pack?.questions.flatMap(q=>q.source_ids));
 const alignedSubtitle=pack?.questions.find(q=>attempts[q.id]?.completed&&position>=q.pause_ms&&position<q.end_ms)?.english;
 const subtitle=alignedSubtitle||cues.filter(c=>position>=c.start_ms&&position<c.end_ms&&!hidden.has(c.id)).map(c=>c.text).join('\n');
 const record=active?current(active):null;
 const cardQuestion=!active?pack?.questions.filter(q=>attempts[q.id]?.completed&&q.pause_ms<=position+1).at(-1):undefined;
 return <section className={`player-panel mode-${mode}${active?' is-exercising':''}${!loading&&!pack&&!loadFailed?' needs-exercises':''}`} style={{'--study-mask':`${mask}%`} as React.CSSProperties}>
 <div className="study-statusbar"><span>{loading?'正在读取':active?'原句重构中':mode==='scene'?'看剧情':mode==='card'?'句式卡':'沉浸式学习'}</span><strong>{material.name.replace(/\.mp4$/i,'')}</strong><span>{Math.floor(position/60000)}:{String(Math.floor(position/1000)%60).padStart(2,'0')}</span></div>
 <details className="study-menu" ref={menu} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus()}}}}><summary aria-label="学习菜单">☰</summary><div className="study-menu-panel">
 <div className="study-menu-actions"><button className="secondary" onClick={()=>void leave()}>← 返回素材库</button><button className="secondary" onClick={()=>void toggleFullscreen()}>{fullscreen?'退出全屏':'进入全屏'}</button></div>
 <details className="mode-disclosure"><summary>模式</summary><div className="study-modes" aria-label="学习模式"><button type="button" aria-pressed={mode==='exercise'} disabled={loading||loadFailed} onClick={()=>chooseMode('exercise')}>填空</button><button type="button" aria-pressed={mode==='scene'} onClick={()=>chooseMode('scene')}>看剧情</button><button type="button" aria-pressed={mode==='card'} onClick={()=>chooseMode('card')}>句式卡</button></div></details>
 <details className="study-settings"><summary>设置</summary><label className="mask-control">蒙版浓度<input aria-label="蒙版浓度" type="range" min="50" max="90" step="1" value={mask} onChange={e=>changeMask(Number(e.target.value))}/><output>{mask}%</output></label>{settingsSlot}
 <div className="playback-tools"><button type="button" disabled={!!active||loading} onClick={()=>{if(mode==='card')setMode('scene');const v=video.current;if(v?.paused)void v.play();else v?.pause()}}>播放 / 暂停</button><label>播放位置<input aria-label="播放位置" type="range" min="0" max={material.duration_ms} step="100" value={Math.round(position)} onChange={e=>{if(video.current)video.current.currentTime=Number(e.target.value)/1000}}/></label></div>
 {pack&&<details className="study-history"><summary>题目回顾</summary><p className="muted">无提示通过：{Object.values(attempts).filter(a=>a.completed&&a.highest_hint===0).length}</p><div className="completed-exercises" aria-label="已完成题目">{pack.questions.map((q,index)=>attempts[q.id]?.completed&&<div key={q.id}><span>第{index+1}题 · {(q.start_ms/1000).toFixed(1)} 秒</span><button type="button" disabled={redoPending} onClick={()=>{void redo(q);if(menu.current)menu.current.open=false}}>重做 第{index+1}题</button><button type="button" onClick={()=>{void replay(q);if(menu.current)menu.current.open=false}}>重播 第{index+1}题</button></div>)}</div></details>}
 </details>
 <button className="summary-action" disabled={!pack||!onFinish} type="button" onClick={()=>void finish('user')}>总结本次学习</button>
 </div></details>
 {loading?<p role="status">正在读取学习资料…</p>:loadFailed?<p role="status">学习资料读取失败，请重新打开素材。</p>:<><div className="player" aria-label="播放器已就绪"><video ref={video} controlsList="nofullscreen" controls={!active&&mode!=='card'} preload="metadata" src={`/api/materials/${material.id}/media`} onLoadedMetadata={restoreVideo} onTimeUpdate={e=>{setPosition(e.currentTarget.currentTime*1000);persistProgress()}} onPlay={play} onPlaying={armAudio} onWaiting={mute} onPause={()=>{mute();persistProgress(true)}} onRateChange={armAudio} onSeeking={seekStart} onSeeked={seekEnd} onEnded={()=>void finish('video_end')}/><div className="scene-wash" aria-hidden="true"/><div className="subtitle" data-testid="subtitle">{active?'\u00a0':subtitle||'\u00a0'}</div>
 {active&&record&&<div className="exercise-mask" hidden={mode!=='exercise'}><WordExercise key={`${active.id}:${record.generation||0}`} question={active} attempt={record} onUpdate={(record,completed)=>persist(active,record,completed)}/></div>}
 {active&&mode==='scene'&&<div className="scene-return"><button type="button" onClick={()=>changeMode('exercise')}>返回填空</button></div>}
 {!loading&&!loadFailed&&!pack&&mode==='exercise'&&<section className="exercise-setup" aria-label="准备填空题"><h2>还没有填空题</h2><p>先准备这段视频的学习资料，再开始填空。</p><PreprocessingPanel materialId={material.id} onReady={()=>void exercisesReady()} onError={onError}/><button className="secondary" type="button" onClick={()=>changeMode('scene')}>先看剧情</button></section>}
 {allDone&&mode==='exercise'&&<section className="exercise-setup"><p>本次学习的原句已全部完成。</p><button type="button" onClick={()=>changeMode('scene')}>继续看剧情</button></section>}
 {mode==='card'&&<section className="study-card" aria-label="句式卡">{cardQuestion?<><p className="muted">{cardQuestion.card.usage}</p><h2>{cardQuestion.card.pattern}</h2><p>{cardQuestion.english}</p><p>{cardQuestion.card.explanation}</p><blockquote>{cardQuestion.card.example}<small>{cardQuestion.card.translation}</small></blockquote></>:<p>完成原句后可查看句式卡。</p>}<button type="button" onClick={()=>changeMode('exercise')}>返回学习</button></section>}
 </div></>}
 </section>
}
