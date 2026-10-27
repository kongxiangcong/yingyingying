import type {Attempt,Question} from './api';
import {normalize} from './api';

export function effectiveInputs(question:Question,attempt:Attempt):string[]{
 return question.tokens.map((token,index)=>attempt.highest_hint===3||(attempt.highest_hint>=1&&question.hint_indices.includes(index))?token.word:attempt.inputs[index]||'');
}
export function isComplete(question:Question,attempt:Attempt):boolean{
 return effectiveInputs(question,attempt).every((value,index)=>normalize(value)===normalize(question.tokens[index].word));
}
export function hintCandidates(question:Question):string[]{
 const words=question.tokens.filter((_,index)=>!question.hint_indices.includes(index)).map(token=>token.word);
 let seed=Array.from(question.id).reduce((value,char)=>((value*31)^char.charCodeAt(0))>>>0,2166136261);
 const shuffled=[...words];
 for(let i=shuffled.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]}
 if(shuffled.length>1&&shuffled.every((word,index)=>word===words[index]))shuffled.push(shuffled.shift()!);
 return shuffled;
}
