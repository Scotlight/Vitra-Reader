# 项目结构分析执行计划

- 日期：`2026-03-21`
- Internal Grade：`M`
- Topic：`project-structure-analysis`

## Waves

### Wave 1 — Skeleton Check

- 确认仓库根目录、分支、顶层目录
- 确认 `AGENTS.md` 约束和已启用技能

### Wave 2 — Structure Exploration

- 识别 Electron 主入口与 preload 桥
- 识别 React 入口与主视图切换点
- 识别书库、阅读器、引擎、存储、同步层
- 识别导入 → 解析 → 阅读主链

### Wave 3 — Synthesis

- 形成目录职责摘要
- 输出首批阅读文件顺序
- 给出事实型文件锚点

## Verification Commands

- `git branch --show-current`
- `Get-ChildItem -Force`
- `rg --files src/engine src/services src/stores src/hooks`
- `rg -n "ReaderView|LibraryView|VitraPipeline|importBook|storageService" ...`
- `mcp__ace-tool-rs__search_context`

## Rollback Rule

- 本次仅新增分析文档与回执，不触碰业务代码；如需回滚，仅删除本计划与回执文件即可。

## Cleanup Expectation

- 不遗留临时脚本
- 不启动持久后台进程
- 保留需求/计划/回执作为可追溯证据
