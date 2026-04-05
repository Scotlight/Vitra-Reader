# 向量化虚拟渲染第二十七批需求冻结

- 日期：2026-04-05
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

继续补分页视图的组件级回归测试，覆盖空章节自动 fallback 到相邻章节的真实路径。

## 交付物

1. 扩展 `paginatedReaderFlow` 组件测试。
2. 覆盖空章节自动 fallback。

## 约束

1. 不回退前二十七批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. 分页视图空章节 fallback 路径有组件测试覆盖。
2. `npx vitest run src/test/paginatedReaderFlow.test.tsx` 通过。
3. `npx tsc --pretty false --noEmit` 通过。
4. `npm run build --silent` 通过。

## 非目标

1. 本批次不修改运行时代码。
2. 本批次不修改未跟踪审计文档。
