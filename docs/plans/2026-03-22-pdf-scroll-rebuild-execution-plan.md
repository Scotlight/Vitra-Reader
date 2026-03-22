# PDF 连续滚动重建执行计划

- 日期：`2026-03-22`
- Internal Grade：`L`
- Topic：`pdf-scroll-rebuild`

## Waves

### Wave 1 — Requirement Freeze
- 写入需求冻结文档
- 写入设计文档
- 建立 taskmaster CSV 与 session 回执

### Wave 2 — PDF 模块拆分
- 新建 `src/engine/parsers/providers/pdf/` 文件夹
- 拆分 runtime、导航、页面渲染、HTML 组装、provider 主体
- 将 `src/engine/parsers/providers/pdfProvider.ts` 缩减为兼容入口

### Wave 3 — 阅读模式重定向
- 修改 `src/engine/core/readerRenderMode.ts`
- 让 PDF 仅允许 `scrolled-continuous`
- 保持其他固定布局格式行为不变

### Wave 4 — 搜索与功能兼容
- 让 PDF 页 HTML 产出可被索引的隐藏文本层
- 保留目录、页内跳转、邻页预渲染、元数据解析能力
- 确认 `ReaderView` 主链无需额外分叉

### Wave 5 — Verification & Cleanup
- 运行类型检查 / 构建验证
- 记录 phase 回执与 cleanup 回执
- 删除 taskmaster CSV

## Ownership Map

- `src/engine/parsers/providers/pdf/`：PDF 专用实现重建
- `src/engine/parsers/providers/pdfProvider.ts`：兼容导出
- `src/engine/core/readerRenderMode.ts`：模式决策修正
- `docs/requirements/*`、`docs/plans/*`、`outputs/runtime/vibe-sessions/*`：治理产物

## Verification Commands

- `powershell.exe -Command npm run lint`
- `powershell.exe -Command npm run build --silent`
- `powershell.exe -Command rg -n "scrolled-continuous|PDF" src/engine/core/readerRenderMode.ts src/engine/parsers/providers/pdf src/engine/parsers/providers/pdfProvider.ts`

## Rollback Rule

- 如需回滚代码，只回退本轮新增的 `src/engine/parsers/providers/pdf/` 目录及相关模式决策修改
- `pdfProvider.ts` 保留兼容入口，回滚时可直接恢复到旧单文件实现

## Cleanup Expectation

- 不遗留临时脚本
- 不遗留 taskmaster CSV
- 保留需求、设计、执行计划、phase 回执与 cleanup 回执
