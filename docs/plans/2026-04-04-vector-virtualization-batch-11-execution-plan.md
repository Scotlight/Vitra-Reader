# 向量化虚拟渲染第十一批执行计划

- 日期：2026-04-04
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/components/Reader/ScrollReaderView.tsx`
   - 去掉剩余生产 `any`
   - 提炼章节 DOM 清理辅助函数

## 验证命令

1. `npx tsc --pretty false --noEmit`
2. `npm run build --silent`
3. `rg -n "\\bany\\b|as any|: any|<any>|any\\[]" src/components/Reader src/engine/render src/engine/types -S`

## 回滚规则

1. 若提炼后的清理函数影响章节状态机，只回退辅助函数抽取，不动前十批主链。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码和运行时文档。
2. 完成后推送远端。
