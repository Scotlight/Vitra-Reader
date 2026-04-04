# 向量化虚拟渲染第五批执行计划

- 日期：2026-04-04
- 运行时：`vibe`
- 内部等级：`L`

## Wave 1

1. `ShadowRenderer.tsx`
   - 提取可复用的窗口化章节外壳构建函数
2. `ScrollReaderView.tsx`
   - 对命中向量化计划的章节直接构建 `ready` 节点
   - 向量缓存恢复路径不再进入 `shadowQueue`

## 验证命令

1. `npx tsc --pretty false --noEmit`
2. `npm run build --silent`

## 回滚规则

1. 若直接创建章节外壳影响加载正确性，优先保留现有窗口化主链，再恢复 `shadowQueue` 兜底。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码与运行时文档。
2. 完成后推送远端。
