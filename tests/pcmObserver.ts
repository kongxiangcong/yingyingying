import type {Page} from '@playwright/test';
/** Audio-render-thread observer. Captured buffers survive delayed main-thread delivery. */
export async function observeOutputPCM(page:Page){
 await page.addInitScript(`
 window.outputPCM={samples:[],sampleRate:0,ready:false};
 const original=AudioNode.prototype.connect;
 AudioNode.prototype.connect=function(destination,...args){
  const result=original.call(this,destination,...args);
  if(destination instanceof AudioDestinationNode){
   const source=this,ctx=this.context;
   const code="class OutputCapture extends AudioWorkletProcessor{constructor(){super();this.port.onmessage=e=>{if(e.data.flush)this.port.postMessage({ack:e.data.flush})}}process(inputs,outputs){if(inputs[0]&&inputs[0][0])this.port.postMessage(inputs[0][0]);for(const channel of outputs[0])channel.fill(0);return true}}registerProcessor('output-capture',OutputCapture)";
   const url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));
   ctx.audioWorklet.addModule(url).then(()=>{
    URL.revokeObjectURL(url);const tap=new AudioWorkletNode(ctx,'output-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
    const pending=new Map();let seq=0;window.outputPCM.flush=()=>new Promise(resolve=>{pending.set(++seq,resolve);tap.port.postMessage({flush:seq})});tap.port.onmessage=event=>{if(event.data.ack){pending.get(event.data.ack)?.();pending.delete(event.data.ack);return}const samples=window.outputPCM.samples;for(const sample of event.data)samples.push(sample)};
    original.call(source,tap);original.call(tap,destination);window.outputPCM.sampleRate=ctx.sampleRate;window.outputPCM.ready=true;
   });
  }
  return result;
 };
 `);
}
export function signatureCorrelation(captured:number[],reference:number[],stride=6):number{
 const source=Float64Array.from(captured.filter((_,i)=>i%stride===0));
 const target=Float64Array.from(reference.filter((_,i)=>i%stride===0));
 let mean=0;for(const x of target)mean+=x;mean/=target.length;
 let targetPower=0;for(let i=0;i<target.length;i++){target[i]-=mean;targetPower+=target[i]*target[i]}
 if(!targetPower)return 0;let best=0;
 for(let start=0;start+target.length<=source.length;start+=2){
  let dot=0,power=0,sum=0;for(let i=0;i<target.length;i++){const x=source[start+i];dot+=x*target[i];power+=x*x;sum+=x}
  power-=sum*sum/target.length;
  if(power>1e-10)best=Math.max(best,Math.abs(dot)/Math.sqrt(power*targetPower));
 }
 return best;
}
