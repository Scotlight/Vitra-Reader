# 向量化虚拟渲染第十一批需求冻结

- 日期：2026-04-04
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

处理阅读器主链里剩余的生产 `any`，并收口 `ScrollReaderView` 中重复的章节 DOM 清理逻辑，减少这块屎山代码的复制粘贴。

## 交付物

1. 去掉 `ScrollReaderView` 中最后一个生产 `any`。
2. 提炼章节 DOM 清理辅助函数，统一样式切换、章节卸载和整页跳转时的清理路径。

## 约束

1. 不回退前十一批之前已经落地的窗口化、样式重建、预算控制、流式 SAX 和 worker 降级逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. `src/components/Reader` 与 `src/engine/render` 范围内不再存在生产 `any`。
2. `ScrollReaderView` 的章节 DOM 清理逻辑不再散落为多段重复实现。
3. `npx tsc --pretty false --noEmit` 通过。
4. `npm run build --silent` 通过。

## 非目标

1. 本批次不清理测试代码里的 `any`。
2. 本批次不修改未跟踪审计文档。
