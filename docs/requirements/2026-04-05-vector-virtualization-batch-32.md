# 向量化虚拟渲染第三十二批需求冻结

- 日期：2026-04-05
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

补齐分页视图最后一条缺失的组件级交互回归测试：文本选择后菜单状态的解析与 fallback `spineIndex`。

## 交付物

1. 扩展 `paginatedReaderFlow` 组件测试。
2. 覆盖选择菜单状态解析。

## 约束

1. 不回退前三十二批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. 分页视图选择菜单状态解析有组件测试覆盖。
2. `npx vitest run src/test/paginatedReaderFlow.test.tsx` 通过。
3. `npx tsc --pretty false --noEmit` 通过。
4. `npm run build --silent` 通过。

## 非目标

1. 本批次不再继续拆运行时代码。
2. 本批次不修改未跟踪审计文档。
