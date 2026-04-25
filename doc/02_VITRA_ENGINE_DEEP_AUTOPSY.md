# Vitra Engine 深度评估归档

## 状态

历史评估归档，已被当前规范文档取代。

## 背景

本文件原先记录 2026-03-22 对旧 PDF 渲染方案、Reader 主链和文档债务的深度评估。该评估发生时，多个关键文件仍处于重建前状态；其中不少结论已经被后续实现修正或迁移。

为了避免旧结论继续被误用，本文件只保留归档说明，不再作为当前实现真值。

## 当前替代文档

- PDF runtime、文字层、JPEG 渲染策略：`doc/modules/pdf-provider.md` 与 `doc/adr/0001-pdf-runtime-fallback.md`、`doc/adr/0002-disable-pdf-text-layer.md`、`doc/adr/0003-jpeg-render-strategy.md`。
- Reader UI 拆分状态：`doc/modules/reader-ui.md`。
- Vitra 渲染管线与大章节策略：`doc/modules/vitra-engine.md`。
- 当前端到端打开、搜索、同步、统计、销毁链路：`doc/04_E2E_FLOWS.md`。
- 当前测试和验证边界：`doc/05_TEST_ORACLES.md`。
- 存储、同步、设置、阅读统计和缓存治理：`doc/06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md`。

## 已过时的历史判断

以下旧判断不再直接适用于当前代码：

- `ReaderView` 直接内联完整书籍加载链路。当前已由 `useReaderBookSession` 承担会话装配。
- `ScrollReaderView` 是未拆分的单一超大组件。当前滚动模式已拆到 `src/components/Reader/scrollReader/` hook 族。
- `VitraBookCache` hash 计算存在递归风险。当前实现使用 `computeBufferHash()` 与 `WeakMap<ArrayBuffer, string>`。
- `db.settings` 键空间只能靠散落约定维护。当前同步边界集中在 `src/stores/syncStorePayload.ts`，并已有治理文档。

## 仍然保留价值的历史提醒

以下风险仍需要在当前规范中持续关注：

- PDF runtime fallback 会影响阅读体验，需要按 ADR 约束维护。
- PDF text layer 当前仍是性能与交互能力之间的取舍点。
- 大章节渲染的术语和实际能力要区分清楚：当前“向量化”主要指分段元数据和虚拟渲染调度，不等同于图形学意义的矢量绘制。
- Reader UI 仍需要防止职责重新向入口组件回流。
- 构建产物仍存在大 chunk 告警，`pdf-vendor` 仍是主要体积来源。

## 使用方式

接手当前项目时，不要从本文件判断实现现状。先阅读 `doc/README.md` 推荐的顺序，再按具体模块查对应规范。
