import {test,expect} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {generateMediaFixture} from './mediaFixture';
import {startLocalApp} from './localApp';
const directory=path.resolve('.test-fixtures/timing');
test.beforeAll(()=>generateMediaFixture(directory,"1\n00:00:02,900 --> 00:00:03,100\nDon't re-enter,\n\n2\n00:00:03,100 --> 00:00:03,500\nplease.\n\n3\n00:00:05,900 --> 00:00:06,500\nTry it again.\n\n4\n00:00:07,300 --> 00:00:07,700\n- Yes.\n- No.\n"));
async function importAndGenerate(page:any,url:string,video:string,subtitle:string,name:string){
 await page.goto(url);await page.getByLabel('视频文件').setInputFiles({name,mimeType:'video/mp4',buffer:fs.readFileSync(video)});await page.getByLabel('英文字幕').setInputFiles({name:'english.srt',mimeType:'text/plain',buffer:Buffer.from(subtitle)});await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('button',{name:'导入素材'})).toBeEnabled();const row=page.getByRole('article').filter({has:page.getByRole('heading',{name,exact:true})});await row.getByRole('button',{name:'生成练习包',exact:true}).click();return row;
}
test('independent fixed alignment handles shifted cross-subtitle sentences and skips marked speakers',async({page})=>{
 const app=await startLocalApp(page);try{
 const row=await importAndGenerate(page,app.url,path.join(directory,'tones.mp4'),fs.readFileSync(path.join(directory,'english.srt'),'utf8'),'shifted-boundaries.mp4');await expect(row.getByRole('status')).toContainText('练习包已发布',{timeout:30000});const material=(await(await page.request.get(app.apiUrl+'/api/materials')).json())[0];const packages=await(await page.request.get(`${app.apiUrl}/api/materials/${material.id}/packages`)).json();const pack=await(await page.request.get(`${app.apiUrl}/api/packages/${packages[0].id}`)).json();expect(pack.questions).toHaveLength(2);expect(pack.questions[0]).toMatchObject({source_ids:['1','2'],start_ms:2200});expect(pack.questions[0].pause_ms).toBeLessThan(1900);expect(pack.provenance).toMatchObject({alignment_fixture_only:true,timing_method:'independent-words-quiet-gap-v1'});await row.getByRole('button',{name:'播放 shifted-boundaries.mp4'}).click();await expect(page.getByLabel('播放器已就绪')).toBeVisible();await page.locator('video').evaluate((v:HTMLVideoElement)=>v.play());await expect(page.getByRole('heading',{name:'请不要再次进入。',exact:true})).toBeVisible();await page.getByRole('button',{name:'直接揭晓',exact:true}).click();await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(1.3);await page.locator('video').evaluate((v:HTMLVideoElement)=>{v.pause();v.currentTime=2.3});await expect(page.getByTestId('subtitle')).toContainText("Don't re-enter, please.");
 }finally{await app.close()}
});
for(const scenario of ['unconfigured','low-confidence','tight','overlap','multi-speaker','malformed-confidence'])test(`reject ${scenario} timing instead of publishing an unsafe or empty package`,async({page})=>{
 const options=scenario==='unconfigured'?{SCENE_ALIGNMENT_COMMAND:''}:{SCENE_ALIGNMENT_PROFILE:scenario};const app=await startLocalApp(page,options);try{
 let video=path.join(directory,'tones.mp4');
 if(scenario==='tight'){
  video=path.join(directory,'tight.mp4');let root=process.cwd();while(!fs.existsSync(path.join(root,'.local-tools'))&&path.dirname(root)!==root)root=path.dirname(root);
  execFileSync(path.join(root,'.local-tools/bin/ffmpeg.exe'),['-y','-f','lavfi','-i','color=c=blue:s=640x360:r=25:d=8','-f','lavfi','-i',"aevalsrc=0.4*sin(2*PI*220*t)*between(t\\,0.2\\,0.5)+0.4*sin(2*PI*440*t)*between(t\\,1.6\\,2.18)+0.4*sin(2*PI*660*t)*between(t\\,2.2\\,2.7):s=48000:d=8",'-c:v','libx264','-c:a','aac','-shortest',video],{stdio:'ignore'});
 }
 const row=await importAndGenerate(page,app.url,video,"1\n00:00:02,200 --> 00:00:02,800\nDon't re-enter, please.\n",`${scenario}.mp4`);await expect(row.getByRole('status')).toContainText(scenario==='malformed-confidence'?'声音对齐时间或置信度非法':'没有可用题目',{timeout:30000});const material=(await(await page.request.get(app.apiUrl+'/api/materials')).json())[0];expect(await(await page.request.get(`${app.apiUrl}/api/materials/${material.id}/packages`)).json()).toEqual([]);
 }finally{await app.close()}
});
