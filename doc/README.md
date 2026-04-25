# 项目文档体系总览

本目录承载当前项目级权威规范文档。

## 文档真值边界

为避免文档与源码冲突，以下边界固定：

- 源码是真值：接口签名、类型定义、实际运行行为、构建脚本、默认配置。
- 测试与样本是真值：行为正确性、回归判断、兼容性基线。
- 规范文档是真值：架构分层、模块职责、调用边界、修改约束、决策背景。
- ADR 是真值：关键设计决策、已放弃方案、未来可变更条件。

如果文档与源码冲突，以源码为准，并及时修正文档。

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
10. `plans/` 下当前执行计划

## 目录结构

- `00_PROJECT_OVERVIEW.md`：项目目标、边界、模块地图、接手路径。
- `01_ARCHITECTURE.md`：分层架构、核心接口、线程/缓存/依赖边界。
- `02_RUNTIME_AND_BUILD.md`：运行方式、构建链路、关键配置、当前构建验证。
- `03_DATA_AND_STATE_MODEL.md`：运行时状态、持久化、缓存真值来源。
- `04_E2E_FLOWS.md`：导入、打开、渲染、跳转、搜索、同步、统计、销毁等端到端流程。
- `05_TEST_ORACLES.md`：测试入口、验收基线、回归验证清单。
- `06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md`：Dexie 表结构、`db.settings` 键空间、WebDAV 同步、翻译凭据、阅读统计和缓存分层治理。
- `modules/*.md`：模块级规范。
- `adr/*.md`：架构决策记录。
- `plans/*.md`：当前执行计划和实施状态。
- `requirements/*.md`：需求冻结和分析输入。
- `recovered/`：恢复稿、历史快照、对照材料，只用于追溯。

## 快速定位

- 改阅读体验：先看 `modules/reader-ui.md`。
- 改渲染/性能：先看 `modules/vitra-engine.md`。
- 改 PDF：先看 `modules/pdf-provider.md`。
- 改缓存：先看 `modules/cache-system.md`。
- 改存储 / 同步 / 设置 / 翻译 / 阅读统计：先看 `06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md`。
- 改性能治理计划：先看 `plans/2026-04-19-project-performance-audit-plan.md`。

## 维护规则

- `doc/` 是当前会持续维护的项目级规范目录；接手、改动评估与源码锚点更新优先落在这里。
- `docs/` 主要保留历史指南、规划稿、阶段性状态记录和外部思路参考，不作为当前项目行为的单一权威源。
- 若 `docs/` 与 `doc/` 冲突，以当前源码与 `doc/` 为准；若 `doc/` 与源码冲突，以源码为准。
- 修改核心模块时，必须同步更新对应 `modules/*.md`。
- 修改架构边界、运行策略、降级策略时，必须补充或更新 ADR。
- 修改关键行为时，必须同步更新 `04_E2E_FLOWS.md` 或 `05_TEST_ORACLES.md`。
- 文档中的路径、函数名、类名必须能在当前仓库中定位。
- 文档允许概括，但不允许虚构未确认实现。

## 当前状态

当前版本已按源码校正以下事实：

- 阅读器打开链路收敛为 `App -> ReaderView -> useReaderBookSession -> VitraPipeline -> VitraContentAdapter`。
- 阅读器公共交互已经拆分到 `useReaderNavigation`、`useReaderAnnotations`、`useAutoScrollActiveToc`、`useReaderClock`。
- 阅读活跃时长由 `useReadingActivityTracker` 写入 `readingStatsDaily`，并由 `ReadingStatsPanel` 展示。
- `useSettingsStore` 已持久化 `readerSettings` 与 `savedColors`，不再是纯会话态。
- 滚动阅读内部拆到 `src/components/Reader/scrollReader/` 的 hook 族。
- 分页高亮已经外移到 `src/components/Reader/paginatedReader/usePaginatedHighlights.ts`。
- 同步 payload 构建和下载应用已经外移到 `src/stores/syncStorePayload.ts`。
- Dexie 当前最高版本是 v6，包含 `readingStatsDaily`。
- 自动化测试基线覆盖 PDF、分页、滚动向量流、章节预处理服务、书库虚拟列表、分组状态、阅读统计和滚动选区状态。

## `docs/` 与 `doc/` 的当前角色

- `doc/`：当前项目级权威规范，要求可回溯到源码，并跟随现状持续修订。
- `docs/VITRA_CORE_ENGINE_GUIDE.md`：引擎接手指南，是 `doc/` 初始骨架的重要来源，但不是覆盖全项目的唯一真值。
- `docs/vitra-integration-status.md`：阶段性状态报告，时间戳和结论可能落后于当前实现。
- `docs/koodo-reader-parsing.md`、`docs/Vitra-Reader：向量化虚拟渲染实现指南.md`：设计/方案/外部思路参考，不直接作为现状真值。
- `docs/requirements/*.md`、`docs/plans/*.md`：过程性材料，不属于长期运行规范。
- `docs/epub_reader_dev_doc.md`：早期项目设想稿，只作为历史背景参考。
