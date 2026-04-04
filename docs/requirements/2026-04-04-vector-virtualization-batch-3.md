# 向量化虚拟渲染第三批需求冻结

- 日期：2026-04-04
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

把滚动阅读器里的旧 placeholder/IntersectionObserver 段级水合兼容链路退出主路径，统一到 `metaVector + computeVisibleRange() + segmentPool` 的窗口化渲染单轨。

## 交付物

1. `ScrollReaderView` 不再依赖 `hydrationQueue + IntersectionObserver` 驱动大章节段级挂载。
2. 向量化章节统一由滚动同步器根据可视范围挂载、回收和复测段节点。
3. 高亮注入路径不再为兼容旧 placeholder 段而强制物化整章段节点。
4. 补齐第三批 `vibe` 需求和执行文档。

## 约束

1. 不回退前两批已经落地的窗口化、搜索和高亮恢复能力。
2. 小章节和非向量化路径保持现状。
3. 不修改分页模式阅读器。
4. 不提交调查目录下未跟踪的文档和快照材料。

## 验收标准

1. `ScrollReaderView.tsx` 中不再保留旧的 `IntersectionObserver` 段级 hydration 主链。
2. 滚动时可见段同步只走窗口化调度。
3. `npx tsc --pretty false --noEmit` 通过。
4. `npm run build --silent` 通过。

## 非目标

1. 本批次不新增全文索引。
2. 本批次不重写分页阅读器。
