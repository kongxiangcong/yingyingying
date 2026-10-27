Status: resolved
Type: task
# 04 选择填空应进入题目；无练习包时给出生成入口

2026-10-26 用户反馈点击填空没有挖空。
只读现场检查：新导入的 12 个 Peppa 视频都没有版本；两个 source.mp4 中一个无版本，另一个仅一道 198825ms 的演示题。changeMode 只更新外观，不激活题目；WordExercise 仅 active 非空时渲染。新测试 tests/enter-fill.spec.ts 覆盖无包生成和现有包点击后直接进入空位，先验证失败再修复。
修复范围：复用 PreprocessingPanel 真实任务生成入口；点击填空进入下一道未完成题，保持已有作答、保存与自动播放。自然剧情播放仍按原时间自动弹题。
不自动启动真实素材的模型生成；生成按钮沿用现有项目配置与错误/重试反馈。


## Answer
根因已确认：无练习包的视频仍允许选中填空但缺少任何说明；已加载包时填空按钮只改 mode，没有激活题目。修复为：
- 无包显示居中「还没有填空题」及真实生成入口，复用 PreprocessingPanel 的任务轮询、失败反馈与重试；发布后刷新版本并加载包。
- 有包且无活动题时，点击填空跳到下一道未完成题的 pause_ms，暂停并显示中文与逐词空位；当前已有活动题则只恢复显示，保留草稿。
- 全部完成时显示完成反馈；从回顾重做会清除完成提示。
- 普通播放的自动弹题、答对续播和音频门控沿用既有流程。

## Verification
- 修改前 tests/enter-fill.spec.ts 两个用例均失败：分别找不到「还没有填空题」和点击后找不到「再试一次。」。
- 修复后 enter-fill.spec.ts + immersive.spec.ts：3 passed (31.5s)。其中生成流程使用隔离服务、真实预处理 worker、固定模型/对齐响应。
- npm run build PASS；git diff --check PASS。
- 只读打开实际素材 Learn the alphabet，确认桌面 1440×900 和手机 390×844 的准备界面可见；截图 ../fill-empty-desktop.png、../fill-empty-mobile.png。
- 未启动用户真实视频的生成任务，未更改其学习记录。12 个新视频仍需通过生成入口准备练习包。

修改文件：src/LearningPlayer.tsx、src/VersionedLearningPlayer.tsx、src/style.css、tests/enter-fill.spec.ts。其他已有改动保留。
- 最终复测 enter-fill.spec.ts + reconstruction.spec.ts：3 passed (35.0s)，包含完成后重做、刷新恢复草稿及实际 PCM 音频门控回归。
