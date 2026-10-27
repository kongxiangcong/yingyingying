import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {generateMediaFixture} from './mediaFixture';
const dir=path.resolve('.test-fixtures/faults'),control=path.resolve('.test-data/fault-control.json');
test.beforeAll(()=>{generateMediaFixture(dir,'1\n00:00:02,200 --> 00:00:02,800\nFault proof phrase.\n\n2\n00:00:05,200 --> 00:00:05,800\nFault recovery phrase.\n');fs.mkdirSync(path.dirname(control),{recursive:true});});
test.afterEach(()=>fs.writeFileSync(control,JSON.stringify({mode:'healthy',alignment_profile:'normal'})));
test('fault matrix preserves old version, rejects invalid cache, and retries valid artifacts',async({page})=>{
 test.setTimeout(150000);fs.writeFileSync(control,JSON.stringify({mode:'healthy',alignment_profile:'faults'}));
 await page.goto('/');await page.getByLabel('视频文件').setInputFiles({name:'fault-matrix.mp4',mimeType:'video/mp4',buffer:fs.readFileSync(path.join(dir,'tones.mp4'))});await page.getByLabel('英文字幕').setInputFiles(path.join(dir,'english.srt'));await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('button',{name:'导入素材'})).toBeEnabled();
 const row=page.getByRole('article').filter({has:page.getByRole('heading',{name:'fault-matrix.mp4',exact:true})});await row.getByRole('button',{name:'生成练习包',exact:true}).click();await expect(row.getByRole('status')).toContainText('练习包已发布',{timeout:30000});
 const material=(await(await page.request.get('/api/materials')).json())[0],tasksUrl=`/api/materials/${material.id}/tasks`,packagesUrl=`/api/materials/${material.id}/packages`;
 const original=(await(await page.request.get(packagesUrl)).json())[0];
 const failures=[['timeout','超时'],['exception','入口运行失败'],['malformed','JSON 结构无效'],['shape','资料数量'],['rewrite','改写了字幕原句'],['duplicate','重复或不存在'],['index','揭词索引'],['word_count','词数'],['tokens','词单元'],['candidates','候选词'],['card','句式卡']];
 let last:any;
 for(const [mode,reason] of failures){
  fs.writeFileSync(control,JSON.stringify({mode,alignment_profile:'faults'}));const started=await(await page.request.post(`/api/materials/${material.id}/tasks`)).json();
  await expect.poll(async()=>{last=(await(await page.request.get(tasksUrl)).json())[0];return last.status},{timeout:20000}).toBe('failed');
  expect(last.id).toBe(started.id);expect(last.stage).toBe('generate');expect(last.error).toContain(reason);expect(last.model_attempts).toBe(4);
  expect((await(await page.request.get(packagesUrl)).json()).map((item:any)=>item.id)).toEqual([original.id]);
 }
 await expect(row.getByRole('status')).toContainText('句式卡');
 await row.getByRole('button',{name:'播放 fault-matrix.mp4'}).click();await expect(page.getByLabel('播放器已就绪')).toBeVisible();await page.locator('video').evaluate((video:HTMLVideoElement)=>video.play());await expect(page.getByRole('heading',{name:'请清楚地表达。',exact:true})).toBeVisible();
 // The last failure contained invalid card data; it must not poison the cache on retry.
 const failedId=last.id;fs.writeFileSync(control,JSON.stringify({mode:'healthy',alignment_profile:'faults'}));await expect(row.getByRole('button',{name:'重试预处理',exact:true})).toBeVisible();await row.getByRole('button',{name:'重试预处理',exact:true}).click();
 await expect.poll(async()=>{last=(await(await page.request.get(tasksUrl)).json())[0];return last.status},{timeout:20000}).toBe('succeeded');
 expect(last.retry_of).toBe(failedId);expect(last.reused_artifacts).toEqual(['selection-0','selection-1']);expect(last.model_attempts).toBe(1);expect((await(await page.request.get(packagesUrl)).json())).toHaveLength(2);
 const repeated=await(await page.request.post(`/api/tasks/${failedId}/retry`)).json();expect(repeated.id).toBe(last.id);expect((await(await page.request.get(packagesUrl)).json())).toHaveLength(2);
 fs.writeFileSync(control,JSON.stringify({mode:'healthy',alignment_profile:'faults'}));
});

