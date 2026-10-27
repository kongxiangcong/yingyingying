import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {createRequire} from 'node:module';
import {spawn,type ChildProcess} from 'node:child_process';
import {generateMediaFixture} from './mediaFixture';
const require=createRequire(import.meta.url);
async function freePort():Promise<number>{const server=net.createServer();return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>{const port=(server.address() as net.AddressInfo).port;server.close(()=>resolve(port))}));}
async function stop(child:ChildProcess){if(child.exitCode!==null)return;await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill()});}
for(const provider of ['codex','deepseek'])test(`${provider} publishes the same learnable words and provider provenance without runtime model calls`,async({page},info)=>{
 test.setTimeout(90000);const directory=info.outputPath(provider),control=path.join(directory,'fault-control.json');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(control,JSON.stringify({mode:'healthy'}));
 generateMediaFixture(directory,"1\n00:00:02,200 --> 00:00:02,400\nDon't re-enter,\n\n2\n00:00:02,400 --> 00:00:02,800\nplease.\n\n3\n00:00:05,200 --> 00:00:05,800\nTry it again.\n");
 const apiPort=await freePort(),uiPort=await freePort(),apiUrl=`http://127.0.0.1:${apiPort}`,uiUrl=`http://127.0.0.1:${uiPort}`,python=process.env.SCENE_PYTHON||'python',model=provider==='codex'?'fixture-codex-model':'fixture-deepseek-model';
 const env={...process.env,SCENE_DATA_DIR:path.join(directory,'data'),SCENE_MODEL_PROVIDER:provider,SCENE_MODEL_MODEL:model,SCENE_CODEX_COMMAND:JSON.stringify([python,path.resolve('tests/fixtures/fixed_model.py')]),SCENE_DSH_COMMAND:JSON.stringify([python,path.resolve('tests/fixtures/fixed_dsh.py')]),SCENE_DSH_PROVIDER:'fixture-deepseek-provider',SCENE_DSH_FAULT_CONTROL:control,DSH_SESSION_ID:'fixture-stale-session',SCENE_CONTEXT_CHUNK_SIZE:'2',SCENE_MODEL_TIMEOUT:'2',SCENE_ALIGNMENT_COMMAND:JSON.stringify([python,path.resolve('tests/fixtures/fixed_alignment.py')]),SCENE_ALIGNMENT_PROFILE:'normal'};
 let serviceLog='';const backend=spawn(python,['-m','uvicorn','server.app:app','--host','127.0.0.1','--port',String(apiPort)],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});for(const stream of [backend.stdout,backend.stderr])stream?.on('data',chunk=>serviceLog+=chunk.toString());const frontend=spawn(process.execPath,[path.join(path.dirname(require.resolve('vite/package.json')),'bin/vite.js'),'--host','127.0.0.1','--port',String(uiPort)],{env:{...process.env,SCENE_API_URL:apiUrl},stdio:'ignore',windowsHide:true});
 try{
  for(const url of [apiUrl+'/api/materials',uiUrl])await expect.poll(async()=>{try{return(await page.request.get(url,{timeout:1000})).status()}catch{return 0}},{timeout:20000}).toBe(200);
  await page.goto(uiUrl);await page.getByLabel('视频文件').setInputFiles({name:`${provider}.mp4`,mimeType:'video/mp4',buffer:fs.readFileSync(path.join(directory,'tones.mp4'))});await page.getByLabel('英文字幕').setInputFiles(path.join(directory,'english.srt'));await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('button',{name:'导入素材'})).toBeEnabled();
  const row=page.getByRole('article').filter({has:page.getByRole('heading',{name:`${provider}.mp4`,exact:true})});await row.getByRole('button',{name:'生成练习包',exact:true}).click();await expect(row.getByRole('status')).toContainText('练习包已发布',{timeout:20000});
  const material=(await(await page.request.get(apiUrl+'/api/materials')).json())[0],packagesUrl=`${apiUrl}/api/materials/${material.id}/packages`,tasksUrl=`${apiUrl}/api/materials/${material.id}/tasks`;
  const packId=(await(await page.request.get(packagesUrl)).json())[0].id,pack=await(await page.request.get(`${apiUrl}/api/packages/${packId}`)).json();expect(pack.provenance).toMatchObject({provider,model,prompt_version:'scene-v1',source_material_id:material.id});if(provider==='deepseek')expect(pack.provenance.provider_id).toBe('fixture-deepseek-provider');
  expect(pack.questions.map((question:any)=>question.english)).toEqual(["Don't re-enter, please.",'Try it again.']);expect(pack.questions[0].tokens.map((token:any)=>token.word)).toEqual(["Don't",'re-enter','please']);expect(pack.questions[0].source_ids).toEqual(['1','2']);
  await row.getByRole('button',{name:`播放 ${provider}.mp4`}).click();await expect(page.getByLabel('播放器已就绪')).toBeVisible();const requests:string[]=[];page.on('request',request=>{if(!request.url().startsWith(uiUrl))requests.push(request.url())});await page.locator('video').evaluate((video:HTMLVideoElement)=>video.play());await expect(page.getByRole('heading',{name:'请不要再次进入。',exact:true})).toBeVisible();for(const [index,value] of ["DON’T",'re-enter','please'].entries())await page.getByRole('textbox',{name:`单词 ${index+1}`,exact:true}).fill(value);await expect(page.getByRole('heading',{name:'再试一次。',exact:true})).toBeVisible();await page.getByRole('button',{name:'直接揭晓',exact:true}).click();await expect.poll(async()=>Object.values(await(await page.request.get(`${apiUrl}/api/packages/${packId}/attempts`)).json()).filter((attempt:any)=>attempt.completed).length).toBe(2);await page.locator('video').evaluate((video:HTMLVideoElement)=>video.pause());expect(requests).toEqual([]);
  if(provider==='deepseek'){
   await page.getByRole('button',{name:'← 素材库',exact:true}).click();
   let failed:any;for(const [mode,code] of [['auth','AUTH'],['unknown','UNKNOWN'],['no_end','UNKNOWN']]){
    fs.writeFileSync(control,JSON.stringify({mode}));await page.request.post(`${apiUrl}/api/materials/${material.id}/tasks`);await expect.poll(async()=>{failed=(await(await page.request.get(tasksUrl)).json())[0];return failed.status}).toBe('failed');expect(failed.stage).toBe('select');expect(failed.error_code).toBe(code);expect(failed.model_attempts).toBe(2);expect(JSON.stringify(failed)).not.toContain('fixture-secret-token');expect(await page.locator('body').innerText()).not.toContain('fixture-secret-token');expect((await(await page.request.get(packagesUrl)).json())).toHaveLength(1);expect(serviceLog).not.toContain('fixture-secret-token');
   }
   fs.writeFileSync(control,JSON.stringify({mode:'healthy'}));await expect(row.getByRole('button',{name:'重试预处理',exact:true})).toBeVisible();await row.getByRole('button',{name:'重试预处理',exact:true}).click();await expect(row.getByRole('status')).toContainText('练习包已发布',{timeout:20000});const retried=(await(await page.request.get(tasksUrl)).json())[0];expect(retried.retry_of).toBe(failed.id);expect(retried.provider).toBe('deepseek');expect((await(await page.request.get(packagesUrl)).json())).toHaveLength(2);
  }
 }finally{await stop(backend);await stop(frontend)}
});

