# 向量化虚拟渲染第一批需求冻结

- 日期：2026-04-04
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

在已恢复的快照代码基础上，把滚动模式的大章节路径从“全量段 DOM + placeholder 懒水合”推进到“按可视范围挂载真实段 DOM + 绝对定位 + 节点回收”的真正虚拟化主链。

## 交付物

1. `ShadowRenderer` 在滚动模式的大章节 Worker 向量化路径下只输出虚拟化容器，不再预先创建全部段节点。
2. `ScrollReaderView` 根据 `ChapterMetaVector` 和 `computeVisibleRange()` 只挂载可视范围段节点。
3. 滚出范围的段节点回收进入 `SegmentDomPool`。
4. 段高度实测回写 `metaVector`，并通过滚动补偿保持视口稳定。
5. 快照恢复结果继续保留：`chapterPreprocessCore.ts` 和相关主链文件不回退。

## 约束

1. 分页模式和小章节路径不改。
2. 不复制外部 GPL 代码。
3. 继续使用现有 `SegmentMeta`、`ChapterMetaVector`、`segmentPool`、`batchUpdateSegmentHeights()`。
4. 本批次允许搜索/高亮在虚拟化章节上保留受限兼容，不为此回退主链虚拟化。

## 验收标准

1. `ScrollReaderView` 中，虚拟化章节的实际挂载段数随视口变化，不再为整章创建全部 `<section>`。
2. 可见范围定位走 `computeVisibleRange()`。
3. 段节点离开范围后被移除并回收到池中。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不重写整套高亮索引和全文搜索索引。
2. 本批次不修改分页测量链路。
