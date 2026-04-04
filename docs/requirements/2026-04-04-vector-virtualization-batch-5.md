# 向量化虚拟渲染第五批需求冻结

- 日期：2026-04-04
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

把命中向量化计划的滚动章节从 `ShadowRenderer` 离屏队列再前移一步：在 `ScrollReaderView` 中直接构建虚拟章节外壳并进入 `ready`，减少大章节进入阅读范围时的离屏 DOM 往返。

## 交付物

1. `ScrollReaderView` 对命中向量化计划的章节直接创建虚拟容器外壳，不再进入 `shadowQueue`。
2. 向量缓存恢复路径也改为直接创建虚拟章节外壳。
3. `ShadowRenderer` 提供可复用的窗口化章节外壳构建函数。

## 约束

1. 不回退前五批之前已经落地的窗口化、搜索、高亮与缓存复用逻辑。
2. 不改分页模式。
3. 小章节和未命中向量化计划的章节仍保留 `ShadowRenderer` 路径。
4. 不提交调查目录下未跟踪材料。

## 验收标准

1. 命中向量化计划的章节加载时不再加入 `shadowQueue`。
2. 章节仍然走 `metaVector + computeVisibleRange() + segmentPool` 的窗口化主链。
3. `npx tsc --pretty false --noEmit` 通过。
4. `npm run build --silent` 通过。

## 非目标

1. 本批次不重写字号切换后的整体验证路径。
2. 本批次不移除 `ShadowRenderer` 的非向量化职责。
