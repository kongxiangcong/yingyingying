import {useEffect,useState} from 'react';
import {api} from './api';

type Task={id:string;status:string;stage:string;error:string|null;package_id:string|null;provider:string;model:string;reused_artifacts:string[];model_attempts:number};
const stages:Record<string,string>={check:'检查素材',parse:'整理台词',context:'准备上下文',select:'选择原句',generate:'生成学习资料',assemble:'组装练习',validate:'校验练习包',publish:'发布练习包'};

export function PreprocessingPanel({materialId,onReady,onError,refreshKey=0}:{materialId:string;onReady:()=>void;onError:(message:string)=>void;refreshKey?:number}){
 const [task,setTask]=useState<Task|null>(null),[starting,setStarting]=useState(false);
 const [hasPackage,setHasPackage]=useState(false);
 useEffect(()=>{let alive=true;void api<{id:string}[]>(`/api/materials/${materialId}/packages`).then(versions=>{if(alive)setHasPackage(versions.length>0)}).catch(error=>{if(alive)onError(error.message)});return()=>{alive=false}},[materialId,refreshKey]);
 useEffect(()=>{
  let alive=true;
  async function refresh(){try{const tasks=await api<Task[]>(`/api/materials/${materialId}/tasks`);if(alive)setTask(tasks[0]||null)}catch(error){if(alive)onError((error as Error).message)}}
  void refresh();const interval=setInterval(()=>void refresh(),700);return()=>{alive=false;clearInterval(interval)};
 },[materialId]);
 async function start(){setStarting(true);onError('');try{setTask(await api<Task>(`/api/materials/${materialId}/tasks`,{method:'POST'}))}catch(error){onError((error as Error).message)}finally{setStarting(false)}}
 async function retry(){if(!task)return;setStarting(true);onError('');try{setTask(await api<Task>(`/api/tasks/${task.id}/retry`,{method:'POST'}))}catch(error){onError((error as Error).message)}finally{setStarting(false)}}
 useEffect(()=>{if(task?.status==='succeeded'){setHasPackage(true);onReady()}},[task?.id,task?.status]);
 const running=starting||task?.status==='queued'||task?.status==='running';
 return <div className="preprocessing"><button type="button" disabled={running} onClick={()=>void start()}>{running?'正在生成…':hasPackage?'重新准备学习资料':'准备学习资料'}</button>
 {hasPackage&&<p className="muted">重新生成会创建独立新版本，已有进度、报告和错题保留。</p>}
 {task?.status==='failed'&&<button type="button" disabled={running} onClick={()=>void retry()}>重试预处理</button>}
 {task&&<p role="status" className={task.status==='failed'?'processing-error':'muted'}>{task.status==='succeeded'?'学习资料已就绪':task.status==='failed'?`${stages[task.stage]||task.stage}失败：${task.error}`:`${stages[task.stage]||task.stage}…`}{task.reused_artifacts.length>0&&` · 复用 ${task.reused_artifacts.length} 项有效产物`}</p>}
 </div>;
}
