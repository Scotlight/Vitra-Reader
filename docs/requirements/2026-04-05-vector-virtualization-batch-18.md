# 向量化虚拟渲染第十八批需求冻结

- 日期：2026-04-05
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

继续拆 `ScrollReaderView` 的 `loadChapter()`，把章节 HTML 抓取、样式获取和预处理调用下沉到独立 helper，减少组件内的异步 I/O 细节。

## 交付物

1. 提炼章节内容抓取与预处理 helper。
2. `ScrollReaderView` 的 `loadChapter()` 改用新 helper。
3. 新增对应单元测试。

## 约束

1. 不回退前十八批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. `loadChapter()` 不再直接承载 `extractChapterHtml -> extractChapterStyles -> preprocessChapterContent` 这一整段细节。
2. 新 helper 有测试覆盖，包含“样式可选失败”路径。
3. `npx vitest run src/test/scrollChapterFetch.test.ts` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不继续拆 `loadChapter()` 的状态回滚分支。
2. 本批次不修改未跟踪审计文档。
