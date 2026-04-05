# 向量化虚拟渲染第二十八批执行计划

- 日期：2026-04-05
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/components/Reader/scrollSelectionState.ts`
   - 增加 fallback `spineIndex`
2. `src/components/Reader/PaginatedReaderView.tsx`
   - 接入统一 helper
   - 重新接回 `fetchAndPreprocessChapter`
3. `src/test/scrollSelectionState.test.ts`
   - 覆盖 fallback `spineIndex`
4. `src/test/scrollChapterFetch.test.ts`
   - 继续覆盖 helper 的分页调用

## 验证命令

1. `npx vitest run src/test/scrollSelectionState.test.ts src/test/scrollChapterFetch.test.ts src/test/paginatedReaderFlow.test.tsx`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若 helper 扩展影响滚动视图菜单行为，只回退 fallback 逻辑，不动既有 DOM 回溯路径。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后推送远端。
