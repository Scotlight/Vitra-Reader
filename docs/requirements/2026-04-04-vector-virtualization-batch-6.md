# 向量化虚拟渲染第六批需求冻结

- 日期：2026-04-04
- 运行时：`vibe`
- 模式：`benchmark_autonomous`

## 目标

把当前“章节内窗口化”继续推进到“跨章节全局节点预算控制”，避免相邻多个大章节同时进入预加载范围时累计挂载过多真实段 DOM；同时补齐向量缓存恢复、窗口化分流和已测量段恢复的回归测试。

## 交付物

1. `ScrollReaderView` 的虚拟段同步逻辑改为按整本书范围统一分配挂载预算，而不是逐章节各自扩张。
2. 向量缓存恢复与窗口化分流判定提炼为纯函数，供渲染路径和测试共用。
3. 新增针对全局预算、缓存恢复、队列绕过和已测量段恢复的单元测试。

## 约束

1. 不回退前五批已经落地的窗口化、搜索、高亮与缓存复用逻辑。
2. 不改分页模式。
3. 不提交调查目录、聊天导出和其他未跟踪材料。
4. 不把小章节强行纳入向量化窗口主链。

## 验收标准

1. 多个向量化章节同时处于预加载范围时，真实挂载段数受全局预算限制。
2. 命中向量化计划的章节仍然绕过 `shadowQueue`，直接进入窗口化章节外壳。
3. placeholder 章节恢复时，样式键一致的向量缓存仍可复用。
4. `buildChapterMetaVector()` 可正确恢复已测量段的 `offsetY` 和 `fullyMeasured` 状态。
5. `npx vitest run src/test/scrollVectorStrategy.test.ts src/test/metaVectorManager.test.ts` 通过。
6. `npx tsc --pretty false --noEmit` 通过。
7. `npm run build --silent` 通过。

## 非目标

1. 本批次不重写 `ShadowRenderer` 的非向量化职责。
2. 本批次不处理未跟踪审计文档的入库与提交流程。
