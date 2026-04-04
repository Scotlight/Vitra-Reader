# 向量化虚拟渲染第十四批需求冻结

- 日期：2026-04-04
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

继续收口 `ScrollReaderView` 的滚动派生状态。当前章节检测和进度计算虽然已经抽出部分数学工具，但仍然由组件分别驱动；本批要把它们统一成一份视口综合状态解析，减少重复扫描和重复计算。

## 交付物

1. 提炼章节视口综合状态纯函数，统一返回当前章节与进度状态。
2. `ScrollReaderView` 的滚动、跳转和搜索定位路径改用统一的视口状态同步函数。
3. 新增对应单元测试。

## 约束

1. 不回退前十四批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. `ScrollReaderView` 不再分别调用两套章节检测和进度计算逻辑。
2. 视口综合状态解析有测试覆盖。
3. `npx vitest run src/test/scrollChapterViewport.test.ts` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不继续拆 `loadChapter()` 主流程。
2. 本批次不修改未跟踪审计文档。
