# Scroll 虚拟化正式接入批次

## 目标

在保留 `ShadowRenderer` 的前提下，把已经存在但未完全接入的 scroll 模式向量化虚拟渲染能力正式接入主链，修复当前的样式重预处理缺失、placeholder 恢复缺失、段节点池释放错误，以及单段回退空白风险。

## 交付物

1. `ScrollReaderView` 对大章节向量化章节的直接外壳接入。
2. `ShadowRenderer` 导出可复用的窗口化章节外壳构造函数。
3. 样式变化后向量章节重新预处理，不再沿用旧 `segmentMetas`。
4. placeholder 章节在样式未变时可直接从缓存恢复。
5. `jumpToSpine()` 的段节点池释放选择器修复。
6. 单段 `segmentMetas` 场景下保留 HTML 载荷，避免空白章节。

## 约束

- 不删除 `ShadowRenderer`。
- 普通章节与分页模式保持原有主链。
- 不重写滚动物理引擎。
- 不改动 Worker 传输协议。

## 验收标准

1. 大章节初次加载可以直接进入向量章节外壳，避免进入 `ShadowRenderer` 的整章阶段。
2. 样式切换后，向量章节重新调用预处理，不再复用旧 `segmentMetas`。
3. placeholder 向量章节在样式未变时可恢复，不重新抓取 HTML。
4. `jumpToSpine()` 清理路径能正确释放段节点到 `segmentPool`。
5. 单段 `segmentMetas` 时不会清空 `htmlContent/htmlFragments`。
6. 相关测试与构建通过。

## 非目标

- 本批次不实现翻页模式虚拟化。
- 不把 scroll 模式改造成仅保留活跃段 DOM 的全新架构。
- 不处理非虚拟化章节的渲染策略。

## 推断与假设

1. `scrollChapterFetch.ts`、`scrollChapterLoad.ts`、`scrollVectorStrategy.ts` 代表之前沉淀但未完全接入的正式化方向。
2. 当前 `scrollReaderVectorFlow.test.tsx` 失败，说明主链没有完整接上向量章节外壳与样式重预处理逻辑。
3. 保留 `ShadowRenderer`，但让它提供可复用外壳构造能力，是当前最稳妥的融合方式。

## 证据锚点

- `src/components/Reader/ScrollReaderView.tsx:520-556`
- `src/components/Reader/ScrollReaderView.tsx:567-592`
- `src/components/Reader/ScrollReaderView.tsx:1161-1168`
- `src/engine/render/chapterPreprocessCore.ts:57-67`
- `src/test/scrollReaderVectorFlow.test.tsx:200-251`
