import {useRef,useState} from 'react';
import {normalize,type Attempt,type Question} from './api';
import {effectiveInputs,hintCandidates,isComplete} from './exercise';

/** Controlled exercise interaction shared by video learning and standalone review. */
export function WordExercise({question,attempt,onUpdate}:{question:Question;attempt:Attempt;onUpdate:(attempt:Attempt,completed:boolean)=>void}){
 const latest=useRef(attempt);latest.current=attempt;
 const committed=useRef<Record<number,string>>({});
 const [submitting,setSubmitting]=useState(false);
 const displayed=effectiveInputs(question,attempt);
 function update(record:Attempt){
  const completed=isComplete(question,record);const result={...record,completed};latest.current=result;
  if(completed)setSubmitting(true);
  onUpdate(result,completed);
 }
 function change(index:number,value:string){
  const record=latest.current,inputs=[...record.inputs];inputs[index]=value;delete committed.current[index];update({...record,inputs});
 }
 function check(index:number){
  const record=latest.current,value=record.inputs[index]||'';
  if(value&&normalize(value)!==normalize(question.tokens[index].word)&&committed.current[index]!==value){committed.current[index]=value;update({...record,errors:record.errors+1})}
 }
 function hint(level:number,direct=false){
  const record=latest.current;
  if(level<=record.highest_hint||(!direct&&level!==record.highest_hint+1))return;
  update({...record,highest_hint:level,revealed:level===3});
 }
 return <div className="exercise-content"><div className="exercise-prompt"><h2>{question.chinese}</h2>
 <div className="word-slots">{question.tokens.map((token,index)=>{
  const value=displayed[index],hinted=attempt.highest_hint===3||(attempt.highest_hint>0&&question.hint_indices.includes(index));
  const correct=normalize(value)===normalize(token.word),wrong=!hinted&&committed.current[index]===value&&!correct;
  const original=attempt.inputs[index];
  return <div className="word-unit" key={index}><label className="word-slot"><span>{token.prefix}</span><input autoFocus={index===0} aria-label={`单词 ${index+1}`} style={{width:`${Math.max(4,token.word.length+1)}ch`}} className={hinted?'correct hinted':correct?'correct':wrong?'wrong':''} value={value} readOnly={hinted||attempt.completed} disabled={submitting} autoComplete="off" spellCheck={false} onChange={e=>change(index,e.target.value)} onBlur={()=>{if(!hinted)check(index)}} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if([' ','Tab','Enter'].includes(e.key)){if(e.key!=='Tab')e.preventDefault();if(!hinted)check(index);if(e.key!=='Tab'){const inputs=Array.from(e.currentTarget.closest('.word-slots')?.querySelectorAll('input')||[]);inputs.slice(index+1).find(input=>!input.readOnly&&!input.disabled)?.focus()}}}}/><span>{token.suffix}</span></label>{hinted&&original&&normalize(original)!==normalize(token.word)&&<small className="original-input">原始作答：{original}</small>}</div>
 })}</div>
 {attempt.highest_hint===2&&<div className="candidate-words" aria-label="剩余候选词">{hintCandidates(question).map((word,index)=><span data-testid="candidate-word" key={index}>{word}</span>)}</div>}
 {attempt.highest_hint===3&&<p className="revealed-sentence">{question.english}</p>}
 </div><div className="hint-controls" aria-label="提示等级"><button type="button" disabled={submitting||attempt.completed||attempt.highest_hint>=1} onClick={()=>hint(1)}>Tips</button><button type="button" disabled={submitting||attempt.completed||attempt.highest_hint!==1} onClick={()=>hint(2)}>Tips Pro</button><button type="button" disabled={submitting||attempt.completed||attempt.highest_hint!==2} onClick={()=>hint(3)}>Tips Pro Max</button><button className="reveal-button" type="button" disabled={submitting||attempt.completed} onClick={()=>hint(3,true)}>直接揭晓</button></div>
 <p className="muted exercise-stats">错误次数：{attempt.errors} · 最高提示：{['无提示','Tips','Tips Pro','Pro Max'][attempt.highest_hint]}</p>
 </div>
}
