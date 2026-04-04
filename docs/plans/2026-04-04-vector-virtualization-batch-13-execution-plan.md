# 向量化虚拟渲染第十三批执行计划

- 日期：2026-04-04
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/components/Reader/scrollChapterViewport.ts`
   - 增加 DOM 回溯辅助函数
2. `src/components/Reader/ScrollReaderView.tsx`
   - 提炼视口滚动提交辅助函数
   - 接入选择菜单和 `jumpToSpine()` 路径
3. `src/test/scrollChapterViewport.test.ts`
   - 覆盖 DOM 回溯辅助函数

## 验证命令

1. `npx vitest run src/test/scrollChapterViewport.test.ts`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若新辅助函数影响跳转定位，只回退接入，不动前十二批抽取出的视口数学模块。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后推送远端。
