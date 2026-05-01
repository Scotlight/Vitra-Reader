# 分页虚拟化稳定性执行计划

日期：2026-05-01

## 内部等级

M：集中在分页加载与分页水平页窗模块，写入范围明确，不需要并行子代理。

## 阶段

1. 分页加载隔离
   - 在 `usePaginatedChapterLoader` 增加加载序列号。
   - 每个异步边界后检查当前序列，旧任务只允许自然返回，不允许写入 UI 状态。
   - 增加快速连续跳转回归测试。

2. 水平页窗内容脱水
   - 扩展 `PaginatedHorizontalWindowItem`，记录原始样式、HTML、媒体属性。
   - 页窗外元素脱水：保留布局壳，清理子 DOM 与媒体 src。
   - 回到页窗时恢复内容、样式与媒体属性。
   - 保持 `data-vitra-horizontal-window="hidden"` 兼容空白页检测。
   - 增加纯函数测试和 `PaginatedReaderView` 流程测试。

3. 文档与验证
   - 更新 ADR 0009 的当前能力边界。
   - 执行分页/滚动虚拟化定向测试。
   - 执行 lint 与 build。
   - 输出 cleanup receipt。

## 回滚规则

- 任一阶段验证失败，停止后续推送。
- 不使用 `git reset`；需要回滚时用反向补丁或新提交。

## 清理

- 保留 `outputs/runtime/vibe-sessions/20260501-142422-paginated-virtualization/` 作为本地运行证据，不纳入推送。
