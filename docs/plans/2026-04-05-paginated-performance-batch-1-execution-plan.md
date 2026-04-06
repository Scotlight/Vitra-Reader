# 翻页模式性能优化批次 1执行计划

**内部执行等级**：M  
**目标**：为翻页模式增加分页边界内存缓存，减少重复章节进入时的离屏测量开销。  
**回滚原则**：如缓存导致分页错乱、页数异常或测试失败，整体回退到无缓存版本。

---

## Wave 1：缓存抽象

**文件**

- 新增：`src/components/Reader/paginatedMeasureCache.ts`
- 新增：`src/test/paginatedMeasureCache.test.ts`

**内容**

1. 定义分页缓存键生成函数。
2. 定义缓存读写与容量裁剪逻辑。
3. 只将影响分页的排版参数纳入键。

**验证**

- `npx vitest run src/test/paginatedMeasureCache.test.ts`

---

## Wave 2：PaginatedReaderView 接入

**文件**

- 修改：`src/components/Reader/PaginatedReaderView.tsx`

**内容**

1. 增加分页缓存 `Map`。
2. 在章节离屏测量前优先检查缓存。
3. 在测量完成后写入缓存。
4. 在 resize 重算路径复用相同缓存键。

**验证**

- `npx vitest run src/test/paginatedReaderFlow.test.tsx`

---

## Wave 3：回归测试

**文件**

- 修改：`src/test/paginatedReaderFlow.test.tsx`

**内容**

1. 新增“回到同一章节时不重复测量”的集成测试。
2. 保持现有“初次加载仍禁用向量化”和“样式变化重新加载”测试继续通过。

**验证**

- `npx vitest run src/test/paginatedMeasureCache.test.ts src/test/paginatedReaderFlow.test.tsx`

---

## Wave 4：整体验证与清理

**验证命令**

1. `npx vitest run src/test/paginatedMeasureCache.test.ts src/test/paginatedReaderFlow.test.tsx`
2. `npm run build --silent`

**清理要求**

- 不新增临时调试代码。
- 不保留未使用导入。
- 更新运行时回执，记录验证结果与未覆盖风险。

## 风险

1. 分页缓存键如果缺少影响布局的参数，会复用错误边界。
2. 缓存只覆盖同一会话内场景，对首次进入无帮助。
3. `scrollWidth` 的视觉页数与 `PageBoundary[]` 的逻辑页数仍可能有差异，本批次不修改该机制。
