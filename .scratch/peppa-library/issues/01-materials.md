Status: ready-for-agent
Type: task

# 检索、下载和导入佩奇学习材料

- [x] 阅读项目材料与领域约定，检查现有素材及未提交更改。
- [x] 检索官网与官方频道，核实单集视频和字幕下载。
- [x] 盘点可用短视频，下载配套素材，记录失败与缺集。
- [x] 校验本地 MP4/SRT，并通过既有导入边界加入素材库。
- [x] 保存材料清单与使用说明，报告真实覆盖范围。

## Comments

2026-10-26：已验证 George Pig - Official Channel，频道 ID `UCzkA5UTtr_vNYqMSB3DisVA`、YouTube verified=true。第一季第三集已取得 H.264/AAC MP4 与非自动英文字幕轨。项目已有《Muddy Puddles》旧样本，不改变其历史记录。

## Answer

2026-10-27 更新：本单下述旧批次已根据用户要求全部撤回并删除。当前实际可学素材以 03-rebuild-usable-materials.md 与 docs/peppa-library-inventory.md 为准。

2026-10-26：用户选择只收录已有英文字幕，缺字幕保留清单。检查两个官方频道的361个候选短视频，下载19组带 en 轨的文件，加上已发现的同集替代来源，共20组。内容复核发现8个 en 轨实际为频道宣传文案，已从应用撤回；这些条目没有练习包或学习记录，未触及原有用户进度。最终12个有效材料导入 `.data/`，包括来源明确标为 S01E01–10 的十集、自然主题视频和字母学习视频。共63.4分钟、1065条字幕，均完成全片解码及原有字幕校验。

完整盘点见 `docs/peppa-library-inventory.md`，说明见 `docs/peppa-library.md`。全集目标尚未完成，后续缺口单独跟踪于 `02-complete-series.md`。不把361个候选或12个学习视频称为全集。
