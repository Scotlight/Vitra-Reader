# 向量化虚拟渲染第一批设计

## 设计结论

本批次采用“Shadow 只产出容器，Scroll 负责窗口化挂载”的方案。

原因有两点：

1. `ScrollReaderView` 已经持有 `scrollTop`、章节加载顺序、章节卸载和 `metaVector`，最适合承担窗口化调度。
2. `ShadowRenderer` 继续负责样式隔离、资源预热和章节级离屏构造，但不再为虚拟化章节创建全部段节点，避免在离屏阶段就把 DOM 数量做大。

## 关键结构

1. `VirtualChapterRuntime`
   - 记录 `chapterEl`、`contentEl`、`vector`、当前活跃段节点和是否全量物化。
2. `virtualMeasureQueue`
   - 收集首挂载和 `ResizeObserver` 触发的段测量任务。
3. `syncVirtualizedSegmentsByRange()`
   - 用 `computeVisibleRange()` 计算范围，补齐进入范围的段，释放离开范围的段。

## 数据流

1. Worker 预处理产出 `segmentMetas`。
2. `ShadowRenderer` 输出带 `data-vitra-vector-content="true"` 的相对定位容器。
3. `ScrollReaderView` 在章节挂载时注册 `VirtualChapterRuntime`。
4. 滚动时调用 `syncVirtualizedSegmentsByRange()`：
   - 进入范围：`segmentPool.acquire()`、写入 `htmlContent`、绝对定位。
   - 离开范围：移除节点、`segmentPool.release()`。
5. 首次挂载和尺寸变化进入测量队列，回写 `metaVector`，然后刷新所有活跃段的 `translateY`。

## 兼容策略

1. 普通章节和分页模式保持原样。
2. 虚拟化章节的搜索跳转采用显式全量物化补偿，避免直接破坏主链。
3. 高亮先对当前活跃段生效，不在本批次扩展全文索引。
