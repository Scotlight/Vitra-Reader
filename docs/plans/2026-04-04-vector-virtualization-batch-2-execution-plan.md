# 向量化虚拟渲染第二批执行计划

- 日期：2026-04-04
- 运行时：`vibe`
- 内部等级：`L`

## Wave 1

1. `ScrollReaderView.tsx`
   - 为虚拟化章节增加搜索目标段定位
   - 搜索时只挂载目标段窗口，不再整章全量物化
   - 维护章节高亮缓存，并在段节点挂载时重放高亮
2. `useSelectionMenu.tsx`
   - 在创建高亮后把新记录回传给滚动阅读器缓存
3. `textFinder.ts`
   - 修正跨段空白规范化匹配
4. `textFinder.test.ts`
   - 增加对应测试

## 验证命令

1. `npx tsc --pretty false --noEmit`
2. `npx vitest run src/test/textFinder.test.ts`
3. `npm run build --silent`

## 回滚规则

1. 若搜索跳转逻辑影响编译或构建，先保留窗口化主链，再回退搜索兼容部分。
2. 不改动上一批已提交的运行时文档和快照恢复代码。

## 清理要求

1. 写入本批次 `vibe` 回执。
2. 不提交调查目录下的未跟踪文档。
