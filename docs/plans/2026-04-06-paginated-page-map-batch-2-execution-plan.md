# 翻页模式逻辑页数对齐批次 2执行计划

**内部执行等级**：M  
**目标**：在翻页模式中，将测量完成后的有效页数从视觉页宽估算切换为逻辑页图真值。  
**回滚原则**：如果修复导致页码回跳异常、翻页失效或测试退化，整体回退本批次改动。

---

## Wave 1：页数对齐逻辑

**文件**

- 修改：`src/components/Reader/PaginatedReaderView.tsx`

**内容**

1. 提取视觉页数与逻辑页数的合并规则。
2. 在章节挂载、resize、测量完成后统一使用该规则。
3. 测量完成后同步修正 `totalPages/currentPage/displayPage`。

**验证**

- 运行相关 Vitest 用例。

---

## Wave 2：空白页判定修正

**文件**

- 修改：`src/components/Reader/PaginatedReaderView.tsx`

**内容**

1. 当逻辑页图已就绪时，页索引超出逻辑页范围直接视为空白页。
2. 保持未完成测量时的现有 DOM 扫描回退。

**验证**

- 新增“视觉页数大于逻辑页数时右翻页进入下一章”的测试。

---

## Wave 3：测试修复与回归

**文件**

- 修改：`src/test/paginatedReaderFlow.test.tsx`

**内容**

1. 让测试改为匹配当前实现：mock `preprocessChapterContent`，不再假定 `fetchAndPreprocessChapter` 路径。
2. 增加逻辑页数对齐测试。

**验证命令**

1. `npx vitest run src/test/paginatedReaderFlow.test.tsx src/test/paginatedProgress.test.ts src/test/paginatedChapterJump.test.ts`
2. `npm run build --silent`

## 风险

1. 如果测量完成后立即回写页码，可能影响个别章节正在进行的“跳到最后一页”过渡。
2. 当前组件仍以 CSS columns 承载内容，视觉列数与逻辑页图完全一致并不保证。
3. 工作树已有其他未提交修改，本批次只允许局部触碰翻页模式相关文件。
