import path from 'node:path';
import {fixture} from './fixtures';
import {test,expect} from '@playwright/test';
test('reject malformed subtitles with a clear error',async({page})=>{
 await page.goto('/');
 await page.getByLabel('视频文件').setInputFiles(path.join(fixture,'source.mp4'));
 await page.getByLabel('英文字幕').setInputFiles({name:'invalid.srt',mimeType:'text/plain',buffer:Buffer.from('not subtitles')});
 await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('button',{name:'导入素材'})).toBeEnabled();
 await expect(page.getByRole('alert')).toContainText('字幕格式错误');
});

test('accept VTT and range reads, and reject invalid times and actual codecs',async({page})=>{
 await page.goto('/');
 await page.getByLabel('视频文件').setInputFiles(path.join(fixture,'source.mp4'));
 for(const text of ['1\n00:NaN:01,000 --> 00:00:02,000\nHello','1\n00:00:02,000 --> 00:00:01,000\nHello','1\n99:00:01,000 --> 99:00:02,000\nHello']){
  await page.getByLabel('英文字幕').setInputFiles({name:'bad.srt',mimeType:'text/plain',buffer:Buffer.from(text)});
  await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('button',{name:'导入素材'})).toBeEnabled();
  await expect(page.getByRole('alert')).toContainText('字幕时间');
 }
 await page.getByLabel('英文字幕').setInputFiles({name:'valid.vtt',mimeType:'text/vtt',buffer:Buffer.from('WEBVTT\n\n00:01.000 --> 00:04.000\nHello there.\n')});
 await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('button',{name:'导入素材'})).toBeEnabled();
 await expect(page.getByRole('button',{name:'播放 source.mp4'}).first()).toBeVisible();
 await page.getByRole('button',{name:'播放 source.mp4'}).first().click();
 const src=await page.locator('video').getAttribute('src');
 const response=await page.request.get(src!,{headers:{Range:'bytes=0-99'}});
 expect(response.status()).toBe(206);expect((await response.body()).length).toBe(100);
 await page.getByLabel('视频文件').setInputFiles({name:'fake.mp4',mimeType:'video/mp4',buffer:Buffer.from('invalid video')});
 await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('button',{name:'导入素材'})).toBeEnabled();
 await expect(page.getByRole('alert')).toContainText('H.264');
});
