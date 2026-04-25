# 全项目性能审计需求冻结（2026-04-19）

## 目标

在不改动业务行为的前提下，完成全项目性能问题分析，输出可追溯证据、风险分级与整改优先级。

## 当前状态

本需求最初是只读审计输入。后续已按方案 A 执行第一阶段优化；实施状态以 `doc/plans/2026-04-19-project-performance-audit-plan.md` 为准。

## 约束

- 可维护性优先，优先选择对外调用不变的优化路径。
- 拆分策略按方案 A 执行：仅处理真正重灾区文件，不进行全仓硬拆。
- `ScrollReaderView` 可深度模块化。
- `PaginatedReaderView` 只做轻度外移，避免过度拆分。
- 涉及 Dexie schema、同步协议、依赖调整的更激进方案，需要单独确认。

## 审计范围

- 构建体积与分包行为。
- 阅读器连续滚动与分页渲染链路。
- 书库元数据加载链路。
- WebDAV 同步序列化与传输链路。
- IndexedDB 查询/写入模式。
- 阅读统计与大数据量展示边界。

## 关键发现与当前处理状态

1. 高风险：同步链路全量读取与全量序列化，数据规模增大后会放大内存占用与上传时延。

   当前状态：已完成第一阶段治理。`buildUploadPayload()`、`applyDownloadedPayload()`、`logSyncPayloadStats()` 已抽到 `src/stores/syncStorePayload.ts`；payload 已包含 `readingStatsDaily`；settings 过滤集中到敏感键和不可同步前缀。

   未完成项：增量上传、本地脏标记、压缩、分片上传。

2. 高风险：分页高亮注入重复读取和分组整本高亮。

   当前状态：已完成第一阶段治理。分页高亮已经外移到 `src/components/Reader/paginatedReader/usePaginatedHighlights.ts`，采用 `count()` 失效校验和 `groupedBySpine` 缓存。

   未完成项：为高亮新增章节索引；该项需要 Dexie schema 升级。

3. 中高风险：书库元数据刷新在焦点切换时读取过多数据。

   当前状态：已完成第一阶段治理。`libraryMetaRepository.ts` 拆出 `loadLibraryCoreMeta()` 与 `loadLibraryAnnotationMeta()`；书库首页只读取核心元数据，注释详情延迟到 notes / highlight 视图。

   未完成项：聚合计数表、事件驱动单本刷新。

4. 中风险：分组状态比较使用整块序列化。

   当前状态：已完成第一阶段治理。分组仓储层和纯状态处理已拆到 `groupManagerRepository.ts` 与 `groupManagerState.ts`；主路径为 `groups/groupBookMap/groupBookOrder/homeOrder`；比较改为字段级逻辑。

   未完成项：独立版本号字段。

5. 中风险：构建产物体积偏大，存在 chunk > 500 kB。

   当前状态：部分完成。最近一次 `npm run build --silent` 通过；未再出现 `VitraPipeline` / `VitraContentAdapter` 的 dynamic import 冲突告警。

   未完成项：`pdf-vendor` 仍约 `946.90 kB`，一个 `index` chunk 仍约 `500.45 kB`，Vite 仍有大 chunk 告警。

6. 低中风险：滚动章节加载中高频样式键计算成本偏高。

   当前状态：已完成第一阶段治理。`useChapterLoader` 已改为稳定字段拼接键，不再高频 `JSON.stringify(readerStyles)`。

## 验收标准

- 每个风险点有文件级证据。
- 输出可执行优先级整改路线。
- 说明方案 A 的取舍，明确为何不做全仓硬拆。
- 每个阶段完成后执行定向验证并记录结果。

## 已验证记录

- `npm run build --silent`：通过，仍有大 chunk 告警。
- `npx vitest run src/test/readingStatsService.test.ts`：通过。
- `npx vitest run src/test/scrollChapterFetch.test.ts`：通过。
- `npx vitest run src/test/scrollSelectionState.test.ts`：通过。
