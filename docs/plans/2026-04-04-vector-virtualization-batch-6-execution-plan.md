# 向量化虚拟渲染第六批执行计划

- 日期：2026-04-04
- 运行时：`vibe`
- 内部等级：`L`

## Wave 1

1. `src/components/Reader/scrollVectorStrategy.ts`
   - 提炼窗口化分流、placeholder 缓存恢复、全局预算规划纯函数
2. `src/components/Reader/ScrollReaderView.tsx`
   - 接入跨章节全局虚拟段预算控制
   - 改用纯函数统一缓存恢复与窗口化判定

## Wave 2

1. `src/test/scrollVectorStrategy.test.ts`
   - 覆盖全局预算、缓存恢复、队列绕过
2. `src/test/metaVectorManager.test.ts`
   - 覆盖已测量段恢复与批量回写后的 `fullyMeasured`

## 验证命令

1. `npx vitest run src/test/scrollVectorStrategy.test.ts src/test/metaVectorManager.test.ts`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若全局预算导致可见区缺段，先保留原有 `computeVisibleRange()` 的章节内范围，再放宽预算。
2. 若纯函数重构影响现有加载路径，保留新测试，恢复旧调用点。
3. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后写出验证与清理回执，再推送远端。
