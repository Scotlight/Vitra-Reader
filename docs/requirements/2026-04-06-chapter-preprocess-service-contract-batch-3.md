# ChapterPreprocessService 契约修复批次 3

## 目标

修复 `src/engine/render/chapterPreprocessService.ts` 与其测试之间的契约漂移，解除当前全量构建被 `chapterPreprocessService.test.ts` 阻塞的问题。

## 交付物

1. `resolveChapterPreprocessTimeout` 导出恢复。
2. `preprocessChapterContent` 在 Worker 不可用、初始化失败、超时或运行失败时同步降级到 `preprocessChapterCore`。
3. 相关测试与全量构建恢复通过。

## 约束

- 不改动 `chapterPreprocessCore` 的语义。
- 不改变 Worker 成功路径的 `_htmlBuffer` 回填行为。
- 不引入新的异步协议或新的缓存层。

## 验收标准

1. `src/test/chapterPreprocessService.test.ts` 全部通过。
2. `npm run build --silent` 不再因为 `resolveChapterPreprocessTimeout` 缺失而失败。
3. Worker 可用时仍优先走 Worker 预处理。
4. Worker 不可用时返回值与 `preprocessChapterCore(payload)` 一致，并记录降级警告。

## 非目标

- 本批次不优化预处理性能。
- 不修改 `chapterPreprocess.worker.ts` 的传输协议。
- 不处理翻页模式和滚动模式其他性能问题。

## 推断与假设

1. 当前构建阻塞来自服务实现被简化后，测试仍保持旧契约。
2. 测试描述的行为比当前实现更完整，因此以测试契约为修复目标更稳妥。
3. 同步降级是当前渲染链路更安全的兜底方式。

## 证据锚点

- `src/engine/render/chapterPreprocessService.ts`
- `src/test/chapterPreprocessService.test.ts:79-142`
