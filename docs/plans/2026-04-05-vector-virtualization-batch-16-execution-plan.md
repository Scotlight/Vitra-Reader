# 向量化虚拟渲染第十六批执行计划

- 日期：2026-04-05
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/components/Reader/scrollSelectionState.ts`
   - 提炼 `Selection` 到菜单状态的状态解析函数
2. `src/components/Reader/ScrollReaderView.tsx`
   - 接入新辅助函数，删除重复逻辑
3. `src/test/scrollSelectionState.test.ts`
   - 覆盖文本、坐标和章节索引解析

## 验证命令

1. `npx vitest run src/test/scrollSelectionState.test.ts`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若新辅助函数影响选择菜单弹出，只回退接入，不动前十五批的跳转与视口状态模块。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后推送远端。
