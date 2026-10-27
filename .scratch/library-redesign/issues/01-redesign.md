Status: ready-for-agent

# 素材库及学习界面重设计

范围与验收见 ../spec.md。

## Comments

2026-10-26：开始实施。已有 main、player、style、服务器预处理和多份测试的未提交修改，保留其业务逻辑。

## Delivery · 2026-10-26

Completion: implemented; targeted verification passed.

当前实现：Focus 风格素材库、节目创建与持久归类、实际视频封面卡片、详情、独立上传弹窗；左侧素材库/学习报告/设置，报告页提供报告与错题本。学习页模式/设置/总结/返回收进左上角，浏览器全屏隐藏状态栏，菜单通过悬停/键盘可访问；视频原生独立全屏入口在 Chromium 中禁用，避免丢失题目层。移除产品中的练习包 JSON 导入界面，测试改用现有服务 API 建立确定性数据。

修改文件：src/main.tsx、Modal.tsx、api.ts、LearningPlayer.tsx、VersionedLearningPlayer.tsx、PreprocessingPanel.tsx、style.css；server/app.py；tests/library-redesign.spec.ts、libraryUi.ts 及迁移后的 reconstruction/hints/enter-fill/import/reports/notebook/immersive 测试。其他先前修改未回滚。测试中途发现的等待条件、隔离服务 URL、导航无障碍名称问题已修正并复测。

真实数据：12 个标题明确的佩奇素材按节目展示；另核对两份 source.mp4 的字幕（Muddy Puddles、Peppa and George）后，通过节目 API 将其归入 peppa。共 14 份本地素材，不表示 14 个独立单集或全集。未删除重复素材，未改视频/字幕、学习版本、进度和报告。封面为本机 FFmpeg 提取帧。

验证（Chromium 156.0.8078.4）：
- PASS：npm run build；Python py_compile server/app.py。
- PASS：14 项定向 Playwright 测试，分组运行：library-redesign 2、enter-fill 2、hints 1、reconstruction 1、import 1、reports 3、notebook 3、immersive 1。
- PASS：最终改动后重跑 library-redesign 2 项；真实服务+合成 MP4 覆盖可选字幕提取、缺字幕失败保留文件、节目持久化、新建/空状态/搜索、详情、草稿切换、全屏、缩放视口、提示及总结。
- PASS：原句重构 PCM 检查，未揭晓目标声音幅度小于 0.01，正常播放约 0.40；仅合成音频，不作为真实佩奇字幕或声音边界质量证明。
- PASS：宽屏 1440×900/1024×768，窄屏 390×844/320×740，横屏 844×390；八词题、提示、局部滚动、减少动态效果与合成 IME Enter；截图已检查。
- PASS：生产 vite preview 5192，14 个真实素材、原生 dialog 的键盘背景隔离与 Escape 焦点恢复、320px 上传窗口、无页面 JS 错误。原生 dialog Tab 循环允许焦点暂时到浏览器 UI（document.activeElement 为 BODY），不把该行为误报为背景控件泄漏。
- NOT_RUN：全量历史测试套件；未迁移的旧 UI 测试仍引用已移除的常驻上传/练习包导入/旧卡片入口，不能据本次 14 项宣称全套通过。原生操作系统 IME、读屏、Safari/Firefox、200% 字体缩放未验证。
- NOT_APPLICABLE：付费/真实模型生成、能力等级评估、烧录字幕 OCR、本次新增视频下载。能力分析按用户要求留待后续；已内嵌的英文文本字幕支持单视频上传，画面烧录字幕仍需配套文件。

本地查看：开发预览 http://127.0.0.1:5190 ，生产预览 http://127.0.0.1:5192 ，都使用 8020 API 与既有本地数据。进程记录 preview-processes.json、production-pid.txt；没有提交、推送、部署或安装依赖。

截图：../screenshots/peppa-library.png、upload.png、peppa-mobile.png、learning-fullscreen.png、learning-settings.png、production-upload-320.png。基准旧 CSS 保存在 ../baseline-style.css；未声称像素级复制 Focus。

后续独立维护：将剩余旧 UI 测试迁移到 libraryUi.ts 边界；能力评估与趋势分析按后续产品开发处理。
