import {test,expect} from '@playwright/test';
import path from 'node:path';
import {startLocalApp} from './localApp';
import {generateMediaFixture} from './mediaFixture';
import {observeRenderedAudio} from './audioObserver';
const dir=path.resolve('.test-fixtures/restart');
test.beforeAll(()=>generateMediaFixture(dir,'1\n00:00:02,200 --> 00:00:02,800\nDo it again.\n\n2\n00:00:05,200 --> 00:00:05,800\nTry it again.\n'));
test('service restart restores paused viewing bookmark and partial exercise without audio',async({page},testInfo)=>{
 test.setTimeout(60000);await observeRenderedAudio(page);
 const app=await startLocalApp(page),apiUrl=app.apiUrl,uiUrl=app.url,data=app.data;
 try{
  let attemptsUrl='';page.on('request',req=>{if(req.url().endsWith('/attempts'))attemptsUrl=req.url()});
  await page.goto(uiUrl);await page.getByLabel('视频文件').setInputFiles(path.join(dir,'tones.mp4'));await page.getByLabel('英文字幕').setInputFiles(path.join(dir,'english.srt'));await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('button',{name:'导入素材'})).toBeEnabled();await page.getByRole('button',{name:'播放 tones.mp4'}).click();
  const card={usage:'鼓励',pattern:'祈使句',explanation:'动词原形',example:'Try this.',translation:'试试这个。'};
  const questions=[{id:'r1',source_ids:['1'],english:'Do it again.',chinese:'再做一次。',pause_ms:1500,start_ms:2200,end_ms:2800,hint_indices:[0],card},{id:'r2',source_ids:['2'],english:'Try it again.',chinese:'再试一次。',pause_ms:4500,start_ms:5200,end_ms:5800,hint_indices:[0],card}];
  await page.getByLabel('固定练习包').setInputFiles({name:'restart.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({questions}))});await page.getByRole('button',{name:'导入练习包'}).click();await expect(page.getByText('练习包已就绪')).toBeVisible();
  await page.locator('video').evaluate((v:HTMLVideoElement)=>{v.currentTime=3.3});const progressUrl=attemptsUrl.replace('/attempts','/progress');await expect.poll(async()=> (await(await page.request.get(progressUrl)).json()).position_ms).toBe(3300);
  await app.restartApi();await page.reload();await page.getByRole('button',{name:'播放 tones.mp4'}).click();await expect(page.getByLabel('播放器已就绪')).toBeVisible();await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeCloseTo(3.3,1);expect(await page.locator('video').evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);
  await page.getByRole('button',{name:'播放 / 暂停',exact:true}).click();await expect(page.getByRole('heading',{name:'再试一次。',exact:true})).toBeVisible();await page.getByRole('button',{name:'Tips',exact:true}).click();await page.getByRole('textbox',{name:'单词 2',exact:true}).fill('Wrong');await page.getByRole('textbox',{name:'单词 2',exact:true}).press('Tab');await expect.poll(async()=> (await(await page.request.get(attemptsUrl)).json()).r2).toMatchObject({highest_hint:1,completed:false,inputs:['','Wrong','']});
  await app.restartApi();await page.reload();await page.getByRole('button',{name:'播放 tones.mp4'}).click();await expect(page.getByRole('heading',{name:'再试一次。',exact:true})).toBeVisible();await expect(page.getByRole('textbox',{name:'单词 2',exact:true})).toHaveValue('Wrong');await expect(page.getByRole('button',{name:'Tips',exact:true})).toBeDisabled();expect(await page.locator('video').evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);const audio=await page.evaluate(()=>(window as any).audioEvidence);expect(audio[1760]).toBeLessThan(.01);
  const evidence={data,restarts:2,position:await page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime),audio};console.log('Service restart:',JSON.stringify(evidence));await testInfo.attach('service-restart.json',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
 }finally{await app.close();await testInfo.attach('restart-service.log',{body:app.logs(),contentType:'text/plain'})}
});
