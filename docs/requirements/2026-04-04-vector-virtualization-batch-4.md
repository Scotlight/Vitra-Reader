# 向量化虚拟渲染第四批需求冻结

- 日期：2026-04-04
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

让滚动阅读器在章节被折叠成 placeholder 以后仍然保留向量化缓存，章节重新进入阅读范围时直接从 `segmentMetas` 重建虚拟容器，不再重新提取整章 HTML 和重新执行 Worker 预处理。

## 交付物

1. `ScrollReaderView` 的 placeholder 卸载流程保留向量化章节的 `segmentMetas`、`externalStyles` 和已测量高度。
2. `loadChapter()` 遇到可复用的 placeholder 章节时，直接走缓存恢复路径，不再调用 `extractChapterHtml()` 和 `preprocessChapterContent()`。
3. `ShadowRenderer` 支持仅凭 `segmentMetas` 重建滚动模式的大章节虚拟容器。
4. `buildChapterMetaVector()` 在重建时保留真实的 `fullyMeasured` 和累计高度状态。

## 约束

1. 不回退前四批之前已经落地的窗口化、搜索和高亮逻辑。
2. 小章节和非向量化路径保持现状。
3. 不改分页模式。
4. 不提交调查目录下未跟踪的文档和 JSONL 材料。

## 验收标准

1. 已折叠为 placeholder 的向量化章节重新进入阅读范围时，可以跳过 HTML 提取与 Worker 预处理。
2. 重新进入后的章节仍然走 `segmentMetas + computeVisibleRange()` 的窗口化主链。
3. `npx tsc --pretty false --noEmit` 通过。
4. `npm run build --silent` 通过。

## 非目标

1. 本批次不新增磁盘级持久化缓存。
2. 本批次不重写分页阅读器。
