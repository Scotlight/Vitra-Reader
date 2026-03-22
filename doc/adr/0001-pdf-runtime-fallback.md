# ADR-0001：PDF runtime fallback 到 legacy

## 状态

已采用

## 背景

PDF 渲染依赖 `pdfjs-dist`。在部分文档或环境下，modern runtime 会触发已知可恢复错误，导致文档无法稳定打开或渲染。

## 决策

- 优先尝试 modern runtime
- 命中已知错误时，切换到 legacy runtime
- 一旦触发全局降级，后续新文档继续使用 legacy runtime，避免重复失败

## 原因

- 保证 PDF 可读性优先于局部最优实现
- 将错误恢复逻辑收敛在 provider 内部
- 避免对同类故障重复付出失败成本

## 影响

正向：

- 提高 PDF 打开成功率
- 降低相同错误反复出现概率

代价：

- 全局切换后可能牺牲一部分 modern runtime 的潜在优势
- 需要额外维护 runtime 选择与缓存逻辑

## 后续约束

- 扩大或缩小 fallback 错误范围时必须重新验证真实文档样本
- 修改该策略时必须同步更新 `doc/modules/pdf-provider.md`
