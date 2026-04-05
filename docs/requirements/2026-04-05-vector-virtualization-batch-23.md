# 向量化虚拟渲染第二十三批需求冻结

- 日期：2026-04-05
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

继续补组件级回归测试，把滚动阅读的另一条主分支也压住：不命中向量化计划的小章节仍然通过 `ShadowRenderer` 渲染，不会误走向量外壳。

## 交付物

1. 扩展 `scrollReaderVectorFlow` 组件测试。
2. 覆盖小章节仍然走 `ShadowRenderer` 的路径。

## 约束

1. 不回退前二十三批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. 小章节预处理结果不命中向量化计划时，会渲染 `ShadowRenderer`。
2. `npx vitest run src/test/scrollReaderVectorFlow.test.tsx` 通过。
3. `npx tsc --pretty false --noEmit` 通过。
4. `npm run build --silent` 通过。

## 非目标

1. 本批次不改运行时代码。
2. 本批次不修改未跟踪审计文档。
