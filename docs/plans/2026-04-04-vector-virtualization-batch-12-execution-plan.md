# 向量化虚拟渲染第十二批执行计划

- 日期：2026-04-04
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/components/Reader/scrollChapterViewport.ts`
   - 提炼章节 ID 解析、视口命中和滚动进度计算纯函数
2. `src/components/Reader/ScrollReaderView.tsx`
   - 接入新工具函数，删除重复逻辑
3. `src/test/scrollChapterViewport.test.ts`
   - 覆盖章节命中和进度计算

## 验证命令

1. `npx vitest run src/test/scrollChapterViewport.test.ts`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若纯函数接入影响章节检测行为，只回退工具函数接入，不动前十一批主链。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后推送远端。
