Status: resolved
Type: task
# 03 将 A 全屏沉浸应用到正式学习界面

用户选择 A，保留蒙版浓度调节。当前实施：真实视频背景铺满窗口；填空/看剧情/句式卡沿用真实学习数据；蒙版 50–90%，默认 74%，本机偏好持久化。未完成题目不开放句式卡以避免泄题；看剧情只展示暂停帧，不跳过题目。沿用既有保存、提示、计分及自动续播。
原型代码已移至 ../prototype-source，保留对照证据，正式入口移除原型切换器。未提交/推送。


## Answer
A 正式落地。真实视频填空背景覆盖窗口，输入、题意居中；播放时保持原视频比例。蒙版滑块位于底部，默认 74%，范围 50–90%，localStorage 偏好读取失败时仍可操作。模式为填空、看剧情、句式卡；暂停题不因切换模式跳过，草稿组件保持挂载。句式卡只取当前位置之前已完成题目，切卡暂停视频，继续播放退出卡片。下一题自动回到填空。

## Verification
- PASS npm run build（TypeScript + Vite，36 modules，原型不参与打包）。
- PASS 生产 preview 上 hints.spec.ts、reconstruction.spec.ts，原提示保存与 PCM 音频防泄题回归通过。
- PASS 最终 immersive.spec.ts：1 passed (14.7s)。五种屏幕 1440×900、1024×768、390×844、320×740、844×390，实际截图检查；页面/题目内部无滚动、蒙版可达、切换不丢草稿、查看剧情仍暂停、未完成不显示句式卡内容、完成后句式卡可用、重做、返回恢复及蒙版 65% 持久化均通过。
- 修复：刚完成题目但尚未播放到台词起点时，按 pause_ms 而非 start_ms 解锁句式卡。手机底部蒙版标签使用固定内容宽度，避免拆字。
- 测试使用隔离数据库和固定素材，不请求付费模型。截图在 ../production-verification/。真实视频背景来自生产播放器，未使用原型静帧。
- NOT_RUN：原生手机软键盘、读屏、非 Chromium 浏览器；全量回归未重跑。

## Comments
变更文件：src/LearningPlayer.tsx、src/style.css、src/main.tsx、tests/immersive.spec.ts。原型源码保存在 ../prototype-source；待选的 B/C 不在生产源码内。原型选择和相关记录见 02-prototype.md。
未提交、推送或部署。正式入口 http://127.0.0.1:5173/，选择素材播放即可。
