# 向量化虚拟渲染第八批需求冻结

- 日期：2026-04-04
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

修正跨章节全局虚拟段预算的硬上限问题。当前实现会在预算低于视口内真实可见段数量时直接裁掉部分可见段，本批要把预算改成“永远覆盖全部可见段，只限制额外预加载段”。

## 交付物

1. `computeGlobalVirtualSegmentMountPlan()` 改为先保留全部可见段，再按预算补充非可见预加载段。
2. 新增“预算低于可见段数量时仍保留全部可见段”的回归测试。

## 约束

1. 不回退前八批之前已经落地的窗口化、缓存恢复、样式重建与全局预算逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. 视口内真实可见段不会因全局预算过小而消失。
2. 预算仍然限制额外预加载段数量。
3. `npx vitest run src/test/scrollVectorStrategy.test.ts src/test/metaVectorManager.test.ts` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不调整 `GLOBAL_VIRTUAL_SEGMENT_BUDGET` 的常量大小。
2. 本批次不修改未跟踪审计文档。
