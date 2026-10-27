# yingyingying（英英英）

一个通过视频情境学习英语的平台。观看剧情、根据中文提示还原角色台词，并通过句式卡、学习报告和错题本复习表达。

## 安装

以下步骤适用于 Windows PowerShell。需要 Python 3.11 或更高版本、Node.js 22.12 或更高版本，以及 FFmpeg（加入 PATH，或将可执行文件路径设置为环境变量 `FFMPEG_PATH`）。

```powershell
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.lock.txt
npm.cmd ci
```

## 启动

在项目目录中启动本地服务：

```powershell
.venv/Scripts/python -m uvicorn server.app:app --host 127.0.0.1 --port 8000
```

另开一个 PowerShell 窗口，在项目目录中启动界面：

```powershell
npm.cmd run dev
```

打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。数据默认保存在项目的 `.data/` 目录，也可在启动服务前通过环境变量 `SCENE_DATA_DIR` 指定其他位置。

## 使用

1. 在素材库导入自己的视频和英文字幕（SRT 或 VTT）。视频需为 H.264/AAC 编码的 MP4。仓库不包含视频、字幕或预制学习素材。
2. 为素材导入已有的练习包，或配置下述生成环境后生成练习包。
3. 播放视频，在暂停处根据中文和空位还原台词；需要时使用提示。完成后可以查看句式卡和学习报告，在错题本中复习。

## 生成练习包

自动生成需要可用的本地 Codex 登录和模型，以及本地语音识别器和模型。下面的命令安装 faster-whisper 到项目的本地工具目录，并下载英语识别模型；下载需要网络和磁盘空间。

```powershell
.venv/Scripts/python -m pip install --target .local-tools/alignment faster-whisper huggingface-hub
.venv/Scripts/python -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-base.en', cache_dir='.local-tools/models')"
.venv/Scripts/python scripts/start_local.py --use-local-codex --local-alignment --check
.venv/Scripts/python scripts/start_local.py --use-local-codex --local-alignment
```

使用最后一条命令启动后端，再按上面的步骤启动前端。启动器会读取现有 Codex 配置和登录状态，语音识别在本地运行；生成练习内容会调用所配置的模型服务。若检查提示缺少模型或工具，请按提示完成配置后重试。
