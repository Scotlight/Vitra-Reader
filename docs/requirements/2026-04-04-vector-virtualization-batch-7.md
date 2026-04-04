# 向量化虚拟渲染第七批需求冻结

- 日期：2026-04-04
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

修正阅读样式切换后的向量章节重建链路。当前 `vectorStyleKey` 只能阻止旧缓存恢复，不能让已挂载的向量章节按新字体参数重新生成 `segmentMetas` 和估高；本批要把这条链路补完整。

## 交付物

1. `ScrollReaderView` 在 `readerStyles` 变化时，区分向量章节与普通章节。
2. 向量章节不再直接复用旧 `segmentMetas`，而是降为 placeholder 后重新调用 `loadChapter()`，按新样式重新预处理。
3. 普通章节继续保留现有 `shadowQueue` 重渲染路径。
4. 新增样式切换分流测试。

## 约束

1. 不回退前七批前已经落地的窗口化、搜索、高亮、缓存与全局预算控制逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. 样式切换后，向量章节不会继续沿用旧 `segmentMetas` 进入窗口化路径。
2. 向量章节会被置回 placeholder，并通过 `loadChapter()` 重新预处理。
3. 普通章节仍然走 `shadowQueue` 重渲染。
4. `npx vitest run src/test/scrollVectorStrategy.test.ts src/test/metaVectorManager.test.ts` 通过。
5. `npx tsc --pretty false --noEmit` 通过。
6. `npm run build --silent` 通过。

## 非目标

1. 本批次不修改未跟踪审计文档。
2. 本批次不重写 `chapterPreprocessService` 的 worker 容错策略。
