import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {startLocalApp} from './localApp';
import {generateMediaFixture} from './mediaFixture';

test('interrupted worker and real service restarts recover persistent tasks without duplicate publication',async({page},testInfo)=>{
 test.setTimeout(120000);
 const directory=testInfo.outputPath('persistent-restart'),control=path.join(directory,'control.json');fs.mkdirSync(directory,{recursive:true});
 generateMediaFixture(directory,'1\n00:00:02,200 --> 00:00:02,800\nFault recovery phrase.\n');fs.writeFileSync(control,JSON.stringify({mode:'healthy'}));
 const app=await startLocalApp(page,{SCENE_DATA_DIR:path.join(directory,'data'),SCENE_CONTEXT_CHUNK_SIZE:'2',SCENE_MODEL_TIMEOUT:'20',SCENE_MODEL_MAX_ATTEMPTS:'2',SCENE_FAULT_CONTROL:control,SCENE_ALIGNMENT_PROFILE:'fault-restart'}),apiUrl=app.apiUrl,uiUrl=app.url;
 try{
  await page.goto(uiUrl);
  await page.getByLabel('视频文件').setInputFiles({name:'persistent-restart.mp4',mimeType:'video/mp4',buffer:fs.readFileSync(path.join(directory,'tones.mp4'))});await page.getByLabel('英文字幕').setInputFiles(path.join(directory,'english.srt'));await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('button',{name:'导入素材'})).toBeEnabled();
  const row=page.getByRole('article').filter({has:page.getByRole('heading',{name:'persistent-restart.mp4',exact:true})});await row.getByRole('button',{name:'生成练习包',exact:true}).click();await expect(row.getByRole('status')).toContainText('练习包已发布',{timeout:20000});
  const material=(await(await page.request.get(apiUrl+'/api/materials')).json())[0],tasksUrl=`${apiUrl}/api/materials/${material.id}/tasks`,packagesUrl=`${apiUrl}/api/materials/${material.id}/packages`;
  const original=(await(await page.request.get(packagesUrl)).json())[0];
  // Crash the actual worker only through the injected external model process.
  fs.writeFileSync(control,JSON.stringify({mode:'crash_worker'}));await page.request.post(`${apiUrl}/api/materials/${material.id}/tasks`);
  await expect.poll(async()=> (await(await page.request.get(tasksUrl)).json())[0].status,{timeout:15000}).toBe('failed');
  let failed=(await(await page.request.get(tasksUrl)).json())[0];expect(failed.error).toContain('中断');expect((await(await page.request.get(packagesUrl)).json())).toHaveLength(1);
  fs.writeFileSync(control,JSON.stringify({mode:'healthy'}));await page.reload();await expect(row.getByRole('button',{name:'重试预处理',exact:true})).toBeVisible();await row.getByRole('button',{name:'重试预处理',exact:true}).click();await expect(row.getByRole('status')).toContainText('练习包已发布',{timeout:20000});
  let recovered=(await(await page.request.get(tasksUrl)).json())[0];expect(recovered.reused_artifacts).toEqual(['selection-0']);expect(recovered.model_attempts).toBe(1);
  // Stop the actual API while its owned worker is inside an external model call.
  fs.writeFileSync(control,JSON.stringify({mode:'timeout'}));await page.request.post(`${apiUrl}/api/materials/${material.id}/tasks`);await expect.poll(async()=> (await(await page.request.get(tasksUrl)).json())[0].stage).toBe('generate');
  await app.restartApi();await page.reload();
  await expect.poll(async()=> (await(await page.request.get(tasksUrl)).json())[0].status,{timeout:15000}).toBe('failed');failed=(await(await page.request.get(tasksUrl)).json())[0];expect(failed.error).toContain('中断');
  expect((await(await page.request.get(packagesUrl)).json())).toHaveLength(2);expect((await(await page.request.get(`${apiUrl}/api/packages/${original.id}`)).json()).id).toBe(original.id);
  // Changing actual runtime configuration invalidates reuse despite the same subtitle input.
  await app.restartApi({SCENE_MODEL_MODEL:'fixture-changed-model'});fs.writeFileSync(control,JSON.stringify({mode:'healthy'}));await page.reload();await expect(row.getByRole('button',{name:'重试预处理',exact:true})).toBeVisible();await row.getByRole('button',{name:'重试预处理',exact:true}).click();await expect(row.getByRole('status')).toContainText('练习包已发布',{timeout:20000});
  recovered=(await(await page.request.get(tasksUrl)).json())[0];expect(recovered.fingerprint).not.toBe(failed.fingerprint);expect(recovered.reused_artifacts).toEqual([]);expect(recovered.model_attempts).toBe(2);
  const versions=await(await page.request.get(packagesUrl)).json();expect(versions).toHaveLength(3);
  await app.restartApi({SCENE_MODEL_MODEL:'fixture-changed-model'});await page.reload();expect((await(await page.request.get(tasksUrl)).json())[0]).toMatchObject({id:recovered.id,status:'succeeded'});expect((await(await page.request.get(packagesUrl)).json())).toHaveLength(3);
  const repeated=await(await page.request.post(`${apiUrl}/api/tasks/${failed.id}/retry`)).json();expect(repeated.id).toBe(recovered.id);expect((await(await page.request.get(packagesUrl)).json())).toHaveLength(3);
  await row.getByRole('button',{name:'播放 persistent-restart.mp4'}).click();await expect(page.getByLabel('播放器已就绪')).toBeVisible();await page.locator('video').evaluate((video:HTMLVideoElement)=>video.play());await expect(page.getByRole('heading',{name:'请清楚地表达。',exact:true})).toBeVisible();
 }finally{await app.close();await testInfo.attach('owned-app.log',{body:app.logs(),contentType:'text/plain'})}
});

