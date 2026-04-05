# 向量化虚拟渲染第三十批需求冻结

- 日期：2026-04-05
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

继续拆 `PaginatedReaderView`，把分页进度计算和持久化 payload 装配从组件里提炼成 helper。

## 交付物

1. 新增 `paginatedProgress` helper。
2. `PaginatedReaderView` 改用 helper 计算进度和持久化 payload。
3. 新增对应单元测试。

## 约束

1. 不回退前三十批之前已经落地的窗口化、样式重建、预算控制、流式 SAX、worker 降级和组件拆分逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和未跟踪审计材料。

## 验收标准

1. `PaginatedReaderView` 不再直接手写进度计算公式和持久化 payload 组装。
2. helper 有测试覆盖。
3. `npx vitest run src/test/paginatedProgress.test.ts` 通过。
4. `npx tsc --pretty false --noEmit` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不继续拆分页翻页交互状态机。
2. 本批次不修改未跟踪审计文档。
