# 2026-04-12 滚动阅读 trace 热点维护性修复需求

## 1. 目标

在保留现有 `ShadowRenderer`、`ScrollReaderView`、向量化虚拟渲染和 Zustand 会话架构的前提下，修复两份 trace 中已经确认的滚动阅读主线程热点，并优先选择最易维护、最少跨层耦合的实现方案。

## 2. 现状事实

### 2.1 已确认热点

1. `src/components/Reader/ShadowRenderer.tsx`
   - 首帧渲染阶段存在同步布局读取：`offsetHeight`、`getContainerHeight()`。
   - 媒体敏感章节会把 `initialSegmentCount` 放大到整章，导致首帧物化规模失控。

2. `src/components/Reader/ScrollReaderView.tsx`
   - `updateCurrentChapter()` 与 `updateProgress()` 各自扫描章节 DOM，滚动阶段重复读取 `offsetTop/offsetHeight`。
   - 被动高亮注入路径每次都查询 Dexie，并在章节挂载后可能强制物化全部虚拟段。
   - 章节挂载后高亮调度依赖整个 `chapters` 数组，容易重复调度。

3. `src/components/Reader/ReaderView.tsx`
   - 父层进度状态更新会引发 `ReaderView` 重渲染。
   - `ScrollReaderView` 当前没有被父层渲染隔离；父层重渲染时，滚动阅读子树会被动参与调度。

## 3. 维护性优先准则

本轮方案必须同时满足以下原则：

1. **单一职责优先**
   - `ShadowRenderer` 只负责离屏渲染与首帧测量，不承担滚动期修正逻辑。
   - `ScrollReaderView` 负责滚动期 DOM 与虚拟段管理。
   - `ReaderView` 负责父层状态编排与 prop 稳定性。

2. **减少重复数据源**
   - 高亮数据在阅读器运行期应有单一内存快照，不应在章节挂载时重复命中 Dexie。

3. **减少重复 DOM 扫描**
   - 同一滚动周期内，章节探测与进度计算共享一次扫描结果。

4. **减少跨层联动重渲染**
   - 父层进度标签更新不应再次驱动 ScrollReaderView 主树参与无意义渲染。

5. **局部改动优先**
   - 限定在 `ReaderView.tsx`、`ScrollReaderView.tsx`、`ShadowRenderer.tsx` 及必要的小型辅助逻辑。
   - 不引入新的全局状态管理层，不改数据库 schema。

## 4. 冻结实现方向

### 4.1 ScrollReaderView

采用“**单次视口扫描 + 高亮内存快照 + 增量注入**”方案：

- 将章节探测与进度计算合并到一个统一的视口度量函数中。
- 高亮数据在阅读器内存中缓存，避免章节挂载时重复 `db.highlights.where(...).toArray()`。
- 被动高亮注入只处理当前已挂载 DOM，不再为了高亮把整章虚拟段全部物化。
- 当新的虚拟段进入视口并挂载时，再按章节节流补做一次高亮注入。

### 4.2 ReaderView

采用“**稳定 prop + 组件隔离**”方案：

- 将传给 `ScrollReaderView` 的对象与回调稳定化。
- 通过组件级 memo 隔离父层进度更新对滚动阅读子树的影响。

### 4.3 ShadowRenderer

采用“**限制首帧物化规模 + 移除最重种子测量**”方案：

- 媒体敏感章节仍可走保守路径，但首帧物化段数必须设上限，不能直接整章展开。
- 去掉首帧种子段的同步批量测量与占位修正，把真实高度修正留给滚动期的已有虚拟段测量链路。
- 保留必要的章节容器最终高度测量，避免破坏现有 `onReady` 契约。

## 5. 非目标

- 不处理 PDF worker 热点。
- 不改分页阅读模式的核心架构。
- 不扩展到无关模块。

## 6. 验收标准

1. 代码层面不再存在章节挂载时的被动全量高亮 Dexie 查询。
2. 代码层面不再存在滚动期重复的章节 DOM 双扫描路径。
3. `ScrollReaderView` 能与父层进度更新隔离。
4. `ShadowRenderer` 不再把媒体敏感章节整章作为首帧种子段物化。
5. 至少完成一次定向构建验证，并如实记录结果。
