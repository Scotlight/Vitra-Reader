# 向量化虚拟渲染第三批执行计划

- 日期：2026-04-04
- 运行时：`vibe`
- 内部等级：`L`

## Wave 1

1. `ScrollReaderView.tsx`
   - 删除旧的 `IntersectionObserver + hydrationQueue` 段级水合兼容代码
   - 统一为基于 `computeVisibleRange()` 的滚动同步窗口化调度
   - 去掉高亮注入对 placeholder 强制物化的依赖
2. 运行时文档
   - 冻结第三批需求和执行计划

## 验证命令

1. `npx tsc --pretty false --noEmit`
2. `npm run build --silent`

## 回滚规则

1. 若窗口化滚动同步出现回归，优先保留前两批的窗口化能力，再恢复最小必要兼容代码。
2. 不改动前两批已提交的文档与实现。

## 清理要求

1. 不提交调查目录下的未跟踪文档。
2. 本批次完成后提交本地变更，并尝试推送远端。
