# 向量化虚拟渲染第十三批需求冻结

- 日期：2026-04-04
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

继续拆 `ScrollReaderView` 的跳转和选择链路，把章节 ID 的 DOM 回溯和视口滚动同步收口，减少这一段屎山里的重复分支。

## 交付物

1. 提炼章节 DOM 回溯辅助函数。
2. 提炼视口滚动提交辅助函数，统一 `scrollTop` 与派生状态同步。
3. `ScrollReaderView` 的选择菜单和 `jumpToSpine()` 改用新辅助函数。
4. 新增对应测试。

## 约束

1. 不回退前十三批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和视口数学抽取逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. `ScrollReaderView` 不再在选择链路中手写章节 ID 正则回溯。
2. `jumpToSpine()` 不再重复手写 `scrollTop + lastScrollTopRef + updateCurrentChapter + updateProgress` 组合。
3. `npx vitest run src/test/scrollChapterViewport.test.ts` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不继续拆 `loadChapter()` 主流程。
2. 本批次不修改未跟踪审计文档。
