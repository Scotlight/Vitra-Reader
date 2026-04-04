# 向量化虚拟渲染第九批执行计划

- 日期：2026-04-04
- 运行时：`vibe`
- 内部等级：`L`

## Wave 1

1. `src/engine/render/htmlSaxStream.ts`
   - 增加回调式流式扫描接口
2. `src/engine/render/chapterPreprocessCore.ts`
   - 改用回调式 SAX 消费完成分片与向量落段
   - 真正命中向量化计划时去掉重复 HTML 载荷

## Wave 2

1. `src/test/htmlSaxStream.test.ts`
   - 覆盖回调一致性与提前停止
2. `src/test/chapterPreprocessCore.test.ts`
   - 覆盖媒体标签归属与大章节去重载荷

## 验证命令

1. `npx vitest run src/test/htmlSaxStream.test.ts src/test/chapterPreprocessCore.test.ts src/test/scrollVectorStrategy.test.ts src/test/metaVectorManager.test.ts`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若回调式扫描影响切段正确性，先保留新增测试，再回退到聚合数组实现。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批代码、测试和运行时文档。
2. 完成后推送远端。
