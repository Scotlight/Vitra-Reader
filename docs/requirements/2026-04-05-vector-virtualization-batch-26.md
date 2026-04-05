# 向量化虚拟渲染第二十六批需求冻结

- 日期：2026-04-05
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

补一组 `PaginatedReaderView` 的组件级回归测试，验证分页模式已经接入统一的章节抓取与预处理 helper，并且样式切换会重新抓取当前章节。

## 交付物

1. 新增 `PaginatedReaderView` 组件测试。
2. 覆盖初次加载使用 `fetchAndPreprocessChapter({ vectorize: false })`。
3. 覆盖样式切换重新抓取章节。

## 约束

1. 不回退前二十六批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. 分页视图初次加载有组件测试覆盖。
2. 样式切换重新抓取章节有组件测试覆盖。
3. `npx vitest run src/test/paginatedReaderFlow.test.tsx` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不继续拆 `PaginatedReaderView` 的分页测量状态机。
2. 本批次不修改未跟踪审计文档。
