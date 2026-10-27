import {useEffect,useRef,useState} from 'react';
import {api,type Attempt,type Question} from './api';
import {WordExercise} from './WordExercise';
import {formatPosition} from './ReportView';

type NotebookEntry={package_id:string;question_id:string;material_name:string;chinese:string;position_ms:number;highest_hint:number;mastered:boolean;review_count:number};
type ReviewSession={id:string;items:{package_id:string;question_id:string}[];position:number;attempts:Record<string,Attempt>};
type History={learning:{id:number;record:Attempt}[];reviews:{id:number;review_id:string;record:Attempt}[]};
const hintNames=['无提示','Tips','Tips Pro','Pro Max'];
const key=(entry:NotebookEntry)=>`${entry.package_id}/${entry.question_id}`;
const resultName=(attempt:Attempt)=>!attempt.completed?'未完成':attempt.revealed?'Pro Max 揭晓':`${hintNames[attempt.highest_hint]}通过`;

export function Notebook({onBack,onError}:{onBack:()=>void;onError:(message:string)=>void}){
 const [entries,setEntries]=useState<NotebookEntry[]>([]),[include,setInclude]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[history,setHistory]=useState<Record<string,History>>({});
 async function load(){setLoading(true);try{setEntries(await api<NotebookEntry[]>(`/api/notebook?include_mastered=${include}`))}catch(e){onError((e as Error).message)}finally{setLoading(false)}}
 useEffect(()=>{void load()},[include]);
 async function mark(entry:NotebookEntry){setBusy(true);try{await api(`/api/notebook/${key(entry)}/mastery`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({mastered:!entry.mastered})});await load()}catch(e){onError((e as Error).message)}finally{setBusy(false)}}
 async function start(){setBusy(true);try{const session=await api<ReviewSession>('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:entries.map(({package_id,question_id})=>({package_id,question_id}))})});window.location.hash=`review=${session.id}`}catch(e){onError((e as Error).message)}finally{setBusy(false)}}
 async function showHistory(entry:NotebookEntry){try{const saved=await api<History>(`/api/notebook/${key(entry)}/history`);setHistory(old=>({...old,[key(entry)]:saved}))}catch(e){onError((e as Error).message)}}
 return <section className="panel notebook"><div className="report-heading"><div><span className="eyebrow">YOUR PRACTICE</span><h2>错题本</h2><p className="muted">选择自己的节奏复习；答对后保留记录，由你标记已掌握。</p></div><button onClick={onBack}>返回素材库</button></div>
 <div className="notebook-controls"><label className="checkbox-label"><input type="checkbox" checked={include} onChange={e=>setInclude(e.target.checked)}/>显示已掌握</label><button disabled={busy||loading||entries.length===0} onClick={()=>void start()}>开始复习</button></div>
 {loading?<p role="status">正在读取错题本…</p>:entries.length===0?<p className="muted">目前没有待复习的卡顿题。学习中使用提示的题目会保存在这里。</p>:entries.map(entry=>{const saved=history[key(entry)];const latestReviews=saved?Array.from(new Map(saved.reviews.map(row=>[row.review_id,row])).values()):[];return <article className="notebook-entry" data-testid="notebook-entry" key={key(entry)}><div><h3>{entry.chinese}</h3><p className="muted">{entry.material_name} · 练习包 {entry.package_id.slice(0,8)} · {formatPosition(entry.position_ms)}</p><p>学习最高提示 {hintNames[entry.highest_hint]} · 复习 {entry.review_count} 次 · {entry.mastered?'已掌握':'未掌握'}</p></div><div className="notebook-actions"><button disabled={busy} onClick={()=>void mark(entry)}>{entry.mastered?'重新加入练习':'标记已掌握'}</button><button className="secondary" onClick={()=>void showHistory(entry)}>查看作答历史</button></div>{saved&&<div className="notebook-history"><p>视频作答记录 {saved.learning.length} 条 · 复习记录 {latestReviews.length} 次</p>{latestReviews.map(row=><p className="muted" key={row.review_id}>{resultName(row.record)} · 错误 {row.record.errors}</p>)}</div>}</article>})}
 </section>
}

export function NotebookReview({reviewId,onBack,onError}:{reviewId:string;onBack:()=>void;onError:(message:string)=>void}){
 const [session,setSession]=useState<ReviewSession|null>(null),[question,setQuestion]=useState<Question|null>(null),[attempt,setAttempt]=useState<Attempt|null>(null),[loading,setLoading]=useState(true),[saved,setSaved]=useState(false);
 const queue=useRef(Promise.resolve()),heldEnter=useRef(false),advancing=useRef(false);
 const latest=useRef({session,attempt,saved});latest.current={session,attempt,saved};
 async function open(next:ReviewSession){
  setSession(next);latest.current.session=next;setQuestion(null);setAttempt(null);setLoading(true);setSaved(false);latest.current.saved=false;
  if(next.position<next.items.length){
   const q=await api<Question>(`/api/reviews/${reviewId}/questions/${next.position}`);const a=next.attempts[String(next.position)]||{inputs:q.tokens.map(()=>''),errors:0,highest_hint:0,completed:false,revealed:false};setQuestion(q);setAttempt(a);setSaved(a.completed);latest.current.attempt=a;latest.current.saved=a.completed;
  }
  setLoading(false)
 }
 useEffect(()=>{void api<ReviewSession>(`/api/reviews/${reviewId}`).then(open).catch(e=>{onError(e.message);setLoading(false)})},[reviewId]);
 async function advance(){
  const state=latest.current;if(!state.session||!state.attempt?.completed||!state.saved||advancing.current)return;
  advancing.current=true;
  try{const next=await api<ReviewSession>(`/api/reviews/${reviewId}/advance`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({position:state.session.position})});await open(next)}catch(e){onError((e as Error).message)}finally{advancing.current=false}
 }
 useEffect(()=>{
  function down(event:KeyboardEvent){
   if(event.key!=='Enter'||event.isComposing)return;
   if(event.repeat||heldEnter.current){event.preventDefault();event.stopImmediatePropagation();return}
   heldEnter.current=true;
   event.preventDefault();
   if(latest.current.attempt?.completed){event.stopImmediatePropagation();void advance()}
  }
  function up(event:KeyboardEvent){if(event.key==='Enter')heldEnter.current=false}
  function blur(){heldEnter.current=false}
  window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);window.addEventListener('blur',blur);
  return()=>{window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);window.removeEventListener('blur',blur)}
 },[reviewId]);
 function update(record:Attempt,completed:boolean){
  const state=latest.current;if(!state.session)return;
  const position=state.session.position;setAttempt(record);latest.current.attempt=record;setSaved(false);latest.current.saved=false;
  queue.current=queue.current.then(async()=>{
   await api(`/api/reviews/${reviewId}/attempts/${position}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});
   if(completed){setSaved(true);latest.current.saved=true}
  }).catch(e=>onError(e.message));
 }
 const done=session&&session.position>=session.items.length;
 return <section className="panel notebook-review"><div className="report-heading"><div><span className="eyebrow">RECONSTRUCT / REVIEW</span><h2>{done?'本轮复习完成':'错题复习'}</h2><p className="muted">{session?`${Math.min(session.position+1,session.items.length)} / ${session.items.length}`:'正在读取记录…'}</p></div><button onClick={onBack}>返回错题本</button></div>
 {loading?<p role="status">正在读取复习题目…</p>:done?<p>本轮结果已保存，错题和掌握状态均保留。</p>:question&&attempt&&<><WordExercise key={`${reviewId}/${session?.position}`} question={question} attempt={attempt} onUpdate={update}/>{attempt.completed&&<div className="review-result"><h3>{question.english}</h3><p>{resultName(attempt)}</p><p role="status">{saved?'结果已保存，按 Enter 进入下一题。':'正在保存结果…'}</p></div>}</>}
 </section>
}
