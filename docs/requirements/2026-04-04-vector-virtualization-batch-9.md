# 向量化虚拟渲染第九批需求冻结

- 日期：2026-04-04
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

把章节预处理的 SAX 扫描改成真正的回调式消费，减少“先扫完整数组再二次遍历”的中间载荷；同时对真正命中向量化计划的大章节去掉重复 `htmlContent` 与 `htmlFragments` 返回，避免 worker 侧再次携带整份正文。

## 交付物

1. `htmlSaxStream` 提供回调式流式扫描接口。
2. `splitHtmlIntoFragments()` 和 `vectorizeHtmlToSegmentMetas()` 改用回调式 SAX 消费，而不是先构造完整边界数组。
3. `preprocessChapterCore()` 对真正命中向量化计划的大章节清空重复 `htmlContent` 和 `htmlFragments` 载荷。
4. 新增对应测试，覆盖流式扫描一致性、提前停止、媒体标签归属，以及大章节去重载荷。

## 约束

1. 不回退前九批之前已经落地的窗口化、缓存恢复、样式重建与全局预算逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. SAX 回调式扫描与聚合扫描结果一致。
2. 预处理阶段不再依赖完整的块边界数组才能分片和落段。
3. 真正命中向量化计划的大章节返回 `htmlContent: ''` 与 `htmlFragments: []`。
4. `npx vitest run src/test/htmlSaxStream.test.ts src/test/chapterPreprocessCore.test.ts src/test/scrollVectorStrategy.test.ts src/test/metaVectorManager.test.ts` 通过。
5. `npx tsc --pretty false --noEmit` 通过。
6. `npm run build --silent` 通过。

## 非目标

1. 本批次不把内容提供层改成真正的字节流输入。
2. 本批次不修改未跟踪审计文档。
