# 向量化虚拟渲染第八批执行计划

- 日期：2026-04-04
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/components/Reader/scrollVectorStrategy.ts`
   - 修正全局预算算法，先保留全部可见段
2. `src/test/scrollVectorStrategy.test.ts`
   - 补充预算低于可见段数量的测试

## 验证命令

1. `npx vitest run src/test/scrollVectorStrategy.test.ts src/test/metaVectorManager.test.ts`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若新预算规则导致额外挂载过多，只回退算法，不动前七批状态机。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后推送远端。
