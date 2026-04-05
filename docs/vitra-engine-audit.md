# Vitra 向量化虚拟渲染引擎审计

> 基于当前 `main` 分支代码审阅与已落地批次，更新于 2026-04-05

## 一、当前结论

Vitra 的滚动阅读大章节主链，已经从早期的“ShadowRenderer 全量离屏 + placeholder 懒水合”推进到**真正以 `metaVector` 为核心的段级窗口化渲染**。

当前最准确的定性是：

> **物理滚动引擎 + Worker 预处理分段 + 章节级 metaVector + 跨章节全局预算控制 + 段 DOM 池复用**

它依然不是经典的行级虚拟列表：

- 不是 `position: absolute + translateY` 的行虚拟化
- 不是浏览器原生滚动条驱动
- 不是整本书单一列表的统一 item renderer

但它已经是一个**以章节为单位、以段为窗口单位、可跨章节控预算**的真实虚拟化阅读引擎。

## 二、当前滚动主链

滚动模式下的大章节，当前主链是：

1. `provider.extractChapterHtml()` / `extractChapterStyles()`
2. `preprocessChapterContent()`
3. `vectorizeHtmlToSegmentMetas()`
4. `buildChapterMetaVector()`
5. `ScrollReaderView` 直接创建 `createWindowedVectorChapterShell()`
6. `computeGlobalVirtualSegmentMountPlan()`
7. `segmentPool.acquire()` / `release()`
8. `batchUpdateSegmentHeights()`

命中向量化计划的大章节，当前**默认绕过 `ShadowRenderer`**，不会再先进离屏队列。

## 三、已落实能力

### 1. 预处理与分段

相关文件：

- `src/engine/render/chapterPreprocessCore.ts`
- `src/engine/render/chapterPreprocessService.ts`
- `src/engine/render/htmlSaxStream.ts`

现状：

- 预处理已在 worker 中执行
- 预处理失败时可同步降级到 `preprocessChapterCore()`
- 已支持回调式 SAX 消费，不再必须先构造完整块边界数组
- 真正命中向量化计划的大章节，不再同时返回整份 `htmlContent` 和 `htmlFragments`

### 2. 元数据向量

相关文件：

- `src/engine/render/metaVectorManager.ts`
- `src/engine/types/vectorRender.ts`

现状：

- 已支持 `findSegmentByOffset()` 二分查找
- 已支持 `computeVisibleRange()` 可视范围定位
- 已支持 `batchUpdateSegmentHeights()` 回写实测高度
- 已支持从已测量段恢复 `fullyMeasured` 和 `offsetY`

### 3. 滚动窗口化

相关文件：

- `src/components/Reader/ScrollReaderView.tsx`
- `src/components/Reader/ShadowRenderer.tsx`
- `src/components/Reader/scrollVectorStrategy.ts`

现状：

- 命中向量化计划的章节直接创建窗口化章节外壳
- 段挂载与回收已由 `segmentPool` 管理
- 已支持跨章节全局虚拟段预算控制
- 预算不会再错误裁掉视口内真实可见段

### 4. 样式切换与缓存失效

相关文件：

- `src/components/Reader/ScrollReaderView.tsx`
- `src/components/Reader/scrollVectorStrategy.ts`

现状：

- `vectorStyleKey` 已用于阻止旧缓存误复用
- 样式变化后，向量章节会重新预处理，不再沿用旧 `segmentMetas`
- 普通章节仍走 `shadowQueue` 重渲染路径

### 5. 滚动物理引擎

相关文件：

- `src/hooks/useScrollEvents.ts`
- `src/hooks/useScrollInertia.ts`

现状：

- wheel / touch 输入已统一进入物理滚动引擎
- 滚动目标仍然是编程式 `scrollTop`
- 视口容器仍是 `overflow: hidden`

## 四、当前不再成立的旧结论

以下旧结论已经不准确：

- “向量化章节仍然主要依赖 `ShadowRenderer` 主链”
- “大章节只是 placeholder 懒水合，不算真正窗口化”
- “可视范围二分查找虽然实现，但未接入 UI 主链”
- “全局预算控制还没有落地”

这些说法只适用于更早的阶段，不适用于当前代码。

## 五、分页模式现状

相关文件：

- `src/components/Reader/PaginatedReaderView.tsx`

现状：

- 分页模式没有切入滚动窗口化主链
- 但已经复用了章节抓取与预处理 helper
- 分页测量仍以 `startMeasure()` / `vitraPaginator` 为主

结论：

> 滚动模式已经是向量化渲染主战场；分页模式只复用部分基础设施，还不是同一条虚拟化主链。

## 六、测试覆盖现状

当前已落地的关键测试包括：

- `src/test/htmlSaxStream.test.ts`
- `src/test/chapterPreprocessCore.test.ts`
- `src/test/chapterPreprocessService.test.ts`
- `src/test/metaVectorManager.test.ts`
- `src/test/scrollVectorStrategy.test.ts`
- `src/test/scrollChapterViewport.test.ts`
- `src/test/scrollChapterJump.test.ts`
- `src/test/scrollChapterLoad.test.ts`
- `src/test/scrollChapterFetch.test.ts`
- `src/test/scrollChapterRerender.test.ts`
- `src/test/scrollSelectionState.test.ts`
- `src/test/scrollReaderVectorFlow.test.tsx`

当前测试覆盖已经从“纯工具函数”扩展到“组件级主路径”。

## 七、还没到 100% 的部分

尽管主链已经成型，但还没有到最终收官阶段。当前剩余缺口主要有：

### 1. 文档与审计交付

- 需要把本文件持续同步成最新结论，而不是一次性快照
- 调查目录材料还未完全沉淀为正式工程文档

### 2. 组件状态机仍偏大

相关文件：

- `src/components/Reader/ScrollReaderView.tsx`
- `src/components/Reader/PaginatedReaderView.tsx`

现状：

- 虽然已经拆了多批 helper
- 但两大视图组件仍然偏长
- 仍有进一步下沉空间

### 3. 组件级测试仍可继续补强

尤其是：

- placeholder 恢复后的真实滚动补偿
- 搜索定位跨段路径
- 分页模式与预处理 helper 的联动

## 八、最终判断

截至当前代码：

- **滚动模式向量化主链：已成型**
- **分页模式共用基础设施：部分完成**
- **组件与文档收尾：尚未完成**

如果只看“滚动模式的向量化虚拟渲染引擎”：

> 当前已经不是原型，也不是伪虚拟化，而是**可运行、可验证、已接入预算和重建逻辑的正式主链**。

如果看“整个阅读器工程的最终交付”：

> 仍处于**主链完成、工程化收尾未清空**的阶段。
