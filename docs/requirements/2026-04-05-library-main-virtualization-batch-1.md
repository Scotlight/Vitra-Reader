# 主页面虚拟化第一批需求冻结

- 日期：2026-04-05
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

给主页面虚拟化补上组件级回归测试，证明 `BookGrid` 不是只有纯数学 helper，而是真的按滚动窗口渲染部分行。

## 交付物

1. 新增 `BookGrid` 组件级虚拟化测试。
2. 覆盖初次布局后的虚拟行窗口。
3. 覆盖滚动后可见行范围切换。

## 约束

1. 不改主页面运行时代码。
2. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. `BookGrid` 初次布局后只渲染窗口内行，而不是全部行。
2. 滚动后渲染行范围发生变化。
3. `npx vitest run src/test/bookGridVirtualFlow.test.tsx` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不改 LibraryView 的业务状态机。
2. 本批次不改拖拽排序行为。
