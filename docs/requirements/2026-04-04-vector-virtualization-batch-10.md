# 向量化虚拟渲染第十批需求冻结

- 日期：2026-04-04
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

补齐 `chapterPreprocessService` 与文档的偏差。当前 worker 不可用、初始化失败、运行时错误或超时时并不会同步降级到 `preprocessChapterCore()`；同时大章节动态超时也偏短，本批要把这两点补完整。

## 交付物

1. `chapterPreprocessService` 在 worker 不可用、初始化失败、运行时错误、`postMessage` 失败和超时时统一同步降级到 `preprocessChapterCore()`。
2. 动态超时调整到更适合大章节的区间，最高支持 60 秒。
3. 新增 `chapterPreprocessService` 测试，覆盖成功回填、无 worker 降级、初始化失败降级和超时降级。

## 约束

1. 不回退前十批之前已经落地的窗口化、样式重建、预算控制和流式 SAX 预处理逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. 预处理 worker 不可用时不会直接抛错，而是同步返回 `preprocessChapterCore()` 结果。
2. 大章节动态超时不再停留在 8 秒。
3. `npx vitest run src/test/chapterPreprocessService.test.ts src/test/chapterPreprocessCore.test.ts src/test/htmlSaxStream.test.ts` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不把 provider 输入改成真正字节流。
2. 本批次不修改未跟踪审计文档。
