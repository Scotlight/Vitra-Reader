# 向量化虚拟渲染第十四批执行计划

- 日期：2026-04-04
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/components/Reader/scrollChapterViewport.ts`
   - 增加章节视口综合状态纯函数
2. `src/components/Reader/ScrollReaderView.tsx`
   - 接入统一的视口状态同步函数
3. `src/test/scrollChapterViewport.test.ts`
   - 覆盖综合状态解析

## 验证命令

1. `npx vitest run src/test/scrollChapterViewport.test.ts`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若统一状态同步影响滚动行为，只回退接入，不动前十三批抽出的辅助函数。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后推送远端。
