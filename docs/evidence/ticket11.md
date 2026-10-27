# 11 双模型入口验收

日期：2026-10-25。规格：`.scratch/english-scene-learning/issues/11-alternate-model-adapter.md`。

## 本机入口调查

已读取 `docs/harness-survey.md`、ArcHa 的 `opc/adapters/dsh.py`，并运行本机已安装 DeepSeek Harness 的 launcher `--help` 与 `--profile headless --help`，核验 `--profile`、`--patch`、`--json` 和 stdin `-`。headless 帮助使用本工单本地临时 `DSH_HOME`，不改个人配置、不调用模型。

Codex 与 DeepSeek 的调用方式保持分开：Codex 使用 `exec --json -s read-only` 和 `item.completed/agent_message`；DeepSeek 使用 invocation-local `agent-default-model` patch、headless/JSON/stdin 参数，以及 `final` 和成功 `status/turn_end`。DeepSeek 接受其常见的 fenced JSON 最终文本，但没有成功结束事件时拒绝发布。

## 红绿过程与浏览器验证

首次应用红测试中，DeepSeek 素材卡显示“当前仅配置 Codex 入口”，无法发布。实现后两个入口的完整生成与学习流程通过（40.0 秒）。随后合并工单 10 的独立声音认证，并保留模型与声音两种来源信息；两项适配器测试再次通过（50.9 秒），生产构建通过。

`tests/model-adapters.spec.ts` 分别启动真实 API、Vite、SQLite、独立预处理 worker 与 HTML video，只将外部 Codex/DeepSeek 命令替换为固定响应程序。独立声音认证使用明确的人工边界夹具，不由业务模型返回时间。

两种入口均生成相同两道原句、跨字幕来源、缩写/连字符空位与完整句式卡；包保留所选入口/模型/提示版本/来源，DeepSeek 额外保留实际供应商 ID。浏览器填写第一题后自动继续，第二题直接揭晓，记录保存且学习阶段没有外部模型请求。

DeepSeek 固定程序检查 headless argv、临时模型 patch、只读权限和清除旧会话环境。再分别注入：

- 结构化 `AUTH` 失败，公开任务保持 `error_code=AUTH`。
- 带模拟秘密的未知错误码及原始消息，公开任务归为 `UNKNOWN`，任务、页面和捕获的真实服务日志都不包含模拟秘密。
- 只有合法 `final` 文本而没有完成事件，拒绝发布并归为 `UNKNOWN`。

这些失败均有限尝试两次，不替换旧可用包；修复外部响应后从界面重试成功，复用工单 09 的相同机制。

## 证据边界

没有真实 Codex 或 DeepSeek 模型请求，没有创建、读取或写入凭据。CLI 帮助和固定响应测试不能证明真实认证、服务可用性或模型资料质量。生成后学习、报告、错题仍读取本地包，不调用模型。声音认证保留独立引擎与时间证书，没有被模型来源元数据覆盖。

## 最终组合复验

同步集成分支工单 10 后，使用项目隔离 Python、真实前端/API/SQLite/worker 与独立测试端口运行完整 28 项浏览器测试，全部通过（5.4 分钟）；生产 TypeScript/Vite 构建通过。覆盖两个模型入口、提示、错题本、模型故障矩阵、进程中断/服务重启、报告、跳转恢复，以及 Peppa 实际声音与独立时间边界的夹具验收。实际本地识别引擎的单独验证由 10 保留，本次组合运行没有发起真实 LLM 调用。
