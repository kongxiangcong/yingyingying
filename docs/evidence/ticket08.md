# 08 字幕生成练习包验收

日期：2026-10-25。测试使用真实 React/FastAPI/SQLite/HTML video 和独立 Python 预处理工作进程；仅外部模型命令替换为确定性 Codex 事件响应脚本。

## 红绿流程与用户行为

`tests/preprocessing.spec.ts` 首先因素材卡缺少“生成练习包”失败（30 秒超时）；实现后，生成至两题连续学习的单项测试通过（17.2 秒），生产构建通过。随后完整 7 项真实浏览器测试通过（42.9 秒），包含既有导入、提示与 PCM 声音回归。最终增加 Codex argv 只读契约检查与实际生成界面截图。

- 从浏览器上传真实 H.264/AAC 短视频及英文 SRT，启动后台预处理，获得公开任务状态、独立 worker PID 和八阶段历史。
- `Don't re-enter,` 与下一条 `please.` 合并成原句，来源保留为 `['1','2']`；一条内双说话人台词跳过。小块重叠会重复提供上下文，但最终只发布两个不同来源题目。
- 模型返回中文、提示建议和完整句式卡；程序生成词单元并验证原句、索引与时间表。包记录 `provider=codex`、明确模型名、`prompt_version=scene-v1` 及素材/字幕来源。
- 从刚生成的包进入相同播放器，目标字幕隐藏，填写缩写/连字符原句后自动继续；下一题直接揭晓并保存。学习阶段浏览器无外部请求。
- 外部响应进程失败时，任务显示“生成学习资料失败”，版本列表保持为空；刷新后仍显示失败阶段，不暴露半成品。

## 模型与媒体证据边界

已调查现有 ArcHa harness 源码（见 `docs/harness-survey.md`），并执行本机 Codex `exec --help` 核验 `--json`、`--ephemeral`、`--skip-git-repo-check`、`-s read-only`、`-C`、`-m` 和 stdin 入口。帮助命令不发起模型请求。命令使用 argv 数组及 stdin，不插入 shell；未记录环境、凭据或原始工具事件。

真实 Codex 模型请求未获授权，因此未调用，也不声称认证、网络或真实输出质量已验证。测试只替换外部响应程序，真实应用未配置模型时明确失败，不降级成固定演示内容。

工单 08 的 `timing_method=subtitle-gap-candidate` 只描述确定性字幕间隙候选，不把字幕时间当作真实声音证据。确定性短视频仍使用真实媒体，但真实对白自动边界由工单 10 继续验证并加固。失败重试、有效产物复用和进程中断恢复留给工单 09。

## 运行

在 PowerShell 设置 `SCENE_PYTHON` 为根目录 `.venv/Scripts/python.exe`，`SCENE_API_PORT=8008`、`SCENE_UI_PORT=5181`，运行 `npx.cmd playwright test`。模型替换只存在于 Playwright 测试服务环境。

![生成包后的原句重构](ticket08-learning.png)
