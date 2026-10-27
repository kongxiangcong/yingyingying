import {openMaterial,openSettings,openMenu,chooseMode,publishFixture} from './libraryUi';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const dir=path.resolve('.test-fixtures');
test.beforeAll(()=>{
 fs.mkdirSync(dir,{recursive:true});
 let root=process.cwd();while(!fs.existsSync(path.join(root,'.local-tools'))&&path.dirname(root)!==root)root=path.dirname(root);
 execFileSync(path.join(root,'.local-tools/bin/ffmpeg.exe'),['-y','-f','lavfi','-i','color=c=blue:s=640x360:r=25:d=8','-f','lavfi','-i',"aevalsrc=0.4*sin(2*PI*220*t)*between(t\\,0.2\\,0.5)+0.4*sin(2*PI*660*t)*between(t\\,2.2\\,2.7)+0.4*sin(2*PI*1760*t)*between(t\\,5.2\\,5.7):s=48000:d=8",'-c:v','libx264','-c:a','aac','-shortest',path.join(dir,'tones.mp4')],{stdio:'ignore'});
 fs.writeFileSync(path.join(dir,'english.srt'),"1\n00:00:02,200 --> 00:00:02,800\nDon't re-enter, please.\n\n2\n00:00:05,200 --> 00:00:05,800\nTry it again.\n");
});
test('two no-hint reconstructions preserve exact words, errors and results',async({page},testInfo)=>{
 const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
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
 await page.goto('/');
 await page.getByRole('button',{name:'＋ 上传素材'}).click();await page.getByLabel('视频文件',{exact:true}).setInputFiles(path.join(dir,'tones.mp4'));
 await page.getByLabel('英文字幕').setInputFiles(path.join(dir,'english.srt'));
 await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await openMaterial(page,'tones.mp4');
 const questions=[{id:'q1',source_ids:['1'],english:"Don't re-enter, please.",chinese:'请不要再次进入。',pause_ms:1500,start_ms:2200,end_ms:2800,card:{usage:'礼貌劝阻',pattern:"Don't + 动词",explanation:'否定祈使句',example:"Don't worry.",translation:'别担心。'}},{id:'q2',source_ids:['2'],english:'Try it again.',chinese:'再试一次。',pause_ms:4500,start_ms:5200,end_ms:5800,card:{usage:'鼓励重试',pattern:'Try + 宾语',explanation:'祈使句',example:'Try this.',translation:'试试这个。'}}];
 await publishFixture(page,{name:'fixed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({provenance:{provider:'local-fixture',model:'none'},questions}))});
 await expect(page.getByLabel('播放器已就绪')).toBeVisible();
 await page.locator('video').evaluate((v:HTMLVideoElement)=>v.play());
 await expect(page.getByRole('heading',{name:'请不要再次进入。'})).toBeVisible();
 await expect(page.getByTestId('subtitle')).not.toContainText("Don't");
 await page.screenshot({path:testInfo.outputPath('exercise.png')});
 const firstAudio=await page.evaluate(()=> (window as any).audioEvidence);
 expect(firstAudio[220]).toBeGreaterThan(.05);expect(firstAudio[660]).toBeLessThan(.01);expect(firstAudio[1760]).toBeLessThan(.01);

 const words=page.getByRole('textbox',{name:/单词/});
 await expect(words).toHaveCount(3);
 await words.nth(0).fill('Do');await expect(words.nth(0)).not.toHaveClass(/wrong/);
 await words.nth(0).press('Tab');await expect(page.getByText('错误次数：1')).toBeVisible();
 await words.nth(0).fill('  DON’T  ');await expect(words.nth(0)).toHaveClass(/correct/);
 await words.nth(1).fill('re-enter');await words.nth(2).fill('please');
 await expect(page.getByRole('heading',{name:'请不要再次进入。'})).not.toBeVisible();
 await expect(page.getByRole('heading',{name:'再试一次。'})).toBeVisible();
 const secondAudio=await page.evaluate(()=> (window as any).audioEvidence);
 expect(secondAudio[660]).toBeGreaterThan(.05);expect(secondAudio[1760]).toBeLessThan(.01);

 for(const [i,word] of ['Try','it','again'].entries())await page.getByRole('textbox',{name:`单词 ${i+1}`,exact:true}).fill(word);
 await openSettings(page);await page.getByText('题目回顾',{exact:true}).click();await expect(page.getByText('无提示通过：2')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=> (window as any).audioEvidence[1760])).toBeGreaterThan(.05);
 const finalAudio=await page.evaluate(()=> (window as any).audioEvidence);
 const evidence={firstAudio,secondAudio,finalAudio};console.log('Rendered PCM evidence:',JSON.stringify(evidence));
 await testInfo.attach('rendered-pcm.json',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
 expect(requests.every(url=>url.startsWith(new URL(page.url()).origin))).toBeTruthy();
 await page.reload();await openMaterial(page,'tones.mp4');
 await openSettings(page);await page.getByText('题目回顾',{exact:true}).click();await expect(page.getByText('无提示通过：2')).toBeVisible();
 const attemptUrl=requests.find(url=>url.endsWith('/attempts'))!;
 const saved=await (await page.request.get(attemptUrl)).json();
 expect(saved.q1).toMatchObject({errors:1,highest_hint:0,completed:true,inputs:['  DON’T  ','re-enter','please']});
});
