import {openMaterial,openSettings,openMenu,chooseMode,publishFixture} from './libraryUi';
import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import {generateMediaFixture} from './mediaFixture';
const dir=path.resolve('.test-fixtures/enter-fill');
test.beforeAll(()=>generateMediaFixture(dir,"1\n00:00:02,200 --> 00:00:02,800\nDon't re-enter, please.\n\n2\n00:00:05,200 --> 00:00:05,800\nTry it again.\n"));
async function open(page:Page,name:string){
 await page.goto('/');
 await page.getByRole('button',{name:'＋ 上传素材'}).click();await page.getByLabel('视频文件',{exact:true}).setInputFiles({name,mimeType:'video/mp4',buffer:fs.readFileSync(path.join(dir,'tones.mp4'))});
 await page.getByLabel('英文字幕').setInputFiles(path.join(dir,'english.srt'));
 await page.getByRole('button',{name:'导入素材',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await openMaterial(page,name);
}
test('fill on an unprepared video explains missing questions and generates a usable package',async({page})=>{
 await open(page,'fill-empty.mp4');
 await chooseMode(page,'填空');
 await expect(page.getByRole('heading',{name:'还没有填空题',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'准备学习资料',exact:true}).click();
 await expect(page.getByRole('heading',{name:'还没有填空题',exact:true})).toHaveCount(0,{timeout:30000});
 await expect(page.getByLabel('播放器已就绪')).toBeVisible();
 await chooseMode(page,'填空');
 await expect(page.getByRole('textbox',{name:'单词 1',exact:true})).toBeVisible();
});
test('clicking fill enters a pending question immediately and preserves drafts across modes',async({page})=>{
 await open(page,'fill-ready.mp4');
 const card={usage:'鼓励',pattern:'Try + 宾语',explanation:'祈使句',example:'Try this.',translation:'试试这个。'};
 const questions=[{id:'enter',source_ids:['2'],english:'Try it again.',chinese:'再试一次。',pause_ms:4500,start_ms:5200,end_ms:5800,card}];
 await publishFixture(page,{name:'ready.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({questions}))});
 await expect(page.getByLabel('播放器已就绪')).toBeVisible();
 await chooseMode(page,'填空');
 await expect(page.getByRole('heading',{name:'再试一次。',exact:true})).toBeVisible();
 expect(await page.locator('video').evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);
 expect(await page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeCloseTo(4.5,1);
 const first=page.getByRole('textbox',{name:'单词 1',exact:true});
 await first.fill('Tr');
 await chooseMode(page,'看剧情');
 await chooseMode(page,'填空');
 await expect(first).toHaveValue('Tr');
 await page.reload();
 await openMaterial(page,'fill-ready.mp4');
 await expect(first).toHaveValue('Tr');
 for(const [i,value] of ['Try','it','again'].entries())await page.getByRole('textbox',{name:`单词 ${i+1}`,exact:true}).fill(value);
 await expect(page.locator('.exercise-mask')).toHaveCount(0);
 await chooseMode(page,'填空');
 await expect(page.getByText('本次学习的原句已全部完成。',{exact:true})).toBeVisible();
 await openSettings(page);await page.getByText('题目回顾',{exact:true}).click();
 await page.getByRole('button',{name:'重做 第1题',exact:true}).click();
 await expect(page.getByRole('heading',{name:'再试一次。',exact:true})).toBeVisible();
 await expect(page.getByText('本次学习的原句已全部完成。',{exact:true})).not.toBeVisible();
});

