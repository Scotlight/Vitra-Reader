# 向量化虚拟渲染第十七批需求冻结

- 日期：2026-04-05
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

继续拆 `ScrollReaderView` 的 `loadChapter()` 状态机，把章节占位初始化、向量缓存恢复和预处理结果装配抽成可测试的纯辅助函数。

## 交付物

1. 提炼 `LoadedChapter` 状态与构造辅助函数。
2. `ScrollReaderView` 的 `loadChapter()` 改用这些辅助函数，去掉重复对象拼装。
3. 新增对应单元测试。

## 约束

1. 不回退前十七批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. `loadChapter()` 不再直接拼接三套章节状态对象。
2. 章节加载状态辅助函数有测试覆盖。
3. `npx vitest run src/test/scrollChapterLoad.test.ts` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不继续拆 `loadChapter()` 的异步 I/O 顺序。
2. 本批次不修改未跟踪审计文档。
