import {test,expect} from '@playwright/test';
import path from 'node:path';
import {generateMediaFixture} from './mediaFixture';
const dir=path.resolve('.test-fixtures/preprocessing');
test.beforeAll(()=>generateMediaFixture(dir,"1\n00:00:02,200 --> 00:00:02,400\nDon't re-enter,\n\n2\n00:00:02,400 --> 00:00:02,800\nplease.\n\n3\n00:00:05,200 --> 00:00:05,800\nTry it again.\n\n4\n00:00:06,600 --> 00:00:07,000\n- Yes.\n- No.\n"));
test('generate with independent worker and fixed external Codex response, then learn',async({page},testInfo)=>{
 await page.goto('/');await page.getByLabel('视频文件').setInputFiles(path.join(dir,'tones.mp4'));await page.getByLabel('英文字幕').setInputFiles(path.join(dir,'english.srt'));await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('button',{name:'导入素材'})).toBeEnabled();
 const row=page.getByRole('article').filter({has:page.getByRole('heading',{name:'tones.mp4',exact:true})}).first();
 await row.getByRole('button',{name:'生成练习包',exact:true}).click();
 await expect(row.getByRole('status')).toContainText('练习包已发布',{timeout:30000});
 const materials=await(await page.request.get('/api/materials')).json();const material=materials[0];
 const tasks=await(await page.request.get(`/api/materials/${material.id}/tasks`)).json();
 expect(tasks[0]).toMatchObject({status:'succeeded',stage:'publish'});expect(tasks[0].worker_pid).toBeGreaterThan(0);
 expect(tasks[0].stages).toEqual(['check','parse','context','select','generate','assemble','validate','publish']);
 const packages=await(await page.request.get(`/api/materials/${material.id}/packages`)).json();expect(packages).toHaveLength(1);
 const pack=await(await page.request.get(`/api/packages/${packages[0].id}`)).json();
 expect(pack.questions).toHaveLength(2);expect(pack.questions[0]).toMatchObject({source_ids:['1','2'],english:"Don't re-enter, please."});expect(pack.questions[1].source_ids).toEqual(['3']);expect(pack.provenance).toMatchObject({provider:'codex',model:'fixture-codex-model',prompt_version:'scene-v1'});
 await row.getByRole('button',{name:'播放 tones.mp4'}).click();await expect(page.getByLabel('播放器已就绪')).toBeVisible();
 const external:string[]=[];page.on('request',request=>{if(!request.url().startsWith(new URL(page.url()).origin))external.push(request.url())});
 await page.locator('video').evaluate((video:HTMLVideoElement)=>video.play());await expect(page.getByRole('heading',{name:'请不要再次进入。',exact:true})).toBeVisible();await expect(page.getByTestId('subtitle')).not.toContainText("Don't");
 await page.screenshot({path:testInfo.outputPath('generated-learning.png'),fullPage:true});
 for(const [index,value] of ["DON’T",'re-enter','please'].entries())await page.getByRole('textbox',{name:`单词 ${index+1}`,exact:true}).fill(value);
 await expect(page.getByRole('heading',{name:'再试一次。',exact:true})).toBeVisible();await page.getByRole('button',{name:'直接揭晓',exact:true}).click();
 await expect.poll(async()=>Object.values(await(await page.request.get(`/api/packages/${pack.id}/attempts`)).json()).filter((attempt:any)=>attempt.completed).length).toBe(2);expect(external).toEqual([]);
});

test('preprocessing failure shows its stage and never exposes an incomplete package',async({page})=>{
 await page.goto('/');await page.getByLabel('视频文件').setInputFiles({name:'generation-failure.mp4',mimeType:'video/mp4',buffer:await import('node:fs').then(fs=>fs.readFileSync(path.join(dir,'tones.mp4')))});
 await page.getByLabel('英文字幕').setInputFiles({name:'failure.srt',mimeType:'text/plain',buffer:Buffer.from('1\n00:00:02,200 --> 00:00:02,800\nPlease speak clearly.\n')});
 await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('button',{name:'导入素材'})).toBeEnabled();
 const row=page.getByRole('article').filter({has:page.getByRole('heading',{name:'generation-failure.mp4',exact:true})});
 await row.getByRole('button',{name:'生成练习包',exact:true}).click();await expect(row.getByRole('status')).toContainText('生成学习资料失败',{timeout:30000});
 const materials=await(await page.request.get('/api/materials')).json();const material=materials.find((item:any)=>item.name==='generation-failure.mp4');
 expect(await(await page.request.get(`/api/materials/${material.id}/packages`)).json()).toEqual([]);
 await page.reload();await expect(page.getByRole('article').filter({has:page.getByRole('heading',{name:'generation-failure.mp4',exact:true})}).getByRole('status')).toContainText('生成学习资料失败');
});
