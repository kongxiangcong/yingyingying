# Domain Docs

本项目采用 single-context 布局：
根目录 `GLOSSARY.md` 保存领域术语，`docs/adr/` 保存架构决策。

## 探索代码前

读取 `GLOSSARY.md`，并读取与当前工作相关的 ADR。
若以后存在 `GLOSSARY-MAP.md`，优先按其指引读取相关上下文。

上述文件缺失时直接继续。术语和决策实际明确后，
由 domain-modeling 技能按需创建。

## 术语与决策

输出中的领域概念采用词汇表定义的名称。
遇到尚未收录的概念，先判断是否沿用了项目现有术语；
确有缺口时记录给 domain-modeling。

方案与现有 ADR 冲突时，明确指出相关 ADR，
并说明重新讨论该决策的理由。
