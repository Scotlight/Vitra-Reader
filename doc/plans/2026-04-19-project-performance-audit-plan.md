# 全项目性能审计执行计划（2026-04-19）

## 内部执行等级

- Grade: `L`（跨模块审计与分级规划，后续已按方案 A 执行局部改造）

## 方案选择

采用方案 A：只处理真正的重灾区，不按全仓行数硬拆。

选择理由：

- 性能问题集中在同步 payload、分页高亮、书库元数据、分组状态、构建分包和滚动样式键计算。
- 这些点同时影响大数据量、可维护性和回归风险，收益高于按行数拆文件。
- `ScrollReaderView` 属于可深度模块化对象；`PaginatedReaderView` 当前问题主要在高亮策略，适合轻度外移。

未采用方案：

- 全仓按行数拆分：对性能收益不直接，且会扩大回归面。
- 优先深度拆分 `PaginatedReaderView`：当前瓶颈不在组件体积本身，过度拆分会增加维护成本。
- 同步协议彻底改为增量/分片：收益明确，但涉及远端协议和兼容性，需单独确认后执行。

## 已执行结果

### 1. P1：同步链路治理

状态：已完成第一阶段。

已落地：

- payload 构建、下载应用和统计日志从 `useSyncStore.ts` 抽到 `src/stores/syncStorePayload.ts`。
- 上传 payload 增加 `readingStatsDaily`。
- settings 同步过滤集中到 `SENSITIVE_SETTINGS_KEYS` 和 `UNSYNCABLE_SETTINGS_KEY_PREFIXES`。
- 不可同步前缀包括 `vcache-` 和 `tcache:`。
- `logSyncPayloadStats()` 输出 payload 大小和各表条目数，便于大数据量排查。

仍未做：

- 增量上传。
- 本地脏标记。
- 分片上传。
- payload 压缩。

原因：这些改动会改变同步协议或远端兼容边界，需单独确认。

### 2. P1：分页高亮查询优化

状态：已完成第一阶段。

已落地：

- 分页高亮抽到 `src/components/Reader/paginatedReader/usePaginatedHighlights.ts`。
- 使用 `db.highlights.where('bookId').equals(bookId).count()` 判断缓存是否失效。
- 使用 `groupedBySpine` 缓存章节级高亮。
- 高亮注入进入 idle task，减少同步阻塞。

仍未做：

- 为 `highlights` 表新增章节索引。

原因：新增索引需要 Dexie schema 升级，属于持久化变更，应单独确认并补迁移测试。

### 3. P1：书库元数据读取优化

状态：已完成第一阶段。

已落地：

- `useLibraryMetaState.ts` 抽出仓储层 `libraryMetaRepository.ts`。
- `loadLibraryCoreMeta()` 只读取进度、收藏、回收站和有注释书籍 ID。
- 使用 `db.bookmarks.orderBy('bookId').uniqueKeys()` 和 `db.highlights.orderBy('bookId').uniqueKeys()` 获取书籍 ID。
- `loadLibraryAnnotationMeta()` 只在 notes / highlight 视图需要详情时读取全量书签与高亮。
- 通过 in-flight task ref 避免重复刷新任务叠加。

仍未做：

- 聚合计数表。
- 基于事件的单本增量刷新。

原因：当前第一阶段已经降低书库首页的大数据量负载；聚合计数表会引入新的持久化模型。

### 4. P2：分组状态比较优化

状态：已完成第一阶段。

已落地：

- 分组状态仓储层抽到 `groupManagerRepository.ts`。
- 分组纯状态处理集中到 `groupManagerState.ts`。
- 主路径为 `groups`、`groupBookMap`、`groupBookOrder`、`homeOrder`。
- `shelves`、`shelfBookMap` 仅作为遗留迁移来源。
- 使用数组 / map 字段级比较，不再依赖整块 `JSON.stringify`。

仍未做：

- 独立版本号字段。

原因：字段级比较已经覆盖当前问题；版本号需要额外持久化约束。

### 5. P2：构建分包优化

状态：已完成第一阶段。

已验证：

- `npm run build --silent` 通过。
- 未再出现 `VitraPipeline` / `VitraContentAdapter` 的 dynamic import 冲突告警。
- 仍存在 `chunk > 500 kB` 告警。
- `pdf-vendor` 仍约 `946.90 kB`。
- 一个 `index` chunk 仍约 `500.45 kB`。

仍未做：

- 进一步拆分 PDF vendor。
- 调整 `manualChunks` 或引入更细粒度的按需入口。

原因：当前构建已消除动态导入冲突告警；进一步分包需要更细的启动性能指标和真实设备验证。

### 6. P3：滚动加载样式键计算缓存

状态：已完成第一阶段。

已落地：

- `useChapterLoader` 使用稳定字段拼接的 `buildReaderStyleKey(readerStyles)`。
- 避免在高频章节加载和样式变化路径中重复 `JSON.stringify(readerStyles)`。

仍未做：

- 独立 hash 函数。
- 全局 readerStyles 版本号。

原因：当前字段拼接更直接，依赖透明，维护成本低。

## 已执行验证

最近一次验证结果：

- `npm run build --silent`：通过。
- `npx vitest run src/test/readingStatsService.test.ts`：通过；沙箱内曾遇到 `esbuild spawn EPERM`，授权到沙箱外重试后通过。
- `npx vitest run src/test/scrollChapterFetch.test.ts`：通过。
- `npx vitest run src/test/scrollSelectionState.test.ts`：通过；沙箱内 `esbuild spawn EPERM` 后，授权沙箱外重试通过。

测试边界：

- 受限沙箱内启动 Vitest 可能触发 `esbuild spawn EPERM`。
- `scrollChapterFetch.test.ts` 与 `scrollReaderVectorFlow.test.tsx` 联合执行历史上可能触发 Node OOM，普通快速回归不建议联合执行。

## 下一阶段建议

优先级从高到低：

1. 为 `syncStorePayload.ts` 增加敏感键过滤和 `readingStatsDaily` payload 测试。
2. 为 `useSettingsStore.ts` 增加 `readerSettings` / `savedColors` 持久化测试。
3. 为 `storageService.ts` 增加 Dexie v6 升级回归。
4. 建立固定 EPUB/PDF/MOBI/DOCX/漫画样本集。
5. 讨论同步协议是否进入增量、压缩或分片阶段。

## 修改约束

- 每完成一个文件或阶段后先做定向验证。
- 更激进方案，例如同步协议重构、Dexie schema 升级、依赖调整，必须先确认。
- 保持外部调用方不变，优先通过仓储层、hook 和 helper 降低主组件复杂度。
- 新增规范文档放在 `doc/`，不放在 `docs/`。

