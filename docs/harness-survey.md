# 本机 harness 调查（2026-10-25）

此记录服务于工单 08/11。只检查安装与现有源代码；没有读取凭据、创建凭据或执行模型请求。

## 可用线索

- `Get-Command codex` 定位至用户 npm 安装的 PowerShell 包装器；本机 `@openai/codex/package.json` 的版本为 `0.130.0`，Node 入口为 `bin/codex.js`。产品适配应支持显式 argv 前缀，避免将字幕内容插入 shell 命令。
- `Get-Command dsh` 定位至 `D:/dsh-proj/dsh-desktop/resources/runtime/cli/bin/dsh.cmd`。该包装器设置 `ELECTRON_RUN_AS_NODE=1`，启动 `DeepSeek Harness.exe --expose-internals <app.asar 内的 cli.js>`。应在运行配置中选择明确入口，不能假定 `.cmd` 可像原生可执行文件一样安全传参。
- 已有项目 `D:/dsh-proj/ArcHa/opc/adapters/codex.py` 使用 `exec --json --skip-git-repo-check -s read-only`，可通过 `--output-schema` 约束输出；从 `item.completed` 的 `agent_message` 获取最终消息，并检查 `turn.failed` / `error`。
- `D:/dsh-proj/ArcHa/opc/adapters/dsh.py` 使用单次 `--profile headless --json`；从 `final.text` 获取最终消息，检查 `status/turn_end` 的 `reason.kind` 及 `reason.error.code`。其 JSON 输出仍需产品自己的结构校验。只读模式通过 `DSH_PERMISSION_MODE` 环境传入。
- 两个现有适配都处理超时；既有项目代码不能直接当作本应用已验证实现。

## 接入要求

1. 配置分别表达供应商、模型、超时与 argv 入口，保留实际生成来源。
2. 预处理只传有序字幕文本和必要上下文，不传视频。
3. 禁止将凭据、完整环境或原始工具事件无筛选记录至包或日志。
4. 自动化在外部模型边界使用确定性响应；产品正常模式不能无声退回固定响应。
5. 本次授权不包含真实模型调用。固定响应通过只证明应用集成，不能证明账户、认证或真实模型输出质量。
