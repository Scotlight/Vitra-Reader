# 向量化虚拟渲染第一批执行计划

- 日期：2026-04-04
- 运行时：`vibe`
- 内部等级：`L`

## Wave 1

1. 保持快照恢复结果不回退。
2. 改造 `ShadowRenderer.tsx`：
   - Worker 向量化滚动路径只创建虚拟化容器。
3. 改造 `ScrollReaderView.tsx`：
   - 注册虚拟化章节运行时
   - 二分查找可视范围
   - 可视段挂载 / 回收
   - 实测高度回写与滚动补偿
4. 保留非虚拟化路径和分页路径。

## 所有权边界

1. `src/components/Reader/ShadowRenderer.tsx`
2. `src/components/Reader/ScrollReaderView.tsx`
3. 需求冻结和运行时回执文件

## 验证命令

1. `npx tsc --pretty false --noEmit`
2. `npm run build --silent`

## 回滚规则

1. 若虚拟化主链导致编译失败，先回到最近可编译状态，再缩小改动面。
2. 不回退已核对一致的快照恢复代码。

## 阶段清理

1. 写入 `outputs/runtime/vibe-sessions/...` 回执。
2. 不新增临时脚本。
3. 不改动用户已有未跟踪文档目录。
