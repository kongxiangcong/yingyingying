import {openMaterial,openSettings,openMenu,chooseMode,publishFixture} from './libraryUi';
import {test,expect} from '@playwright/test';
import path from 'node:path';
import {fixture} from './fixtures';
test('import video, persist library, play and seek with English subtitles',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'＋ 上传素材'}).click();await page.getByLabel('视频文件',{exact:true}).setInputFiles(path.join(fixture,'source.mp4'));
 await page.getByLabel('英文字幕').setInputFiles(path.join(fixture,'english.srt'));
 await page.getByRole('button',{name:'导入素材'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'查看详情 source.mp4'}).first()).toBeVisible({timeout:30000});
 await page.reload();
 await openMaterial(page,'source.mp4');
 await expect(page.getByLabel('播放器已就绪')).toBeVisible();
 await expect(page.locator('video')).toHaveAttribute('controls','');
 await page.locator('video').evaluate((v:HTMLVideoElement)=>{v.currentTime=60;return v.play()});
 await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(60);
 await expect(page.locator('[data-testid="subtitle"]')).toBeVisible();
});
