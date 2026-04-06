# Scroll 虚拟化正式接入执行计划

**内部执行等级**：L  
**目标**：把 scroll 模式已有的向量化辅助模块正式接入主链，并修复当前已确认的 3 个实现缺口。  
**回滚原则**：如接入后破坏普通章节渲染、ShadowRenderer 路径或现有测试，回退本批次改动。

---

## Wave 1：ShadowRenderer 外壳能力导出

**文件**

- 修改：`src/components/Reader/ShadowRenderer.tsx`

**内容**

1. 提取 scroll 向量章节外壳构造函数。
2. 允许 `ScrollReaderView` 直接复用其样式与 placeholder 结构。

---

## Wave 2：ScrollReaderView 正式接入

**文件**

- 修改：`src/components/Reader/ScrollReaderView.tsx`

**内容**

1. 接入 `scrollVectorStrategy`，判断是否命中向量章节主链。
2. 大章节向量路径改为：预处理 → 直接生成外壳 → 设置 `ready`。
3. placeholder 章节在样式键匹配时直接恢复。
4. 样式切换时，向量章节重新 `loadChapter()`，普通章节保持现状。
5. 修复 `jumpToSpine()` 的段节点释放选择器。

---

## Wave 3：单段回退兜底

**文件**

- 修改：`src/engine/render/chapterPreprocessCore.ts`
- 修改：`src/test/chapterPreprocessCore.test.ts`

**内容**

1. 只有真正可启用向量化时才丢弃 HTML 主载荷。
2. 增加单段回退测试，防止大章节空白。

---

## Wave 4：验证

**验证命令**

1. `npx vitest run src/test/scrollReaderVectorFlow.test.tsx src/test/scrollVectorStrategy.test.ts src/test/metaVectorManager.test.ts src/test/chapterPreprocessCore.test.ts`
2. `npm run build --silent`

## 风险

1. 直接外壳路径如果漏掉样式或 placeholder 结构，可能造成段挂载失败。
2. style reload 改成重新预处理后，向量章节切换样式时会有一次重新加载成本。
3. 当前工作树已有其他修改，提交前需要人工区分改动边界。
