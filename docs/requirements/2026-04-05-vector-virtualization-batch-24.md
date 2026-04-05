# 向量化虚拟渲染第二十四批需求冻结

- 日期：2026-04-05
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

把章节抓取与预处理 helper 从滚动视图扩展到分页视图，减少 `PaginatedReaderView` 里重复的正文抓取、样式获取和预处理调用。

## 交付物

1. `scrollChapterFetch` 支持可选向量化参数。
2. `PaginatedReaderView` 改用 `scrollChapterFetch` helper。
3. 新增 helper 的非向量化测试。

## 约束

1. 不回退前二十四批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. `PaginatedReaderView` 不再直接承载 `extractChapterHtml -> extractChapterStyles -> preprocessChapterContent` 链路。
2. helper 在 `vectorize: false` 时不会注入 `vectorConfig`。
3. `npx vitest run src/test/scrollChapterFetch.test.ts` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不继续拆 `PaginatedReaderView` 的分页测量状态机。
2. 本批次不修改未跟踪审计文档。
