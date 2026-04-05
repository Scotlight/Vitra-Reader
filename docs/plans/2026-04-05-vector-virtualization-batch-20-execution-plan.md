# 向量化虚拟渲染第二十批执行计划

- 日期：2026-04-05
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/components/Reader/scrollChapterRerender.ts`
   - 提炼样式切换分流与状态映射 helper
2. `src/components/Reader/ScrollReaderView.tsx`
   - 接入 rerender plan helper
3. `src/test/scrollChapterRerender.test.ts`
   - 覆盖 plan 生成和章节状态更新

## 验证命令

1. `npx vitest run src/test/scrollChapterRerender.test.ts`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若 helper 接入影响样式切换行为，只回退接入，不动前十九批的加载状态 helper。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后推送远端。
