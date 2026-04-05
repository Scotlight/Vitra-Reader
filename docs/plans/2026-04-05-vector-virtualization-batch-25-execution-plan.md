# 向量化虚拟渲染第二十五批执行计划

- 日期：2026-04-05
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `docs/vitra-engine-audit.md`
   - 重写为当前真实状态
   - 增加滚动主链、分页现状、测试覆盖和剩余缺口

## 验证命令

1. `rg -n "computeGlobalVirtualSegmentMountPlan|createWindowedVectorChapterShell|fetchAndPreprocessChapter|resolveChapterPreprocessTimeout|streamHtmlBySaxStream" src/components/Reader src/engine/render -S`
2. `git diff -- docs/vitra-engine-audit.md`

## 回滚规则

1. 若文档与当前代码不一致，只回退文档，不动已落地主链代码。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批文档和运行时文档。
2. 完成后推送远端。
