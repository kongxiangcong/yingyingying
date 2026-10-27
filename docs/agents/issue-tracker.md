# Issue tracker: Local Markdown

规格和工单保存在 `.scratch/`。

## 文件约定

- 每个功能使用 `.scratch/<feature-slug>/` 目录。
- 规格位于该目录的 `spec.md`。
- 每张工单单独保存为 `issues/<NN>-<slug>.md`，从 01 开始编号。
- 工单顶部用 `Status:` 记录分诊状态，取值见 `triage-labels.md`。
- 评论和讨论追加至文件底部的 `## Comments`。

技能要求“发布到任务跟踪器”时，创建上述对应文件。
技能要求“获取相关工单”时，读取用户指定的路径或编号对应文件。

## Wayfinder 操作

- 地图位于 `.scratch/<effort>/map.md`，包含 Notes、
  Decisions-so-far 和 Fog。
- 子工单位于 `issues/NN-<slug>.md`，正文记录待解决的问题。
- `Type:` 取值为 research、prototype、grilling 或 task。
- Wayfinder 执行状态使用 `Status: open`、`claimed` 或 `resolved`。
- 依赖记录为 `Blocked by: NN, NN`；列出的工单全部 resolved 后解除阻塞。
- 按编号选择首个 open、无阻塞且未认领的工单。
- 开始工作前保存 `Status: claimed`。
- 完成后追加 `## Answer`，保存 `Status: resolved`，
  并在地图的 Decisions-so-far 中添加结论摘要和链接。
