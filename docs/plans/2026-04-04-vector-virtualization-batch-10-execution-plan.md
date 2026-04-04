# 向量化虚拟渲染第十批执行计划

- 日期：2026-04-04
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/engine/render/chapterPreprocessService.ts`
   - 实现 worker 失败时的同步降级
   - 调整大章节动态超时
2. `src/test/chapterPreprocessService.test.ts`
   - 覆盖成功回填、无 worker 降级、初始化失败降级和超时降级

## 验证命令

1. `npx vitest run src/test/chapterPreprocessService.test.ts src/test/chapterPreprocessCore.test.ts src/test/htmlSaxStream.test.ts`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若同步降级影响现有 worker 正常路径，只回退服务层降级逻辑，不动第九批的 SAX 预处理。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后推送远端。
