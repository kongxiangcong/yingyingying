import {openMaterial,openSettings,openMenu,chooseMode,publishFixture} from './libraryUi';
import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import {startLocalApp} from './localApp';
import {generateMediaFixture} from './mediaFixture';
const dir=path.resolve('.test-fixtures/reports');
const card={usage:'鼓励再次尝试',pattern:'Try + 宾语 + again',explanation:'用祈使句鼓励对方再做一次。',example:'Try this recipe again.',translation:'再试试这个食谱。'};
const questions=[
 {id:'r1',source_ids:['1'],english:'Try it again.',chinese:'再试一次。',pause_ms:1500,start_ms:2200,end_ms:2800,hint_indices:[0],card},
 {id:'r2',source_ids:['2'],english:'Keep trying.',chinese:'继续尝试。',pause_ms:3500,start_ms:4200,end_ms:4800,hint_indices:[0],card},
 {id:'r3',source_ids:['3'],english:'Please never reveal this secret.',chinese:'请不要泄露这个秘密。',pause_ms:5500,start_ms:6200,end_ms:6800,hint_indices:[0],card:{...card,explanation:'UNFINISHED CARD SECRET'}}
];
test.beforeAll(()=>generateMediaFixture(dir,'1\n00:00:02,200 --> 00:00:02,800\nTry it again.\n\n2\n00:00:04,200 --> 00:00:04,800\nKeep trying.\n\n3\n00:00:06,200 --> 00:00:06,800\nPlease never reveal this secret.\n'));
async function setup(page:Page,url='/'){
 await page.goto(url);await page.getByRole('button',{name:'＋ 上传素材'}).click();await page.getByLabel('视频文件',{exact:true}).setInputFiles({name:`report-${Date.now()}.mp4`,mimeType:'video/mp4',buffer:fs.readFileSync(path.join(dir,'tones.mp4'))});await page.getByLabel('英文字幕').setInputFiles(path.join(dir,'english.srt'));await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await page.getByRole('button',{name:/查看详情 report-/}).first().click();await page.getByRole('button',{name:'开始学习',exact:true}).click();await expect(page.getByLabel('播放器已就绪')).toBeVisible();
 await publishFixture(page,{name:'report.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({questions}))});await expect(page.getByLabel('播放器已就绪')).toBeVisible();
}
test('ending saves a report with cards only for finished questions, including partial hints',async({page},info)=>{
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await setup(page);await page.locator('video').evaluate((v:HTMLVideoElement)=>v.play());await expect(page.getByRole('heading',{name:'再试一次。',exact:true})).toBeVisible();
 for(const [i,word] of ['Try','it','again'].entries())await page.getByRole('textbox',{name:`单词 ${i+1}`,exact:true}).fill(word);
 await expect(page.getByRole('heading',{name:'继续尝试。',exact:true})).toBeVisible();await page.getByRole('button',{name:'直接揭晓',exact:true}).click();await expect(page.getByRole('heading',{name:'请不要泄露这个秘密。',exact:true})).toBeVisible();await page.getByRole('button',{name:'Tips',exact:true}).click();
 await openMenu(page);await page.getByRole('button',{name:'总结本次学习',exact:true}).click();
 await expect(page.getByRole('heading',{name:'学习报告',exact:true,level:2})).toBeVisible();await expect(page.getByText('主动结束')).toBeVisible();await expect(page.getByTestId('completed-count')).toHaveText('已完成 1');await expect(page.getByTestId('revealed-count')).toHaveText('揭晓 1');await expect(page.getByTestId('unfinished-count')).toHaveText('未做题 1');
 await expect(page.getByText('Try it again.',{exact:true})).toBeVisible();await expect(page.getByText('Keep trying.',{exact:true})).toBeVisible();await expect(page.getByText('Please never reveal this secret.',{exact:true})).not.toBeVisible();await expect(page.getByText('UNFINISHED CARD SECRET')).not.toBeVisible();await page.getByText('展开结构与迁移例句').first().click();await expect(page.getByText(card.example,{exact:true}).first()).toBeVisible();await expect(page.getByText(card.translation,{exact:true}).first()).toBeVisible();
 const reportId=new URL(page.url()).hash.slice('#report='.length);const saved=await(await page.request.get(`/api/reports/${reportId}`)).json();expect(saved.unfinished).toEqual([{question_id:'r3',position_ms:6200}]);expect(JSON.stringify(saved)).not.toContain('Please never reveal');expect(JSON.stringify(saved)).not.toContain('UNFINISHED CARD SECRET');expect(saved.counts).toMatchObject({completed:1,revealed:1,unfinished:1,no_hint:1,stalled:2});
 await page.screenshot({path:info.outputPath('report.png'),fullPage:true});await page.reload();await expect(page.getByRole('heading',{name:'学习报告',exact:true,level:2})).toBeVisible();await page.getByRole('button',{name:'返回素材库',exact:true}).click();await page.getByRole('link',{name:'学习报告',exact:true}).first().click();await page.getByRole('button',{name:/打开报告/}).first().click();await expect(page.getByTestId('unfinished-count')).toHaveText('未做题 1');expect(requests.every(url=>url.startsWith(new URL(page.url()).origin))).toBeTruthy();
});

test('natural video end immediately opens one saved report without a model',async({page})=>{
 const reportPosts:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/reports'))reportPosts.push(r.url())});
 await setup(page);await page.locator('video').evaluate((v:HTMLVideoElement)=>v.play());
 for(const chinese of ['再试一次。','继续尝试。','请不要泄露这个秘密。']){
  await expect(page.getByRole('heading',{name:chinese,exact:true})).toBeVisible();await page.getByRole('button',{name:'直接揭晓',exact:true}).click();
 }
 await expect(page.getByRole('heading',{name:'学习报告',exact:true,level:2})).toBeVisible();await expect(page.getByText('视频结束')).toBeVisible();await expect(page.getByTestId('revealed-count')).toHaveText('揭晓 3');await expect(page.getByTestId('unfinished-count')).toHaveText('未做题 0');expect(reportPosts).toHaveLength(1);
});

test('a saved report reopens through the browser after the API process restarts',async({page})=>{
 test.setTimeout(60000);
 const app=await startLocalApp(page);
 try{
  await setup(page,app.url);
  await openMenu(page);await page.getByRole('button',{name:'总结本次学习',exact:true}).click();await expect(page.getByTestId('unfinished-count')).toHaveText('未做题 3');const reportUrl=page.url();
  await app.restartApi();await page.reload();await expect(page.getByRole('heading',{name:'学习报告',exact:true,level:2})).toBeVisible();expect(page.url()).toBe(reportUrl);await expect(page.getByTestId('unfinished-count')).toHaveText('未做题 3');await expect(page.getByText('Try it again.',{exact:true})).not.toBeVisible();
 }finally{await app.close()}
});
