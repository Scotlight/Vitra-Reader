# 向量化虚拟渲染第十七批执行计划

- 日期：2026-04-05
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/components/Reader/scrollChapterLoad.ts`
   - 提炼章节状态与构造辅助函数
2. `src/components/Reader/ScrollReaderView.tsx`
   - 接入章节加载辅助函数，收口 `loadChapter()` 对象拼装
3. `src/test/scrollChapterLoad.test.ts`
   - 覆盖占位初始化、向量缓存恢复、预处理结果装配

## 验证命令

1. `npx vitest run src/test/scrollChapterLoad.test.ts`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若辅助函数接入影响章节加载行为，只回退接入，不动前十六批抽出的视口与选择模块。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后推送远端。
