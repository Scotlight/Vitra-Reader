# 向量化虚拟渲染第二十八批需求冻结

- 日期：2026-04-05
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

把选择菜单状态解析 helper 从滚动视图扩展为跨两种阅读模式复用，并把分页视图当前工作树里回退到旧路径的章节抓取链路重新接回统一 helper。

## 交付物

1. 扩展 `scrollSelectionState` 支持 fallback `spineIndex`。
2. `PaginatedReaderView` 改用统一 helper 解析选择菜单状态。
3. `PaginatedReaderView` 重新接回 `fetchAndPreprocessChapter` helper。
4. 新增对应单元测试。

## 约束

1. 不回退前二十八批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. `PaginatedReaderView` 不再自己拼装选择菜单的 `text/x/y/spineIndex`。
2. `PaginatedReaderView` 再次走统一的章节抓取与预处理 helper。
3. helper 对无章节祖先但有 fallback `spineIndex` 的场景有测试覆盖。
4. `npx vitest run src/test/scrollSelectionState.test.ts src/test/scrollChapterFetch.test.ts src/test/paginatedReaderFlow.test.tsx` 通过。
5. `npx tsc --pretty false --noEmit` 通过。
6. `npm run build --silent` 通过。

## 非目标

1. 本批次不继续拆分页测量状态机。
2. 本批次不修改未跟踪审计文档。
