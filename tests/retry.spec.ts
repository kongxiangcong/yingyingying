import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {generateMediaFixture} from './mediaFixture';
const dir=path.resolve('.test-fixtures/retry');
test.beforeAll(()=>generateMediaFixture(dir,'1\n00:00:02,200 --> 00:00:02,800\nPlease speak clearly.\n'));
test('failed preprocessing exposes bounded attempts and a cache-aware retry',async({page})=>{
 await page.goto('/');await page.getByLabel('视频文件').setInputFiles({name:'retry.mp4',mimeType:'video/mp4',buffer:fs.readFileSync(path.join(dir,'tones.mp4'))});await page.getByLabel('英文字幕').setInputFiles(path.join(dir,'english.srt'));await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('button',{name:'导入素材'})).toBeEnabled();
 const row=page.getByRole('article').filter({has:page.getByRole('heading',{name:'retry.mp4',exact:true})});await row.getByRole('button',{name:'生成练习包',exact:true}).click();await expect(row.getByRole('status')).toContainText('生成学习资料失败',{timeout:30000});
 const material=(await(await page.request.get('/api/materials')).json())[0];const url=`/api/materials/${material.id}/tasks`;
 const failed=(await(await page.request.get(url)).json())[0];expect(failed.model_attempts).toBe(3);
 await row.getByRole('button',{name:'重试预处理',exact:true}).click();await expect.poll(async()=> (await(await page.request.get(url)).json())[0].id).not.toBe(failed.id);
 await expect.poll(async()=> (await(await page.request.get(url)).json())[0].status).toBe('failed');
 const retry=(await(await page.request.get(url)).json())[0];expect(retry.retry_of).toBe(failed.id);expect(retry.reused_artifacts).toContain('selection-0');expect(retry.model_attempts).toBe(2);
});
