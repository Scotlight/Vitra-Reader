# 翻页模式性能优化批次 1

## 目标

在不引入翻页模式向量化分页器的前提下，降低 `PaginatedReaderView` 在重复进入同一章节、相同版式参数下的离屏分页测量成本。

## 交付物

1. 翻页模式分页边界缓存实现。
2. `PaginatedReaderView` 接入缓存命中与回填逻辑。
3. 对应测试，证明重复进入同一章节时不会重复触发离屏分页测量。

## 约束

- 不改变现有翻页模式的外部交互接口。
- 不启用滚动模式那套窗口化向量渲染。
- 不修改 `ShadowRenderer` 的翻页模式 HTML 渲染语义。
- 样式变化、视口尺寸变化、单双页模式变化时，缓存键必须失效或区分。

## 验收标准

1. 同一本书、同一章节、相同视口尺寸、相同翻页模式、相同排版参数下，重复进入章节时优先复用缓存的 `PageBoundary[]`。
2. 缓存命中后，不再重新调用 `startMeasure()`。
3. 样式变化后仍然重新抓取章节并重新测量，避免使用过期分页结果。
4. 现有翻页模式测试继续通过，并新增缓存命中测试。

## 非目标

- 本批次不实现翻页模式 `segmentMetas` 分段分页。
- 不改写 `vitraPaginator` 的分页算法。
- 不做跨会话持久化缓存。
- 不处理 PDF provider 的专用渲染路径优化。

## 推断与假设

1. 当前翻页模式的主要性能成本在章节切换后的离屏分页测量，而不是单次 `translateX()` 翻页。
2. 复用同章节同排版的 `PageBoundary[]` 属于低风险收益项，适合作为批次 1。
3. 批次 1 先做内存级缓存，避免过早引入序列化和持久化复杂度。

## 证据锚点

- `src/components/Reader/PaginatedReaderView.tsx:173-185`
- `src/components/Reader/PaginatedReaderView.tsx:107-134`
- `src/engine/render/vitraMeasure.ts:68-111`
- `src/engine/render/vitraPaginator.ts:280-305`
