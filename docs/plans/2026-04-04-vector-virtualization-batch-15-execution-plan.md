# 向量化虚拟渲染第十五批执行计划

- 日期：2026-04-04
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/components/Reader/scrollChapterJump.ts`
   - 增加跳转方向与已挂载章节判定纯函数
2. `src/components/Reader/ScrollReaderView.tsx`
   - 拆分 `jumpToSpine()` 的已挂载路径与重置重载路径
3. `src/test/scrollChapterJump.test.ts`
   - 覆盖跳转方向与已挂载章节判定

## 验证命令

1. `npx vitest run src/test/scrollChapterJump.test.ts`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若拆分后的 `jumpToSpine()` 影响跳转正确性，只回退接入，不动前十四批的章节视口状态解析。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后推送远端。
