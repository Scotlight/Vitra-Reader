# PDF 连续滚动重建需求冻结

- 日期：`2026-03-22`
- 主题：`pdf-scroll-rebuild`
- 模式：`interactive_governed`

## Goal

在保留 `pdfjs-dist` 作为底层 PDF 解析与光栅化内核的前提下，重建当前项目的 PDF 阅读层，使 PDF 进入长期可维护的专用实现路径，并且只支持连续滚动模式。

## Deliverable

输出一套可运行的 PDF 阅读重构结果，至少包含：

1. 一个独立的 PDF 渲染文件夹，承载 runtime、页面渲染、导航与 provider 责任边界
2. 保持现有 PDF 基础能力不减少：打开、目录、内部跳转、进度、暗色主题适配、基础搜索能力
3. `ReaderView` 中 PDF 只走连续滚动分支，不再暴露单双页分页作为可用模式
4. 保留现有导入链路与 `contentProviderFactory` 调用入口兼容

## Constraints

- 仅保留 `pdfjs-dist` 作为底层内核，不引入新的 PDF 引擎
- 不通过静默降级或模拟成功路径掩盖错误
- 尽量不触碰与 PDF 无关的阅读器逻辑
- 保持修改可追溯，优先做结构性重建而不是表面修补
- 尊重仓库中已有未提交改动，不覆盖无关文件内容

## Acceptance Criteria

- `src/engine/parsers/providers/pdf/` 下形成职责清晰的 PDF 模块目录
- `src/engine/parsers/providers/pdfProvider.ts` 收敛为兼容入口或薄包装，而不是继续堆积实现
- PDF 阅读模式决策只允许 `scrolled-continuous`
- PDF 在连续滚动模式下可正常打开、滚动、目录跳转与页内链接跳转
- PDF 搜索在当前 `ReaderView -> VitraContentAdapter` 链路下仍然可用
- 构建检查通过

## Non-Goals

- 本轮不实现 PDF 单页/双页分页阅读
- 本轮不替换 `pdfjs-dist`
- 本轮不处理 `docs/TO DO.md` 的第 2-8 项
