# 向量化虚拟渲染第十二批需求冻结

- 日期：2026-04-04
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

继续拆 `ScrollReaderView` 的屎山代码，把章节命中判定和滚动进度计算从组件内抽成可测试的纯函数，去掉重复的 DOM 遍历和章节 ID 解析逻辑。

## 交付物

1. 提炼章节视口匹配与进度计算工具函数。
2. `ScrollReaderView` 改用纯函数完成当前章节检测和滚动进度计算。
3. 新增对应单元测试。

## 约束

1. 不回退前十二批之前已经落地的窗口化、样式重建、预算控制、流式 SAX 和 worker 降级逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. `ScrollReaderView` 内不再重复实现章节 ID 正则解析与视口命中判断。
2. 章节命中与进度计算有单元测试覆盖。
3. `npx vitest run src/test/scrollChapterViewport.test.ts` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不继续拆 `jumpToSpine()` 主流程。
2. 本批次不修改未跟踪审计文档。
