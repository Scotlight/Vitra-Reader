# 向量化虚拟渲染第十五批需求冻结

- 日期：2026-04-04
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

继续拆 `ScrollReaderView` 的 `jumpToSpine()` 状态机，把目标章节同步、已挂载章节快速跳转、视口重置与重载方向判定拆开，降低这段屎山的耦合度。

## 交付物

1. 提炼跳转方向与已挂载章节判定的纯函数。
2. `jumpToSpine()` 拆成更小的本地辅助步骤。
3. 新增对应单元测试。

## 约束

1. 不回退前十五批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. `jumpToSpine()` 不再直接承载全部跳转分支和方向判断。
2. 跳转方向与已挂载章节判定有测试覆盖。
3. `npx vitest run src/test/scrollChapterJump.test.ts` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不继续拆 `loadChapter()` 主流程。
2. 本批次不修改未跟踪审计文档。
