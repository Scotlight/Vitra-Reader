# 向量化虚拟渲染第二十批需求冻结

- 日期：2026-04-05
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

继续拆 `ScrollReaderView` 的样式切换状态机，把章节分流、索引集、shadowQueue 重排和章节状态映射抽成统一 helper，减少组件内的大段状态拼装。

## 交付物

1. 提炼样式切换 rerender plan helper。
2. `ScrollReaderView` 的 `readerStyles` 变化 effect 改用新 helper。
3. 新增对应单元测试。

## 约束

1. 不回退前二十批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. `ScrollReaderView` 的样式切换 effect 不再直接拼装索引集、queue 和章节映射。
2. rerender plan helper 有测试覆盖。
3. `npx vitest run src/test/scrollChapterRerender.test.ts` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不继续拆 `loadChapter()` 的异步 I/O。
2. 本批次不修改未跟踪审计文档。
