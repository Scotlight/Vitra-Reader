# 向量化虚拟渲染第二十四批执行计划

- 日期：2026-04-05
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/components/Reader/scrollChapterFetch.ts`
   - 增加可选向量化参数
2. `src/components/Reader/PaginatedReaderView.tsx`
   - 接入抓取与预处理 helper
3. `src/test/scrollChapterFetch.test.ts`
   - 覆盖非向量化调用

## 验证命令

1. `npx vitest run src/test/scrollChapterFetch.test.ts`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若 helper 泛化影响滚动视图行为，只回退 helper 改动，不动前二十三批的组件测试。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后推送远端。
