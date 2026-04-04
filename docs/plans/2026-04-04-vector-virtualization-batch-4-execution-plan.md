# 向量化虚拟渲染第四批执行计划

- 日期：2026-04-04
- 运行时：`vibe`
- 内部等级：`L`

## Wave 1

1. `ScrollReaderView.tsx`
   - 占位章节卸载时保留向量缓存必需字段
   - `loadChapter()` 增加 placeholder 向量缓存快速恢复分支
2. `ShadowRenderer.tsx`
   - 支持只依赖 `segmentMetas` 的滚动模式虚拟容器恢复
   - 用向量元数据计算 `chapterSize` 和媒体敏感标记
3. `metaVectorManager.ts`
   - 修正 `buildChapterMetaVector()` 的已测量状态恢复

## 验证命令

1. `npx tsc --pretty false --noEmit`
2. `npm run build --silent`

## 回滚规则

1. 若缓存恢复影响章节重新进入阅读时的正确性，优先保留当前窗口化主链，再回退缓存快速恢复分支。
2. 不改动前几批已提交的调查目录和运行时文档。

## 清理要求

1. 不提交调查目录下未跟踪文档。
2. 本批次完成后提交并推送远端。
