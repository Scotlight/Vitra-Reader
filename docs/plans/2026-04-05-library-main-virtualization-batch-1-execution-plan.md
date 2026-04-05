# 主页面虚拟化第一批执行计划

- 日期：2026-04-05
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/test/bookGridVirtualFlow.test.tsx`
   - 搭建 BookGrid 组件测试桩
   - 覆盖初次布局后的虚拟行窗口
   - 覆盖滚动后可见行切换

## 验证命令

1. `npx vitest run src/test/bookGridVirtualFlow.test.tsx`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若测试建模与真实虚拟网格不符，只回退测试，不动运行时代码。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批测试和运行时文档。
2. 完成后推送远端。
