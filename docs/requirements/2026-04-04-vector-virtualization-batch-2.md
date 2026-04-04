# 向量化虚拟渲染第二批需求冻结

- 日期：2026-04-04
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

在第一批段级窗口化主链基础上，补齐虚拟化章节的搜索跳转和高亮恢复兼容，继续向真正可用的向量化虚拟渲染推进。

## 交付物

1. 搜索跳转不再把目标章节永久全量物化。
2. 虚拟化章节可以按段定位搜索目标，并滚动到对应段。
3. 已保存高亮在段节点回收后重新进入视口时可以再次恢复。
4. `findTextAcrossSegments()` 的空白规范化路径修正并补测试。

## 约束

1. 不回退第一批窗口化主链。
2. 不改分页模式。
3. 不引入额外后台索引服务或新数据库表。
4. 仍然以现有 `SegmentMeta.htmlContent`、`db.highlights` 和 `textFinder` 工具链为基础。

## 验收标准

1. `jumpToSpine(..., searchText)` 在虚拟化章节上按段定位，不再永久挂满整章段节点。
2. 章节高亮数据进入缓存后，段节点重新挂载时会恢复高亮。
3. `npx tsc --pretty false --noEmit` 通过。
4. `npx vitest run src/test/textFinder.test.ts` 通过。
5. `npm run build --silent` 通过。

## 非目标

1. 本批次不实现全文倒排索引。
2. 本批次不解决同一段内多处重复文本的精确锚定问题。
