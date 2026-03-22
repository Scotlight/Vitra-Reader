# 项目文档体系总览

本目录用于承载本项目的“全项目级权威规范”文档。

## 文档真值边界

为避免文档与源码冲突，以下边界固定：

- 源码是真值：接口签名、类型定义、实际运行行为、构建脚本、配置项默认值
- 测试与样本是真值：行为正确性、回归判断、兼容性基线
- 规范文档是真值：架构分层、模块职责、调用边界、修改约束、决策背景
- ADR 是真值：关键设计决策、已放弃方案、未来可变更条件

## 推荐阅读顺序

1. `00_PROJECT_OVERVIEW.md`
2. `01_ARCHITECTURE.md`
3. `02_RUNTIME_AND_BUILD.md`
4. `03_DATA_AND_STATE_MODEL.md`
5. `04_E2E_FLOWS.md`
6. `05_TEST_ORACLES.md`
7. `06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md`
8. `modules/` 下对应子系统文档
9. `adr/` 下关键决策记录

## 目录结构

- `00_PROJECT_OVERVIEW.md`：项目目标、边界、模块地图、接手路径
- `01_ARCHITECTURE.md`：分层架构、核心接口、线程/缓存/依赖边界
- `02_RUNTIME_AND_BUILD.md`：运行方式、构建链路、关键配置、产物边界
- `03_DATA_AND_STATE_MODEL.md`：运行时状态、持久化、缓存真值来源
- `04_E2E_FLOWS.md`：打开书籍、渲染、跳转、搜索、恢复等端到端流程
- `05_TEST_ORACLES.md`：测试入口、验收基线、回归验证清单
- `06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md`：Dexie 表结构、`db.settings` 键空间、WebDAV 同步、翻译凭据与缓存分层治理
- `modules/*.md`：模块级规范
- `adr/*.md`：架构决策记录

## 快速定位

- 改阅读体验：先看 `modules/reader-ui.md`
- 改渲染/性能：先看 `modules/vitra-engine.md`
- 改 PDF：先看 `modules/pdf-provider.md`
- 改缓存：先看 `modules/cache-system.md`
- 改存储 / 同步 / 翻译配置持久化：先看 `06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md`

## 维护规则

- `doc/` 是当前会持续维护的项目级规范目录；接手、改动评估与源码锚点更新优先落在这里
- `docs/` 主要保留历史指南、规划稿、阶段性状态记录和外部思路参考，不作为当前项目行为的单一权威源
- 若 `docs/` 与 `doc/` 冲突，以当前源码与 `doc/` 为准；若 `doc/` 与源码冲突，以源码为准
- 修改核心模块时，必须同步更新对应 `modules/*.md`
- 修改架构边界、运行策略、降级策略时，必须补充或更新 ADR
- 修改关键行为时，必须同步更新 `04_E2E_FLOWS.md` 或 `05_TEST_ORACLES.md`
- 文档中的路径、函数名、类名必须能在当前仓库中定位
- 文档允许概括，但不允许虚构未确认实现

## 当前状态

当前版本基于现有仓库源码与 `docs/VITRA_CORE_ENGINE_GUIDE.md` 建立骨架；其中 Vitra 引擎、PDF 渲染与缓存体系信息最完整，其余模块按源码梳理逐步补齐。

## docs/ 与 doc/ 的当前角色

当前可按以下方式理解：

- `doc/`：当前项目级权威规范，要求可回溯到源码锚点，并跟随现状持续修订：`doc/README.md:3-52`
- `docs/VITRA_CORE_ENGINE_GUIDE.md`：高密度引擎接手指南，是 `doc/` 初始骨架的重要来源，但不是覆盖全项目的唯一真值：`docs/VITRA_CORE_ENGINE_GUIDE.md:1-20`, `doc/README.md:54-56`
- `docs/vitra-integration-status.md`：阶段性状态报告，记录某一时点对“是否完成融合”的判断；其时间戳和结论可能落后于当前实现：`docs/vitra-integration-status.md:1-30`
- `docs/koodo-reader-parsing.md`、`docs/Vitra-Reader：向量化虚拟渲染实现指南.md`：偏设计/方案/外部思路参考，用于理解目标形态与演化来源，不直接作为现状真值：`docs/koodo-reader-parsing.md:1-8`, `docs/Vitra-Reader：向量化虚拟渲染实现指南.md:1-18`
- `docs/requirements/*.md`、`docs/plans/*.md`：单次分析任务留下的需求冻结与执行计划，属于过程性材料，不属于长期运行规范：`docs/requirements/2026-03-21-project-structure-analysis.md:1-25`, `docs/plans/2026-03-21-project-structure-analysis-execution-plan.md:1-42`
- `docs/epub_reader_dev_doc.md`：更早期的项目设想稿，包含若干与当前仓库不一致的目录和 TODO 设定，只能作为历史背景参考：`docs/epub_reader_dev_doc.md:1-80`
