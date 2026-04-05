# 向量化虚拟渲染第二十九批执行计划

- 日期：2026-04-05
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/components/Reader/paginatedChapterLoad.ts`
   - 提炼可渲染内容判断、fallback 索引和 shadowData 装配 helper
2. `src/components/Reader/PaginatedReaderView.tsx`
   - 接入 helper
3. `src/test/paginatedChapterLoad.test.ts`
   - 覆盖三类 helper

## 验证命令

1. `npx vitest run src/test/paginatedChapterLoad.test.ts`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若 helper 接入影响分页章节加载行为，只回退接入，不动前二十八批的选择菜单统一逻辑。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后推送远端。
