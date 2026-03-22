# Reader Debt Split

## 背景

当前 Reader 相关模块仍存在明显的屎山特征：

- `src/components/Reader/ReaderView.tsx` 仍接近千行
- `src/components/Reader/ScrollReaderView.tsx` 等文件继续远超项目约定的文件体积上限
- 用户明确要求优先处理大文件拆分，并检查是否存在 `any`

## 目标

本轮聚焦 Reader 入口层的进一步拆分：

1. 继续压缩 `ReaderView`
2. 抽出左侧目录 / 搜索 / 标注面板
3. 抽出右侧设置面板的壳层与主要块
4. 对 `src/**/*.ts(x)` 做 `any` 审计并记录结果

## 验收标准

- `ReaderView` 只保留壳层装配与少量 glue code
- 新拆分组件职责边界清晰
- 提供 `any` 审计结果
- 运行静态检查并说明剩余问题是否来自既有代码

## 非目标

- 本轮不全面重构 `ScrollReaderView`
- 本轮不修复所有既有 lint / tsc 历史问题
