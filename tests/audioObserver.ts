import type {Page} from '@playwright/test';
/** Passive spectral observation of the real graph output; never replaces media or audio nodes. */
export async function observeRenderedAudio(page:Page){
 await page.addInitScript(`
 window.audioEvidence={220:0,660:0,1760:0};
 const connect=AudioNode.prototype.connect;
 AudioNode.prototype.connect=function(destination,...args){
  const result=connect.call(this,destination,...args);
  if(destination instanceof AudioDestinationNode){
   const tap=this.context.createScriptProcessor(2048,1,1);
   tap.onaudioprocess=e=>{const samples=e.inputBuffer.getChannelData(0);e.outputBuffer.getChannelData(0).fill(0);
    for(const f of [220,660,1760]){let real=0,imag=0;for(let i=0;i<samples.length;i++){const angle=2*Math.PI*f*i/this.context.sampleRate;const weight=.5-.5*Math.cos(2*Math.PI*i/(samples.length-1));real+=samples[i]*weight*Math.cos(angle);imag+=samples[i]*weight*Math.sin(angle)}
     window.audioEvidence[f]=Math.max(window.audioEvidence[f],4*Math.hypot(real,imag)/samples.length);}
   };
   connect.call(this,tap);connect.call(tap,destination);
  }
  return result;
 };
 `);
}
