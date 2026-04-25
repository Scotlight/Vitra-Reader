# Vitra 引擎模块规范

## 1. 模块范围

主要文件：

- `src/engine/render/chapterPreprocessCore.ts`
- `src/engine/render/chapterPreprocessService.ts`
- `src/engine/worker/chapterPreprocess.worker.ts`
- `src/engine/render/vitraRenderPipeline.ts`
- `src/engine/render/vitraVectorPlanner.ts`
- `src/engine/render/metaVectorManager.ts`
- `src/components/Reader/ShadowRenderer.tsx`
- `src/components/Reader/scrollReader/`

## 2. 核心职责

Vitra 引擎负责把章节 HTML 转换为可高性能展示的阅读内容，重点能力包括：

- HTML 消毒。
- 样式清洗与 scope。
- 章节分片。
- 大章节向量化元数据生成。
- 五阶段渲染追踪。
- 延迟 hydrate。
- 大数据量下的章节预取、卸载与虚拟段管理。

## 3. 五阶段模型

当前阶段顺序：

1. parse
2. measure
3. paginate
4. render
5. hydrate

真值来源：

- 阶段类型：`src/engine/types/vectorRender.ts`。
- 管线顺序：`src/engine/render/vitraRenderPipeline.ts`。
- 计划构建：`src/engine/render/vitraVectorPlanner.ts`。
- trace 输出：`ShadowRenderer` 渲染完成后输出。

约束：

- 阶段顺序不可破坏。
- 阶段 trace 必须保留。
- 阶段失败也要保留 timing，便于排查。

## 4. 预处理职责边界

`chapterPreprocessCore` 偏纯数据处理：

- 消毒 HTML。
- 提取样式。
- 清理 style 标签。
- 作用域隔离。
- 生成 fragment。
- 生成 `SegmentMeta[]`。

`chapterPreprocessService` 偏线程与服务协调：

- 复用 worker。
- 传递输入输出。
- 屏蔽线程边界。
- 按章节大小动态放宽超时。
- 在 Worker 缺失、初始化失败或超时时同步回退到 `preprocessChapterCore()`。

Worker 侧：

- `chapterPreprocess.worker.ts` 接收序列化输入。
- 执行 core 预处理。
- 通过 Transferable 回填必要数据。

约束：

- Worker 输出协议必须可序列化。
- UI 层不应重复执行完整 preprocess。
- 大章节预处理不应阻塞主线程首屏。

## 5. 与 Reader UI 的边界

滚动模式：

- `useChapterLoader()` 调用章节预处理。
- 大章节建立 `ChapterMetaVector`。
- `useVirtualChapterRuntime()` 管理虚拟段生命周期。
- `useVirtualSegmentSync()` 根据视口范围同步可见段。
- `useChapterUnloader()` 释放远离当前视口的章节。

分页模式：

- `PaginatedReaderView` 仍通过 `ShadowRenderer` 渲染完整章节供测量。
- 高亮注入已经外移到 `usePaginatedHighlights()`。

边界：

- 引擎输出处理后内容、分片和渲染计划依据。
- UI 组织可见层、滚动/翻页行为和用户交互。
- Provider 负责源文档、资源和章节 unload。

## 6. 当前性能相关真值

已落地的性能治理点：

- `useChapterLoader` 不再高频使用 `JSON.stringify(readerStyles)` 作为样式键，改为稳定字段拼接键。
- 分页高亮注入使用章节级缓存和 `count()` 失效校验，避免每次注入都重复分组整本高亮。
- 书库元数据读取拆为核心元数据与注释详情两层；详情只在 notes / highlight 视图需要时读取。
- 分组状态保存使用字段级比较和清洗逻辑，不再依赖整块 `JSON.stringify`。
- `syncStorePayload.ts` 独立负责同步 payload 构建、下载应用、过滤和统计日志。
- `readingStatsDaily` 使用日级聚合和保留期同步，避免记录逐事件日志。

仍存在的性能治理项：

- WebDAV `data/full` 仍会读取多张表并序列化完整 payload。
- `bookFiles` 在 `files/full` 模式仍需要 base64 编码全部文件。
- 构建产物仍存在大 chunk 告警，特别是 `pdf-vendor`。
- 固定样本集和可重复性能基线仍缺失。

## 7. 修改约束

- 不得跳过 sanitize 或 scope 直接注入原始内容。
- 不得随意更改大章节阈值而不做性能回归。
- 不得移除 trace 逻辑。
- 不得把 worker 输出协议改成难以序列化或高度耦合的结构。
- 不得把滚动模式的 windowed vector 假设直接套用到分页模式。
- 新增缓存必须同时定义失效条件和释放路径。

## 8. 高风险点

- `splitHtmlIntoFragments()` 的切分边界。
- `vectorizeHtmlToSegmentMetas()` 的阈值、SAX 扫描和高度估算。
- `buildVitraVectorRenderPlan()` 的启用条件和首批段数决策。
- `ChapterMetaVector` 的 active segment 范围计算与高度回写。
- `ShadowRenderer` 的 placeholder → hydrated 切换。
- 滚动补偿、章节卸载、虚拟段同步之间的时序。
- Worker 超时和同步 fallback 的一致性。

## 9. 推荐验证

改 Vitra 引擎后优先执行：

- `npm run build --silent`
- `npx vitest run src/test/chapterPreprocessService.test.ts`
- `npx vitest run src/test/scrollChapterFetch.test.ts`
- `npx vitest run src/test/paginatedProgress.test.ts`

涉及高亮或选区时补充：

- `npx vitest run src/test/textFinder.test.ts`
- `npx vitest run src/test/scrollSelectionState.test.ts`

注意：历史已知 `scrollChapterFetch.test.ts` 与 `scrollReaderVectorFlow.test.tsx` 联合执行可能触发 Node OOM。普通快速回归不把这两个测试作为固定组合。
