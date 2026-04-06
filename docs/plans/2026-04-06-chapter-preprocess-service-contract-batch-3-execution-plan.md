# ChapterPreprocessService 契约修复批次 3执行计划

**内部执行等级**：M  
**目标**：恢复 `chapterPreprocessService` 的导出与同步降级契约，解除测试与构建阻塞。  
**回滚原则**：如果修复导致 Worker 成功路径退化或预处理结果变化，整体回退本批次改动。

---

## Wave 1：恢复超时导出

**文件**

- 修改：`src/engine/render/chapterPreprocessService.ts`

**内容**

1. 恢复 `resolveChapterPreprocessTimeout` 导出。
2. 采用与测试一致的长文本超时阶梯。

---

## Wave 2：恢复同步降级路径

**文件**

- 修改：`src/engine/render/chapterPreprocessService.ts`

**内容**

1. 引入 `preprocessChapterCore`。
2. 在 Worker 不存在、初始化失败、运行失败、超时等场景中统一降级。
3. 保留 Worker 成功时的 `_htmlBuffer` 回填。

---

## Wave 3：验证

**验证命令**

1. `npx vitest run src/test/chapterPreprocessService.test.ts`
2. `npx vitest run src/test/paginatedReaderFlow.test.tsx src/test/paginatedProgress.test.ts src/test/paginatedChapterJump.test.ts`
3. `npm run build --silent`

## 风险

1. 过度宽泛的降级可能掩盖真实 Worker 故障，但当前测试与稳定性要求更偏向兜底。
2. 工作树已经存在其他变更，提交前仍需区分本批次与既有修改。
