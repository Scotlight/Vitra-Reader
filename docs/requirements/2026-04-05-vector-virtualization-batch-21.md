# 向量化虚拟渲染第二十一批需求冻结

- 日期：2026-04-05
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

继续收口 `loadChapter()` 的末尾分发，把“替换章节状态 + 入 shadowQueue”这段重复逻辑提成 helper，进一步缩短组件内的分支体。

## 交付物

1. 扩展 `scrollChapterLoad` helper，覆盖章节替换与 shadowQueue 入队的组合更新。
2. `ScrollReaderView` 的 `loadChapter()` 改用新 helper 处理向量缓存恢复和预处理后的排队分发。
3. 新增对应单元测试。

## 约束

1. 不回退前二十一批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. `loadChapter()` 不再重复手写“替换章节 + 入 shadowQueue”两段 `setState`。
2. 新 helper 有测试覆盖。
3. `npx vitest run src/test/scrollChapterLoad.test.ts` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不继续拆 `loadChapter()` 的成功返回路径控制流。
2. 本批次不修改未跟踪审计文档。
