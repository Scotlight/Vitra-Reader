# 向量化虚拟渲染第十八批执行计划

- 日期：2026-04-05
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/components/Reader/scrollChapterFetch.ts`
   - 提炼章节内容抓取与预处理 helper
2. `src/components/Reader/ScrollReaderView.tsx`
   - 接入新 helper，收口 `loadChapter()` 的异步取数细节
3. `src/test/scrollChapterFetch.test.ts`
   - 覆盖正文抓取、样式失败降级和预处理参数传递

## 验证命令

1. `npx vitest run src/test/scrollChapterFetch.test.ts`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若 helper 接入影响章节加载行为，只回退接入，不动前十七批抽出的状态 helper。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后推送远端。
