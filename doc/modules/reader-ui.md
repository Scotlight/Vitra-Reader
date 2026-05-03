# Reader UI 模块规范

## 1. 模块范围

主要文件：

- `src/components/Reader/ReaderView.tsx`
- `src/components/Reader/useReaderBookSession.ts`
- `src/components/Reader/useReaderNavigation.ts`
- `src/components/Reader/useReaderAnnotations.ts`
- `src/components/Reader/useReadingActivityTracker.ts`
- `src/components/Reader/ScrollReaderView.tsx`
- `src/components/Reader/PaginatedReaderView.tsx`
- `src/components/Reader/ShadowRenderer.tsx`
- `src/components/Reader/scrollReader/`
- `src/components/Reader/paginatedReader/`

## 2. 模块职责

Reader UI 层负责：

- 作为阅读体验总入口。
- 组合书籍会话、导航、注释、阅读统计和设置面板。
- 根据 `resolveReaderRenderMode()` 选择滚动或分页模式。
- 向下消费统一 `ContentProvider`。
- 向下驱动 `ShadowRenderer` / Vitra 渲染。
- 处理用户可见交互与布局。

## 3. App / ReaderView 入口关系

- Renderer 入口是 `src/main.tsx`。
- `App` 负责 `library / reader` 视图切换。
- `App` 启动时先加载持久化阅读设置，再加载 WebDAV 配置并触发启动同步。
- `ReaderView` 是阅读器总入口，但不再内联 Dexie 读取和 provider 装配。

`ReaderView` 组合的主要 hook：

- `useReaderBookSession`：读取 `db.books` / `db.bookFiles` / `db.progress`，创建 `BookPipeline` 与 `BookContentAdapter`，解析初始定位。
- `useReaderNavigation`：目录点击、搜索执行、搜索结果跳转、`jumpTarget` 延迟派发。
- `useReaderAnnotations`：书签与高亮数据。
- `useAutoScrollActiveToc`：TOC 激活项自动滚动。
- `useReaderClock`：页脚时间显示。
- `useReadingActivityTracker`：活跃阅读时长采集。

约束：

- `ReaderView` 只做入口组合、模式决策和公共参数组织。
- 格式解析、PDF runtime、缓存释放细节不写回 `ReaderView`。
- 阅读模式选择必须经过 `resolveReaderRenderMode()`。

## 4. `useReadingActivityTracker`

阅读统计当前已经接入 Reader UI：

- `ReaderView` 在 ready 后启用 tracker。
- 键盘、滚轮、指针、触摸事件调用 `markActivity()`。
- `handleProgressChange()` 也会标记活跃阅读。
- tracker 只在页面可见且窗口聚焦时累计。
- 达到 flush 阈值后调用 `addActiveReadingMs()` 写入 `readingStatsDaily`。
- 页面隐藏、卸载或组件 cleanup 时会刷新待写入时长。

约束：

- 该 hook 只负责采集活跃时长，不参与 UI 渲染。
- 不要把每一次用户事件写成持久化记录；当前模型是日级聚合。

## 5. ScrollReaderView

`ScrollReaderView` 已经是调度层，复杂职责拆到 `src/components/Reader/scrollReader/`。

### 5.1 子目录职责矩阵

| 文件 | 职责 |
| --- | --- |
| `useScrollReaderRefs.ts` | 统一定义滚动模式所需 refs。 |
| `scrollReaderTypes.ts` | `LoadedChapter`、`PipelineState`、视口指标等类型。 |
| `scrollReaderConstants.ts` | 物理滚动、预取、卸载、水合阈值等常量。 |
| `scrollReaderHelpers.ts` | 纯函数工具。 |
| `useVirtualChapterRuntime.ts` | 虚拟段 mount / release / register / refresh 协议。 |
| `useChapterLoader.ts` | 章节加载、预取、样式变化分流、windowed vector shell。 |
| `useShadowRenderComplete.ts` | ShadowRenderer ready 回调、rAF batch、水合接口。 |
| `useAtomicDomCommit.ts` | DOM 原子挂载、滚动补偿、进度快照提交。 |
| `useTocJump.ts` | `jumpToSpine` 与 PDF 内部链接监听。 |
| `useScrollHandler.ts` | 滚动事件、方向检测、预加载、进度防抖。 |
| `useChapterUnloader.ts` | 周期性章节回收。 |
| `useVirtualSegmentSync.ts` | 视口范围内虚拟段同步。 |
| `useHighlightAndSelection.ts` | 选区检测与高亮 idle 注入。 |
| `useReaderUnmountCleanup.ts` | 卸载期清理滚动模式的计时器、任务和引用。 |

### 5.2 主组件仍承担

- `forwardRef` 与 `useImperativeHandle` 暴露 `jumpToSpine`。
- 接入 `useSelectionMenu`、滚动惯性和滚动事件。
- 维护少量 keep-ref-in-sync 赋值。
- 进入章节时预加载高亮。
- 初始化 spine refs。
- 渲染 viewport、chapter list、shadow queue、选区菜单。

### 5.3 不应承担

- 新增章节加载、卸载、DOM 挂载、滚动事件、虚拟段、高亮、TOC 跳转细节。
- 这些能力应优先进入 `scrollReader/` 下的专职 hook。

## 6. PaginatedReaderView

`PaginatedReaderView` 保留主组件调度角色，分页链路中的稳定规则和可测试逻辑已经外移到 `src/components/Reader/paginatedReader/`。

当前职责：

- 分页模式布局与翻页体验。
- 章节预处理、离屏测量、分页容器和水平位移协同。
- 通过 `jumpToSpine()` 暴露命令式跳章接口。
- 写回分页模式阅读进度。
- 通过 `ShadowRenderer` 渲染完整章节供分页测量。

### 6.1 子目录职责矩阵

| 文件 | 职责 |
| --- | --- |
| `usePaginatedChapterLoader.ts` | 读取 spine、加载章节、执行预处理、处理空章节回退。 |
| `usePaginationMeasure.ts` | 分页离屏测量、测量任务取消、分页测量结果缓存读写。 |
| `usePaginatedPageLayout.ts` | 章节节点挂载、页数计算、页码约束、水平位移和 resize 重新布局。 |
| `paginatedChapterMount.ts` | 保护当前章节节点，清理旧容器内容，避免重复挂载误清理媒体资源。 |
| `paginatedPageLayoutMath.ts` | 页数、页码和 `translateX` 相关纯函数。 |
| `paginatedHorizontalWindowing.ts` | 计算水平页窗和候选元素隐藏规则。 |
| `usePaginatedHorizontalWindowing.ts` | 按当前页加 overscan 应用 `visibility` 级别的页窗裁剪。 |
| `usePaginatedNavigation.ts` | 翻页、跨章节跳转和空白页规避。 |
| `usePaginatedHighlights.ts` | 分页高亮、选区检测和章节级高亮缓存。 |
| `usePaginatedProgress.ts` | 分页阅读进度计算与回调。 |

### 6.2 当前性能策略

- 分页测量结果按书籍、章节、视口和排版参数缓存，避免章节回访和 resize 后重复离屏测量。
- 页面数量、页码约束和水平位移格式化集中在纯函数中维护。
- 水平页窗裁剪只隐藏页窗外候选元素，不移动、不删除 DOM 节点。
- 章节节点重复挂载时先判断是否已经独占挂载；同一章节节点旁有临时兄弟节点时，先移出当前章节再清理兄弟节点。
- 高亮链路采用 `db.highlights.where('bookId').equals(bookId).count()` 做失效校验，缓存 `groupedBySpine`，避免每次章节注入都重复分组整本高亮。

约束：

- 不要按行数硬拆 `PaginatedReaderView`。
- 分页路径新增职责先判断是否能轻度外移为 hook。
- 与滚动模式共享的能力不应复制实现。
- 分页模式不复用连续滚动的 segment DOM pool。
- 修改章节挂载、页窗裁剪或测量缓存后，至少执行分页挂载、水平页窗和分页主流程相关测试。

## 7. ShadowRenderer

`ShadowRenderer` 承担：

- 样式注入。
- 内容 DOM 构建。
- 向量化渲染计划执行。
- placeholder 与 hydrate 节奏控制。
- render 完成后的 trace 输出。

约束：

- 修改 `ShadowRenderer` 默认视为高风险，需要同时验证滚动和分页路径。
- 不得跳过 sanitize / scope 后直接注入原始内容。

## 8. 修改约束

- 不要在 Reader UI 层写具体文件格式分支，优先收敛到 provider/adapter。
- 不要把缓存释放策略散落到多个 UI 组件中。
- 不要在模式组件内复制公共渲染管线逻辑。
- 子阅读器应保持统一契约：`provider`、初始定位参数、`readerStyles`、进度/章节回调、`jumpToSpine()`。
- `ScrollReaderView` 可以继续深度模块化；`PaginatedReaderView` 保持主组件调度加专职 hook 的轻度外移结构。
- 新增阅读统计 UI 时，展示层应从 `readingStatsService` 获取聚合结果，不直接遍历底层表实现统计逻辑。

## 9. 高风险点

- 阅读模式切换条件。
- 首屏内容装载顺序。
- 延迟段 placeholder 尺寸估算。
- Shadow DOM 样式注入顺序。
- 搜索、目录跳转、阅读位置恢复联动。
- 阅读统计刷新频率与窗口可见性判断。
