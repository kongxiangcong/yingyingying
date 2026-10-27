Status: resolved
Type: task
# 05 修复实际生成服务的原生模型入口

用户生成 Muddy Puddles 失败：检查素材阶段拒绝 shell 包装器。
现场：任务 62b070b59b07493586ae5dcf7c2b31ea，provider=codex，model 为空；默认 which(codex) 命中 npm codex.cmd。settings() 原样复现 CONFIG 错误。
本机存在原生 codex.exe (0.164.0-alpha.11.1)，已使用 ChatGPT 登录，用户 Codex 配置模型 gpt-6-astra。已有 tiny.en 离线模型和 alignment 库。
添加明确启动入口 scripts/start_local.py，--use-local-codex 表示复用已有本机登录和模型，--local-alignment 接入已缓存离线识别器。--check 仅预检，不调用模型。保持原有 shell 拒绝策略及凭据边界。
接下来：安全重启已确认的 workspace 服务并重试用户失败任务，跟踪真实生成结果。


## Progress
- PASS `scripts/start_local.py --use-local-codex --local-alignment --check`：原生 codex.exe、模型 gpt-6-astra、对齐已配置、数据仍为项目 .data。
- 已确认旧端口 8000 属于本项目 uvicorn 后重启为新配置；新 API PID 18956，启动日志 .scratch/demo-runtime/configured-api*.log，已有素材与 UI 轮询正常。
- 原生 CLI `--version` 与 `login status`：0.164.0-alpha.11.1，Logged in using ChatGPT。未读取或打印凭据。
- 自动审批拒绝实际 POST 重试：要求用户明确允许必要字幕文本发送给已有 Codex 登录所连接的模型。已通过异步确认请求等待选择；没有执行替代方式绕过。
- README 增加持久可复现的启动命令。原有 model_adapter shell 拒绝规则保持。

## 用户授权与实际重试
用户通过异步问题明确选择「允许重试」，授权必要英文字幕文本发送给已登录 Codex（gpt-6-astra），视频/音频留在本机。已重试，任务 005ab09f6db24440bf2974d3e4bf8dc2，retry_of=62b070b59b07493586ae5dcf7c2b31ea。检查阶段已通过，进入 select，model_attempts=1。

第一次实际重试结果：选句 13 条成功；generate 两次 300 秒超时，TIMEOUT，未发布。缩小资料生成批次为最多4句，选择阶段仍使用既有分块，缓存命中仍需同指纹并经过当前数量/来源验证。继续同素材、同模型重试。

小批次任务 fa135c9f21f7466f8debb055ce4d24ab：两次 INVALID_OUTPUT（数量与选句不一致），未发布，未复用无效资料。增强生成请求的 expected_unit_ids/expected_question_count、明确 context 仅为参考；Codex 使用已安装 CLI 确认支持的 --output-schema 限制数量及来源枚举。再次失败时提供上一次校验反馈，保留原有发布校验。当前重试 8ca2a12a0a3349c1a139dddb0a02f984，复用两个 selection 缓存。

结构化约束后真实任务已产出 generation-0.json（4题），全部通过既有 validator。剩余批次未完成，不能视作练习包已发布。隔离回归 preprocessing.spec.ts 2 passed (30.9s)；增强约束后 preprocessing 两例继续通过；model-adapters.spec.ts 经修正正式界面返回素材库的导航步骤后 2 passed (1.2m)，包含 Codex/DeepSeek 供应商和故障回归。


## Answer / 最终交付
- 用户已明确授权同一 Muddy Puddles 素材的必要英文字幕发送至已登录 Codex。视频/音频保留本地。没有授权外的新素材生成任务。
- 原生入口和模型配置已修复，scripts/start_local.py 与 README 提供可复现启动入口。
- 第一轮真实生成两次 TIMEOUT；小批次重试出现数量不一致。修复为生成批次最多4题、明确目标来源/数量、Codex --output-schema、失败校验反馈。既有缓存和发布校验保留，未绕过检查。
- 最终任务 8ca2a12a0a3349c1a139dddb0a02f984 succeeded/publish；包 87e6fb7284b740a5b5db1103e0c1c319，真实 Codex 模型 gpt-6-astra，真实离线 faster-whisper-local-tiny.en，alignment_fixture_only=false。
- 13条候选全部生成资料，最终1题通过声音校验；6条 ambiguous_or_missing_transcript、5条 low_recognition_confidence、1条 no_safe_quiet_gap。此结果只是一道可用题，不是整段视频完整题库。
- 最终题目暂停点198805ms，6个空位。真实正式页面检查：从视频详情进入学习，通过学习菜单的模式选择填空；中文题目可见，6个输入为空，视频暂停。截图 ../muddy-puddles-real-generated.png。未代用户填写答案或完成题目。
- 界面验证发现并修正运行状态不同步：前端已换为节目/视频详情，新后端文件未被旧服务加载，/api/programs返回404。确认无active任务后重启本项目API加载当前源码，并保持原生模型/对齐配置及 .data；随后实际界面检查成功。同期其他UI/素材库改动保留，没有覆盖。
- 回归：预处理两例通过；Codex/DeepSeek适配两例通过（修正旧测试的返回素材库导航）。当前页面真实视频学习 smoke 通过。

## Remaining limitation
自动识别/安全停顿规则目前只允许发布1题，改善覆盖率仍需单独评估识别模型与声音证据；没有降低置信度门槛、伪造时间或宣称全部题库完成。其他12个新视频尚未生成练习包。

任务至此完成：原始入口错误消除，已授权任务真实发布，并核验空位。未提交、推送或部署。
- 最终同步源码后 `npm run build` PASS (37 modules)。`git diff --check` 发现当前其他UI工作中的 src/main.tsx:78 EOF空行；本任务的模型/worker/启动脚本改动无空白错误，未擅自改写并行UI文件。
- 实际学习截图已等待视频跳转/解码完成，确保背景对应198805ms剧情帧，而非最初封面。
