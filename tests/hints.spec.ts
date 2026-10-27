import {openMaterial,openSettings,openMenu,chooseMode,publishFixture} from './libraryUi';
import {test,expect} from '@playwright/test';
import path from 'node:path';
import {generateMediaFixture} from './mediaFixture';
const dir=path.resolve('.test-fixtures/hints');
test.beforeAll(()=>generateMediaFixture(dir,'1\n00:00:02,200 --> 00:00:02,800\nDo it, do it again.\n\n2\n00:00:05,200 --> 00:00:05,800\nTry it again.\n\n3\n00:00:07,100 --> 00:00:07,800\nPlease try again.\n'));
test('hints preserve conflicts and duplicate words, reveal jumps, and next questions reset',async({page},testInfo)=>{
 let attemptsUrl='';page.on('request',req=>{if(req.url().endsWith('/attempts'))attemptsUrl=req.url()});
 await page.goto('/');await page.getByRole('button',{name:'＋ 上传素材'}).click();await page.getByLabel('视频文件',{exact:true}).setInputFiles(path.join(dir,'tones.mp4'));await page.getByLabel('英文字幕').setInputFiles(path.join(dir,'english.srt'));await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await openMaterial(page,'tones.mp4');
 const card={usage:'鼓励',pattern:'祈使句',explanation:'动词原形',example:'Try this.',translation:'试试这个。'};
 const questions=[{id:'h1',source_ids:['1'],english:'Do it, do it again.',chinese:'再做一次。',pause_ms:1500,start_ms:2200,end_ms:2800,hint_indices:[0],card},{id:'h2',source_ids:['2'],english:'Try it again.',chinese:'再试一次。',pause_ms:4500,start_ms:5200,end_ms:5800,hint_indices:[0],card},{id:'h3',source_ids:['3'],english:'Please try again.',chinese:'请再试一次。',pause_ms:6400,start_ms:7100,end_ms:7800,hint_indices:[0],card}];
 for(const indices of [[],[0,1,2,3,4],[-1]]){
  await publishFixture(page,{name:'invalid-hints.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({questions:questions.map((q,index)=>index===0?{...q,hint_indices:indices}:q)}))},'揭词索引无效');
 }
 await publishFixture(page,{name:'hints.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({questions}))});await expect(page.getByLabel('播放器已就绪')).toBeVisible();await page.locator('video').evaluate((v:HTMLVideoElement)=>v.play());await expect(page.getByRole('heading',{name:'再做一次。',exact:true})).toBeVisible();
 const word=(i:number)=>page.getByRole('textbox',{name:`单词 ${i+1}`,exact:true});
 await expect(page.getByRole('textbox')).toHaveCount(5);await word(0).fill('Wrong');await expect(page.getByRole('button',{name:'Tips Pro',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Tips Pro Max',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Tips',exact:true}).click();await expect(page.getByRole('button',{name:'Tips Pro Max',exact:true})).toBeDisabled();await expect(word(0)).toHaveValue('Do');await expect(word(0)).toHaveAttribute('readonly','');await expect(page.getByText('原始作答：Wrong')).toBeVisible();
 await page.getByRole('button',{name:'Tips Pro',exact:true}).click();await expect(page.getByTestId('candidate-word')).toHaveCount(4);await expect(page.getByTestId('candidate-word').filter({hasText:/^it$/})).toHaveCount(2);await expect(page.getByRole('textbox')).toHaveCount(5);
 const candidates=await page.getByTestId('candidate-word').allTextContents();expect([...candidates].sort()).toEqual(['again','do','it','it']);expect(candidates).not.toEqual(['it','do','it','again']);
 await expect(page.getByRole('button',{name:'Tips',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Tips Pro',exact:true})).toBeDisabled();
 await page.screenshot({path:testInfo.outputPath('hints.png')});
 await expect.poll(async()=> (await (await page.request.get(attemptsUrl)).json()).h1).toMatchObject({highest_hint:2,completed:false,inputs:['Wrong','','','','']});
 await page.reload();await openMaterial(page,'tones.mp4');await expect(page.getByLabel('播放器已就绪')).toBeVisible();expect(await page.locator('video').evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);await expect(page.getByRole('heading',{name:'再做一次。',exact:true})).toBeVisible();await expect(word(0)).toHaveValue('Do');await expect(page.getByText('原始作答：Wrong')).toBeVisible();await expect(page.getByTestId('candidate-word')).toHaveCount(4);
 for(const [i,value] of ['it','do','it','again'].entries())await word(i+1).fill(value);
 await expect(page.getByRole('heading',{name:'再试一次。',exact:true})).toBeVisible();await expect(page.getByTestId('candidate-word')).toHaveCount(0);await expect(word(0)).toHaveValue('');await expect(page.getByRole('button',{name:'Tips',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'直接揭晓',exact:true}).click();await expect(page.getByRole('heading',{name:'再试一次。',exact:true})).not.toBeVisible();
 await expect(page.getByRole('heading',{name:'请再试一次。',exact:true})).toBeVisible();await expect(word(0)).toHaveValue('');await page.getByRole('button',{name:'Tips',exact:true}).click();await page.getByRole('button',{name:'Tips Pro',exact:true}).click();await page.getByRole('button',{name:'Tips Pro Max',exact:true}).click();
 await expect.poll(async()=> (await (await page.request.get(attemptsUrl)).json()).h3).toMatchObject({highest_hint:3,completed:true,revealed:true});
 const saved=await (await page.request.get(attemptsUrl)).json();expect(saved.h1).toMatchObject({highest_hint:2,completed:true,revealed:false,inputs:['Wrong','it','do','it','again']});expect(saved.h2).toMatchObject({highest_hint:3,completed:true,revealed:true,inputs:['','','']});await openSettings(page);await page.getByText('题目回顾',{exact:true}).click();await expect(page.getByText('无提示通过：0')).toBeVisible();
});
