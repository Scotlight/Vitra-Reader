# Vitra Engine 深度尸检报告执行计划

- 日期：`2026-03-22`
- Internal Grade：`L`
- Topic：`vitra-engine-autopsy`

## Wave 1 — Skeleton & Boundary

- 记录当前分支、脏工作树与已有治理工件
- 确认 `pdfProvider.ts` 在工作树中处于删除状态
- 标注本次分析的证据边界：当前工作树 vs `HEAD` 快照

## Wave 2 — Evidence Collection

- 核验 PDF text layer、runtime fallback、JPEG、页面三层合成
- 核验“向量化”真实实现与 Reader/ShadowRenderer 责任分布
- 读取 ADR、模块规范、内部指南，识别是否已被制度化

## Wave 3 — Verdict Synthesis

- 形成 7 项核心指控裁定矩阵
- 补充用户未点出的附加发现
- 提炼架构层根因，而不是只列问题表象

## Wave 4 — Artifact Writeback

- 写入需求冻结文档
- 写入执行计划
- 写入正式尸检报告
- 写入 `vibe` phase / cleanup 回执

## Ownership Map

- `docs/requirements/*`：冻结本轮问题定义
- `docs/plans/*`：冻结执行路径
- `doc/02_VITRA_ENGINE_DEEP_AUTOPSY.md`：正式尸检报告
- `outputs/runtime/vibe-sessions/*`：运行回执

## Verification Commands

- `powershell.exe -Command git status --short`
- `powershell.exe -Command rg --files src docs doc | rg "pdf|ReaderView|ShadowRenderer|chapterPreprocessCore"`
- `powershell.exe -Command git show HEAD:src/engine/parsers/providers/pdfProvider.ts`
- `powershell.exe -Command (Get-Content src/components/Reader/ReaderView.tsx).Count`

## Rollback Strategy

- 本轮只新增治理与报告工件，不修改业务代码
- 如需回滚，只删除本轮新增的文档与 `outputs/runtime/vibe-sessions/<run-id>/` 工件

## Cleanup Expectation

- 不删除用户已有的 `PDF scroll rebuild TO DO list.csv`
- 不触碰当前工作树中正在进行的 PDF 重建改动
- 记录 Node 进程审计结果，但不主动清理非本轮创建进程
