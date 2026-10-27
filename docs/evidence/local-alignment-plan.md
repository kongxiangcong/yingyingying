# 本地声音对齐验证待执行

2026-10-25。最初仅准备代码；用户明确允许本地对齐验证后已实际执行，完整结果见 ticket10.md 与 ticket10-real-alignment.json。整个验证没有 OpenAI/DeepSeek/Codex 调用或音视频上传。

实现入口：`scripts/align_local.py`。它只接受本机 WAV 路径与 SHA-256，不接收待匹配字幕，使用已有 `.local-tools/alignment` 的 faster-whisper 1.2.1 / ctranslate2 4.8.3 和缓存 tiny.en 做独立英文逐词识别。使用 CPU int8，默认 4 线程；关闭联网与模型下载，必须显式指定存在的模型目录。

当前缓存 `model.bin` 为 75,537,502 字节，tokenizer 为 2,128,466 字节。准备阶段不需要安装新库或下载大模型。整片约 310 秒输入；本轮实际CPU int8 / 4线程识别耗时20.052秒、CPU72.312秒；内存未单独测量。时间戳与选中词质量通过真实浏览器源语音相关验证，不依靠旧核对作为当前兼容性证明。

预备命令由环境 `SCENE_ALIGNMENT_COMMAND` 显式配置，数组值依次为：

1. 项目 `.venv/Scripts/python.exe`
2. `scripts/align_local.py` 绝对路径
3. `--library-dir`、项目 `.local-tools/alignment` 绝对路径
4. `--model-dir`、缓存 tiny.en snapshot 绝对路径

产品调用会把本机解码 WAV 路径及哈希以 JSON stdin 传入，逐词 JSON 从 stdout 返回。没有提供语义原句作为 prompt，避免模型被要求强行对齐错误字幕。程序再比对完整 token 序列、拒绝重复/不完整/低可信匹配，并结合真实静音区与边界余量选暂停点。

模型概率与 250ms 时间戳余量不是统计校准的绝对误差保证。该轻量识别器也不做说话人分离；明确多说话人字幕、已知重叠或歧义仍需拒绝。真实入口是否能在小猪佩奇上提供合格候选、以及浏览器声音输出是否按期望切断，已在本轮明确授权后完成该样本验证；未声称所有素材均通过。
