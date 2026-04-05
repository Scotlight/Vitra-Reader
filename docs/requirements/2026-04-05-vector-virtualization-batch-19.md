# 向量化虚拟渲染第十九批需求冻结

- 日期：2026-04-05
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

继续拆 `ScrollReaderView` 的 `loadChapter()`，把 loading 插入、shadowQueue 入队和失败回滚这些状态更新逻辑抽成可测试的纯 helper。

## 交付物

1. 扩展章节加载状态 helper，覆盖插入、替换、入队和失败回滚。
2. `ScrollReaderView` 的 `loadChapter()` 改用这些 helper。
3. 新增对应单元测试。

## 约束

1. 不回退前十九批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. `loadChapter()` 不再直接手写 loading 插入、shadowQueue 入队和失败回滚的数组更新。
2. 状态更新 helper 有测试覆盖。
3. `npx vitest run src/test/scrollChapterLoad.test.ts` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不继续拆 `loadChapter()` 的异步 I/O 顺序。
2. 本批次不修改未跟踪审计文档。
