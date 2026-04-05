# 向量化虚拟渲染第十六批需求冻结

- 日期：2026-04-05
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

继续拆 `ScrollReaderView` 的选择菜单链路，把 `Selection` 到菜单状态的 DOM 回溯与几何计算提炼成可测试的辅助函数。

## 交付物

1. 提炼选择菜单状态解析辅助函数。
2. `ScrollReaderView` 的鼠标选择检测改用新辅助函数。
3. 新增对应单元测试。

## 约束

1. 不回退前十六批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. `ScrollReaderView` 不再自己拼接选择菜单的 `text/x/y/spineIndex`。
2. 选择菜单状态解析有测试覆盖。
3. `npx vitest run src/test/scrollSelectionState.test.ts` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不继续拆 `loadChapter()` 主流程。
2. 本批次不修改未跟踪审计文档。
