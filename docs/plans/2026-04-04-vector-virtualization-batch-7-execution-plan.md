# 向量化虚拟渲染第七批执行计划

- 日期：2026-04-04
- 运行时：`vibe`
- 内部等级：`L`

## Wave 1

1. `src/components/Reader/scrollVectorStrategy.ts`
   - 增加样式切换分流纯函数
2. `src/components/Reader/ScrollReaderView.tsx`
   - 样式切换时把向量章节降为 placeholder
   - 重新调用 `loadChapter()` 获取新样式下的 `segmentMetas`

## Wave 2

1. `src/test/scrollVectorStrategy.test.ts`
   - 覆盖样式切换分流
   - 继续覆盖缓存恢复和队列绕过

## 验证命令

1. `npx vitest run src/test/scrollVectorStrategy.test.ts src/test/metaVectorManager.test.ts`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若向量章节样式切换后无法恢复，可先保留 placeholder 回退，再恢复旧重渲染路径。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后推送远端。
