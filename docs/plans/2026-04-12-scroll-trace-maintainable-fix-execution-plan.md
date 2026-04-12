# 2026-04-12 滚动阅读 trace 热点维护性修复执行计划

## 1. 内部等级

- 等级：L
- 运行模式：`benchmark_autonomous`
- 说明：任务涉及设计冻结、单次推送分析产物、3 个核心文件的局部实现与验证；范围不大，但需要先设计后执行。

## 2. 维护性优先实现方案

### 方案结论

采用“**三层各做一件事**”的局部收敛方案：

1. `ReaderView`
   - 稳定传入 `ScrollReaderView` 的 props。
   - 用 memo 隔离父层进度更新带来的子树重渲染。

2. `ScrollReaderView`
   - 合并章节探测与进度计算。
   - 高亮改为内存快照 + 章节级节流注入。
   - 被动路径只对已挂载 DOM 补高亮，不再强制整章物化。

3. `ShadowRenderer`
   - 限制媒体敏感章节首帧种子段数量。
   - 删除最重的种子段同步测量修正路径。

### 维护性理由

- 不引入新全局状态层。
- 不改变现有组件边界。
- 热点修复与职责边界一致，后续调试能直接回到对应组件。
- 每一项改动都能单独验证和回滚。

## 3. 波次拆分

### 波次 A：分析产物提交与推送

输出：
- `outputs/runtime/vibe-sessions/2026-04-12-scroll-trace-maintainable-fix/skeleton-receipt.json`
- `outputs/runtime/vibe-sessions/2026-04-12-scroll-trace-maintainable-fix/intent-contract.json`
- `docs/requirements/2026-04-12-scroll-trace-maintainable-fix.md`
- `docs/plans/2026-04-12-scroll-trace-maintainable-fix-execution-plan.md`

动作：
- 仅 stage 上述 run-owned 文档。
- 提交并推送分析产物，不混入当前工作树的无关改动。

### 波次 B：ReaderView / ScrollReaderView 实施

目标：
- 稳定 `ScrollReaderView` props。
- 减少父层进度更新导致的子树重渲染。
- 合并视口扫描。
- 高亮改为内存快照与增量注入。

预期修改文件：
- `src/components/Reader/ReaderView.tsx`
- `src/components/Reader/ScrollReaderView.tsx`
- 仅在确有必要时新增极小型局部辅助函数，不新增全局模块。

### 波次 C：ShadowRenderer 实施

目标：
- 限制媒体敏感章节首帧物化规模。
- 删除种子段同步批量测量修正逻辑。

预期修改文件：
- `src/components/Reader/ShadowRenderer.tsx`

### 波次 D：验证与清理

目标：
- 运行定向构建验证。
- 写 phase receipt 与 cleanup receipt。
- 汇总本轮修改范围与剩余风险。

## 4. 验证命令

1. 代码静态与构建验证
   - `npm run build --silent`

2. 必要时辅助定位
   - `git diff --stat`
   - `rg -n "db\.highlights|materializeAllVirtualSegments|updateProgress|updateCurrentChapter|initialSegmentCount" src/components/Reader`

## 5. 回滚规则

- 波次 A 只影响文档与 runtime 产物；若需要回滚，仅回滚本次分析提交。
- 波次 B / C 若出现回归，只回滚以下文件：
  - `src/components/Reader/ReaderView.tsx`
  - `src/components/Reader/ScrollReaderView.tsx`
  - `src/components/Reader/ShadowRenderer.tsx`
- 不回滚用户当前未纳入本轮的脏文件。

## 6. 风险

1. 被动高亮不再整章物化后，离屏段的高亮会延迟到段进入视口时再出现。
2. `ScrollReaderView` memo 化要求其 props 稳定；如果遗漏某个内联对象或回调，隔离效果会打折。
3. `ShadowRenderer` 去掉种子修正后，极端章节的首轮估算高度可能略保守；后续依赖已有虚拟段测量链路补正。

## 7. phase_cleanup 预期

- 写入至少一个执行 phase receipt。
- 写入 cleanup receipt。
- 清理仅本轮临时产物；保留 requirement、plan、receipt 作为审计材料。
