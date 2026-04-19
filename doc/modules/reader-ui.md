# Reader UI 模块规范

## 1. 模块范围

主要文件：

- `src/components/Reader/ReaderView.tsx`
- `src/components/Reader/useReaderBookSession.ts`
- `src/components/Reader/useReaderNavigation.ts`
- `src/components/Reader/useReaderAnnotations.ts`
- `src/components/Reader/ScrollReaderView.tsx`
- `src/components/Reader/PaginatedReaderView.tsx`
- `src/components/Reader/ShadowRenderer.tsx`
- `src/components/Reader/scrollReader/`

## 2. 模块职责

Reader UI 层负责：

- 作为阅读体验总入口
- 按阅读模式组织内容呈现
- 向下消费统一内容接口
- 向下驱动 Shadow/Vitra 渲染
- 承担用户可见交互与布局组织

## 3. 分工原则

### 3.1 App / ReaderView 入口关系

- Renderer 入口是 `src/main.tsx:1-11`
- `App` 负责在 `library` 与 `reader` 视图之间切换：`src/App.tsx:10-21,79-84`
- 当前顶层不是 Router，而是状态切视图；文档和后续改动都不应误写成“路由切页”
- `ReaderView` 是阅读器总入口，负责：
  - 组合 `useReaderBookSession`、`useReaderNavigation`、`useReaderAnnotations`、`useAutoScrollActiveToc`、`useReaderClock`
  - 根据 `resolveReaderRenderMode()` 决定最终模式：`src/components/Reader/ReaderView.tsx`
  - 组织工具栏、左侧面板、页脚与设置面板，并把公共状态下发给子阅读器

- `useReaderBookSession` 负责：
  - 读取书籍元数据、文件数据、已保存进度
  - 创建 `VitraPipeline` 与 `VitraContentAdapter`
  - 恢复初始阅读位置并生成滚动/分页初始化参数

- `useReaderNavigation` 负责：
  - 目录点击、搜索执行、搜索结果跳转
  - `jumpTarget` 延迟派发
  - 向 `ScrollReaderView` / `PaginatedReaderView` 统一转发 `jumpToSpine()`

同时，`resolveReaderRenderMode()` 会对固定布局格式强制限制模式：`src/engine/core/readerRenderMode.ts:9-18,25-59`

### 3.2 ReaderView

应承担：

- 统一入口
- 基本模式切换与公共参数组织
- 连接上层业务状态与下层阅读视图
- 维护顶部工具栏、左侧 TOC/搜索/标注面板、底部页脚、右侧设置面板
- 持有 provider ref 与子阅读器 ref，但不再自己内联实现 Dexie 读取和 provider 装配

不应承担：

- 具体格式解析细节
- PDF runtime 细节
- 大量章节预处理逻辑
- 滚动阅读内部的 refs、卸载策略和虚拟章节调度细节

### 3.3 ScrollReaderView

`ScrollReaderView.tsx` 已收敛为纯调度层（约 620 行），不再承载业务细节。所有职责拆到 `src/components/Reader/scrollReader/` 子目录下的专职 hook，主组件只负责：
- 解构 props，创建共享 refs 容器（`useScrollReaderRefs`）
- 按依赖顺序调用各职责 hook，把 refs 与业务参数传进去
- 挂 JSX：viewport、chapterList、shadow 渲染队列、选区菜单

#### 3.3.1 scrollReader/ 子目录文件清单与职责

| 文件 | 职责 | 关键写入的 refs |
|------|------|-----------------|
| `useScrollReaderRefs.ts` | 所有 useRef 的统一定义点，接受 `{ initialSpineIndex }` 返回 `ScrollReaderRefs`；新增 ref 只改此文件 | 无（声明层） |
| `scrollReaderTypes.ts` | `LoadedChapter` / `PipelineState` / `ViewportDerivedMetrics` 类型 | — |
| `scrollReaderConstants.ts` | 物理引擎调参、hydration 常量、preload/unload 阈值等 41 个常量 | — |
| `scrollReaderHelpers.ts` | 纯函数：`markChapterAsMounted` / `resolveHighlightSpineIndex` / `resolveViewportDerivedMetrics` 等 | — |
| `useVirtualChapterRuntime.ts` | 虚拟段 mount/release/register/refresh 协议；持有 `virtualChaptersRef` 与 `chapterVectorsRef` | `virtualChaptersRef`, `chapterVectorsRef` |
| `useChapterLoader.ts` | 章节按需加载 + 预取 + readerStyles 变化触发 shadow 重渲染/vector 重载分流 | `loadingLockRef`, `pipelineRef`, `readerStylesKeyRef`, 通过 setChapters/setShadowQueue 维护状态 |
| `useShadowRenderComplete.ts` | ShadowRenderer onReady 回调 + rAF batch + `forceHydrateSegment` + `materializeAllVirtualSegments` | `pendingReadyRef`, `pendingReadyRafRef`, `pendingDeltaRef`, `lastKnownAnchorIndexRef` |
| `useAtomicDomCommit.ts` | DOM 原子挂载 `useLayoutEffect` + scroll 补偿 `requestFlush` + `commitProgressSnapshot` + `syncViewportState` | `flushRafRef`, `unlockAdjustingRafRef`, `ignoreScrollEventRef`, `lastReportedProgressRef` |
| `useTocJump.ts` | `jumpToSpine` + PDF 内部链接点击监听 | `jumpGenerationRef`, `pendingSearchTextRef`, `initialScrollDone`, `loadingLockRef` |
| `useScrollHandler.ts` | viewport scroll 事件 + 方向检测 + 预加载触发 + progress 防抖 | `lastScrollTopRef`, `progressTimerRef`, `scrollIdleTimerRef`, `isUserScrollingRef` |
| `useChapterUnloader.ts` | 周期性章节回收（卸载冷却 + 上下方 radius 策略） | 通过 `setChapters`、`virtualChaptersRef`、`highlightIdleHandlesRef` |
| `useVirtualSegmentSync.ts` | viewport 范围内的全局虚拟段 mount/release 计划 | `virtualSyncRafRef`, `highlightDirtyChaptersRef` |
| `useHighlightAndSelection.ts` | 选区检测 + scroll 关闭菜单 + 高亮 idle 注入节流 | `highlightDirtyChaptersRef`, `highlightIdleHandlesRef` |

#### 3.3.2 主组件仍承担的事

- `forwardRef` + `useImperativeHandle` 暴露 `jumpToSpine`
- `useSelectionMenu`（共享 hook，非 scrollReader/ 专属）
- `useScrollInertia` / `useScrollEvents` 物理与事件接线
- 三段 `useMemo` 派生 `normalizedSmoothConfig` / `physicsConfig` / `inertiaTuning`（仅依赖 props）
- `chaptersRef.current = chapters` 等 keep-ref-in-sync 赋值
- 进入章节时的高亮预加载 `useEffect`（从 `db.highlights` 拉取）
- Spine 初始化 `useEffect`（写 `spineItemsRef`）
- JSX 渲染（viewport / chapterList / shadow 队列 / 选区菜单）

#### 3.3.3 hook 之间的依赖顺序

必须按以下顺序调用，否则 TDZ 报错：

1. `useScrollReaderRefs`（所有 refs 创建）
2. 业务 state (`useState`) + useMemo 派生配置
3. Selection Menu、Physics、Idle、ResizeObserver、Virtual Runtime 接线
4. 聚合 cleanup `useEffect`
5. Spine 初始化 `useEffect`
6. `useChapterLoader`（返回 `loadChapter` / `runPredictivePrefetch`）
7. `useAtomicDomCommit`（返回 `requestFlush`、在 ShadowRenderComplete 之前必要）
8. `useShadowRenderComplete`（需要 `requestFlush`）
9. `useScrollHandler`（需要 `loadChapter` / `syncViewportState`）
10. `useChapterUnloader`
11. `useTocJump`（需要 `loadChapter` / `forceHydrateSegment` / `materializeAllVirtualSegments` / `syncViewportState`）
12. `useImperativeHandle` 暴露 `jumpToSpine`
13. `useHighlightAndSelection`（返回 `scheduleHighlightInjection`）
14. `useVirtualSegmentSync`（需要 `scheduleHighlightInjection`）

#### 3.3.4 应继续承担的职责

- 组合阅读模式需要的所有 hook
- 对外提供稳定的命令式 API（`ScrollReaderHandle.jumpToSpine`）
- 连接 ShadowRenderer 的 onReady 回调到业务层

#### 3.3.5 不应承担

- 任何在上表已有 hook 承担的具体业务（章节加载/卸载、DOM 挂载、滚动事件、虚拟段管理、选区、高亮、TOC 跳转）
- 新增与滚动阅读相关的职责必须先评估是否应该作为新的 scrollReader/ 下 hook，而不是写回主组件

### 3.4 PaginatedReaderView

应承担：

- 分页模式布局与翻页体验
- 与章节切分、页面定位和渲染容器协同
- 通过 `jumpToSpine()` 暴露命令式跳章接口：`src/components/Reader/PaginatedReaderView.tsx:31,657-695`
- 负责分页模式的阅读进度写回：`src/components/Reader/PaginatedReaderView.tsx:577-583`
- 通过 `ShadowRenderer` 渲染完整章节供分页测量：`src/components/Reader/PaginatedReaderView.tsx:662-700`

### 3.5 ShadowRenderer

应承担：

- 样式注入
- 内容 DOM 构建
- 向量化渲染计划执行
- placeholder 与 hydrate 节奏控制

## 4. 修改约束

- 不要在 Reader UI 层写入具体文件格式分支，优先收敛到 provider/adapter
- 不要把缓存释放策略散落到多个 UI 组件中
- 不要在模式组件内复制公共渲染管线逻辑
- 对 `ShadowRenderer` 的修改默认视为高风险，需要同时验证滚动/分页路径
- 阅读模式选择必须经过 `resolveReaderRenderMode()`，不能只改按钮显示不改模式约束；当前按钮入口已经收敛到 `ReaderModeSettings`：`src/components/Reader/ReaderModeSettings.tsx:19-47`
- 子阅读器应继续维持统一接口契约：`provider` + 初始定位参数 + `readerStyles` + 进度/章节回调 + `jumpToSpine()`
- 当前阅读器状态真实来源仍以 `ReaderView` 本地状态为主，仓库中未检到 `useReaderStore()` 实际消费点；不要把不存在的 store 当成真值层

## 5. 高风险点

- Reader 模式切换条件
- 首屏内容装载顺序
- 延迟段 placeholder 尺寸估算
- Shadow DOM 内样式注入顺序
- 与搜索、目录跳转、阅读位置恢复的联动

## 6. 需要继续补齐的源码真值

后续仍可继续细化的函数级引用：

- PaginatedReaderView 的分页计算入口
- ShadowRenderer 的阶段调用位置与关键 DOM 组织点

当前已补到的关键真值：

- `App.handleOpenBook()` 通过 `currentBookId` / `jumpTarget` 切到 `ReaderView`：`src/App.tsx:17-21,80-83`
- `useReaderBookSession` 负责读取 `db.books` / `db.bookFiles` / `db.progress`，再创建 `VitraPipeline` 与 `VitraContentAdapter`：`src/components/Reader/useReaderBookSession.ts`
- `jumpTarget` 在 ready 后由 `useReaderNavigation` 触发 `jumpToAnnotation()`：`src/components/Reader/useReaderNavigation.ts`
- `jumpToAnnotation()` / `handleTocClick()` / `handleSearchWithKeyword()` 的派发点当前集中在 `useReaderNavigation`
- `ScrollReaderView` 的滚动内核已完全拆到 `src/components/Reader/scrollReader/`，主组件仅余调度层；详见 §3.3.1 的 hook 矩阵
- `PaginatedReaderView` 仍负责章节预处理、离屏测量与 `ShadowRenderer` 挂载：`src/components/Reader/PaginatedReaderView.tsx`
