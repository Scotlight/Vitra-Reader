# 向量化虚拟渲染第二十二批需求冻结

- 日期：2026-04-05
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

补一组更接近真实运行的组件级回归测试，直接验证 `ScrollReaderView` 的向量主路径：大章节初次加载绕过 `ShadowRenderer`，以及样式切换后重新预处理而不是回退到旧缓存。

## 交付物

1. 新增 `ScrollReaderView` 向量路径组件测试。
2. 覆盖初次加载绕过 `ShadowRenderer`。
3. 覆盖样式切换触发重新预处理。

## 约束

1. 不回退前二十二批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. 初次加载命中向量化计划时，不渲染 `ShadowRenderer` 组件实例。
2. 样式切换后，会再次调用章节预处理，并带入新的字体参数。
3. `npx vitest run src/test/scrollReaderVectorFlow.test.tsx` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不修改 `ScrollReaderView` 运行时代码。
2. 本批次不修改未跟踪审计文档。
