# Vitra Engine 深度尸检报告需求冻结

- 日期：`2026-03-22`
- 主题：`vitra-engine-autopsy`
- 模式：`benchmark_autonomous`

## Objective

对 Vitra Engine 当前与近期 PDF / Reader 架构做一次证据化尸检，区分：

- 已验证成立的问题
- 部分成立但需要语义校正的问题
- 已进入历史残影但仍在文档中传播的问题
- 当前工作树里已经启动的修复方向

## Deliverable

输出一份中文深度尸检报告，至少满足：

1. 逐条审查用户提出的 7 项核心指控
2. 每条结论都能回溯到源码、ADR、模块文档或当前工作树状态
3. 明确区分“事实”“推断”“历史实现”“当前在建状态”
4. 给出根因分析与整改优先级，但不伪装成已经完成的修复

## Constraints

- 不覆盖仓库中已有未提交代码改动
- 不引入静默降级、模拟成功或粉饰性结论
- 若工作树与 `HEAD` 存在漂移，必须显式说明证据边界
- 用户可读内容默认使用中文

## Acceptance Criteria

- 报告落盘到项目文档目录，可直接阅读
- 报告包含裁定矩阵（成立 / 部分成立 / 历史残影）
- 报告明确指出 `pdfProvider.ts` 当前处于工作树删除状态这一事实
- 报告补充至少 2 个用户未明确点出的附加发现
- 运行期留下 `vibe` skeleton / intent / phase / cleanup 工件

## Non-Goals

- 本轮不直接改写 PDF 渲染实现
- 本轮不对用户现有重构分支做代码回滚或接管
- 本轮不声称构建通过或功能修复完成

## Proxy Signal

避免把情绪强度误当成问题严重度；以可复核证据而不是措辞力度作为裁定依据。

## Scope

- PDF text layer 决策
- PDF runtime fallback 设计
- PDF 图像编码与页面合成策略
- “向量化渲染”命名与真实实现
- Reader 组件职责边界
- 当前 PDF 重建工作的上下文位置

## Completion Semantics

只有在以下条件同时满足时，才可视为本轮完成：

- 需求文档、执行计划、尸检报告、phase 回执、cleanup 回执均已写入
- 每项核心指控均有裁定与证据来源
- 明确声明哪些判断基于 `HEAD` 快照，哪些基于当前工作树

## Evidence Sources

- `doc/adr/0001-pdf-runtime-fallback.md`
- `doc/adr/0002-disable-pdf-text-layer.md`
- `doc/adr/0003-jpeg-render-strategy.md`
- `doc/modules/pdf-provider.md`
- `docs/VITRA_CORE_ENGINE_GUIDE.md`
- `docs/requirements/2026-03-22-pdf-scroll-rebuild.md`
- `docs/plans/2026-03-22-pdf-scroll-rebuild-execution-plan.md`
- `src/components/Reader/ReaderView.tsx`
- `src/components/Reader/ScrollReaderView.tsx`
- `src/components/Reader/PaginatedReaderView.tsx`
- `src/components/Reader/ShadowRenderer.tsx`
- `src/engine/render/chapterPreprocessCore.ts`
- `src/engine/core/readerRenderMode.ts`
- `HEAD:src/engine/parsers/providers/pdfProvider.ts`

## Inference Notes

- 当前仓库已经处于一次 PDF 重建过程中，因此尸检对象不是“单一静态版本”，而是“既有制度化决策 + 正在被替换的旧实现 + 已启动的重建方向”的组合。
