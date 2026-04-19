# ADR-0004：ShadowRenderer 纯函数外移拆分

## 状态

已采用

## 背景

`ShadowRenderer.tsx` 达到 799 行，其中只有 ~295 行是 React 组件本体（含一个大 useEffect 驱动的 parse→measure→paginate→render→hydrate 管线），其余 500+ 行全是无状态纯函数：高度估算、向量化、段 DOM 操作、HTML 分片追加、媒体布局修复、CSS 构建、本地回退等。

## 考虑过的方案

### 方案 1（已采用）：纯函数外移，组件本体保留

把 ~500 行纯函数按职责拆到 `shadowRenderer/` 子目录的 10 个文件里，组件本体不拆。

### 方案 2（已否决）：拆组件内 useEffect 为多个 hook

把组件内 parse→measure→paginate→render→hydrate 管线拆成 `useRenderAndMeasure` + `useHydrationScheduler` 等 hook。

## 决策

采用方案 1。

## 原因

方案 1 的优势：

- 纯函数外移几乎零风险——不涉及 React 生命周期、不改状态流
- 每个文件职责单一、可独立测试
- 主文件仅剩组件壳 + 管线 useEffect，从 800 行降到 ~350 行
- 外部调用方 `import { ... } from './ShadowRenderer'` 完全不变（主文件 re-export）

方案 2 被否决的原因：

- 管线是严格串行异步 pipeline（五阶段通过 `runVitraRenderStage` 串起），拆成 hook 打散时序锚点，日志和 trace 追溯困难
- 只有一个 `containerRef`，没有"共享 refs 面广"的拆分动机（对比 ScrollReaderView 有 20+ refs）
- hydrate 阶段的 `cancelled` 闭包横跨整个 useEffect 生命周期，拆 hook 后要手动重建取消链路
- useEffect 和异步 Promise 的配合已精调（字体加载、资源等待、rIC yield），无故拆解风险 > 收益

## 额外决策

- `yieldToBrowser` / `yieldForHydration` 提取到独立 `yieldScheduling.ts`，被 vectorization、htmlChunkedAppend、组件本体共用
- `estimateSegmentHeight` 的入参定义为窄接口 `HeightEstimationStyleInputs`（只要 fontSize/pageWidth/lineHeight/paragraphSpacing 四个字段），不 import 完整 `ReaderStyleConfig`——表达"高度估算不关心颜色 / 字体名 / 对齐"，且让模块可独立测试
- D（向量化）+ E（段 DOM 操作）+ G（SegmentMeta 查询）合并到 `vectorization.ts`，因为三者都围绕"段"数据结构操作，拆得太细反而增加跨文件跳转

## 影响

正向：
- 主文件 799 → 355 行，所有子文件 ≤134 行
- 所有调用方 import 零改动
- tsc + vite build 全通过

负向：
- 子目录 10 个文件，初次浏览时文件数多于原来
- 组件本体仍有 ~350 行的大 useEffect，如果未来需要拆解管线，需另案评估
