# PDF 页图热路径回退与动态缩放执行计划

- 日期：2026-03-22
- 内部等级：M
- 模式：benchmark_autonomous

## 执行步骤

1. 盘点 `pdfPageRenderer.ts` 当前编码与缩放逻辑
2. 恢复默认 `JPEG@0.88` 热路径，并限制 `WebP` 仅为开发者调试覆盖
3. 引入基于页面面积、宽高上限与 DPR 的动态缩放策略
4. 将 `pdfPageRenderer.test.ts` 扩展为参数化回归测试矩阵
5. 运行定向测试与 `tsc` 验证

## 验证命令

- `npm run test:run -- src/test/pdfPageRenderer.test.ts`
- `npm run lint`

## 回滚规则

- 若动态缩放导致回归，优先回滚缩放策略，保留 `JPEG` 热路径修复
- 若调试覆盖标志影响默认行为，删除调试标志实现

## 清理要求

- 不留下运行中的额外进程
- 保留需求、计划与执行收据
