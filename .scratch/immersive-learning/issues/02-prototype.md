Status: resolved
Type: prototype
# 02 剧情蒙版学习界面原型

## Question
在保留剧情背景、浅色蒙版、居中文本与空位、一屏学习的前提下，用户选择哪种整体布局？

## Answer
原型交付，设计选择待用户检查。未将任一方案提升为正式产品设计。

代码：src/prototype/LearningPrototype.tsx、learning-prototype.css、scene.jpg。src/main.tsx 仅增加开发态 query 入口，生产构建不包含原型。src/vite-env.d.ts 提供 Vite 类型。

入口：http://127.0.0.1:5173/?prototype=learning&variant=A
启动：npm run dev（已有本机开发服务可直接查看）。
A 全屏沉浸：剧情铺满整个学习空间；B 侧栏舞台：模式放入左侧栏；C 影院视窗：深色外围框定剧情，模式位于底部。
底部原型切换栏支持左右箭头、键盘左右键与 URL variant 参数；输入中不拦截左右键。蒙版 50–90% 可调。可填写、提示、揭晓、重填、切换静帧与句式卡，状态仅在内存，不调用学习 API。
图片来源：项目 test-materials/peppa-pig-muddy-puddles/source.mp4 的 198.8 秒帧。内容与原句为该项目已有示例。剧情模式展示静帧，没有模拟视频播放。

## Evidence
PASS npm run build，生产构建仍为 36 modules，无原型资源输出。
已在 Chromium 打开本机开发服务，检查三个方案、填写、提示、蒙版调节和句式卡；1440×900 三方案及 390×844 A 方案截图位于 ../prototype/。
未增加自动化测试套件。此原型用于布局选择，非正式功能验收。真实视频与数据持久化不在本原型范围。
未 commit/push。用户选择后再决定正式实现与原型归档。

## 用户选择
用户确认 A 全屏沉浸并要求保留蒙版浓度调节。已由 03-apply-a.md 接管正式实施，源码移至 ../prototype-source 保存；正式入口不再挂载原型。
