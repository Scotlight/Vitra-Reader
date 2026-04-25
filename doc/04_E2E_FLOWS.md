# 端到端流程规范

## 1. 目标

本文档描述从导入、打开、阅读、搜索、同步到销毁的关键链路。源码是真值；本文档保留当前可追溯的职责边界和高风险节点。

## 2. 导入并进入书库

1. `LibraryView` 挂载书库页面，消费 `useLibraryStore()`、`useLibraryMetaState()` 和 `useGroupManager()`。
2. 导入文件时，`useLibraryStore.importBook()` 先把文件二进制写入 `db.bookFiles`。
3. 随后执行 `detectFormat()` 与 `parseBookMetadata()`，生成 `BookMeta`。
4. 元数据写入 `db.books`，必要时调用 `loadBooks()` 刷新书库。
5. 普通入口由 `LibrarySidebar` / `BookGrid` 调用 `onOpenBook(book.id)`。
6. 标注入口由 `AnnotationList` 调用 `onOpenBook(bookId, { location, searchText })`，把跳转目标带入阅读器。

边界：

- 入库阶段真值层是 `db.bookFiles` 与 `db.books`。
- 阅读器不负责导入和元数据落库。
- 从注释/书签打开书籍时，允许携带跳转位置。

## 3. 打开一本非 PDF 书籍

1. `App.handleOpenBook()` 接收 `bookId` 和可选 `jumpTarget`，写入 `currentBookId` / `jumpTarget`，并切到 `reader` 视图。
2. `App` 渲染 `ReaderView(bookId, jumpTarget)`。
3. `ReaderView` 调用 `useReaderBookSession({ bookId, pageTurnMode })`，不再内联读取 Dexie。
4. `useReaderBookSession` 并行读取 `db.books`、`db.bookFiles`、`db.progress`。
5. `openReaderProvider()` 基于书籍格式和文件二进制调用 `VitraPipeline.open({ buffer, filename })`。
6. `VitraPipeline.open()` 嗅探格式，选择 parser，并返回 `ready / metadata / preview / cancel` handle。
7. `handle.ready` 返回 `VitraBook` 后，`VitraContentAdapter` 把它适配成 `ContentProvider`，随后执行 `provider.init()`。
8. `VitraContentAdapter.init()` 对允许缓存的格式尝试从 `VitraBookCache` 预热 `htmlCache`，并延迟构建搜索索引。
9. `resolveSessionToc()` 读取 provider TOC，空目录时从 spine 生成回退目录。
10. `resolveInitialLocation()` 把 `progress.location` 解析为 `vitra:{spineIndex}:{pageOrOffset}`、`bdise:` 或旧 href 位置。
11. `resolveScrollParams()` / `resolvePaginatedParams()` 结合 `resolveReaderRenderMode()` 生成滚动或分页初始参数。
12. `ReaderView` 持有 provider，并把会话结果下发给 `ScrollReaderView` 或 `PaginatedReaderView`。
13. 来自书库标注入口的 `jumpTarget` 由 `useReaderNavigation` 在 ready 后延迟触发 `jumpToAnnotation()`。

边界：

- 打开流程收敛在 `useReaderBookSession`。
- 非 PDF 内容通过 `VitraPipeline + VitraContentAdapter` 统一进入阅读器。
- Reader UI 最终消费 `ContentProvider`，不直接接触具体 parser。

## 4. 打开一本 PDF

1. `PdfContentProvider` 初始化 PDF 文档。
2. provider 加载 PDF.js modern runtime，必要时降级到 legacy runtime。
3. 每页作为最小内容单元。
4. 单页渲染时生成像素图层、链接层和可选文字层。
5. 页面 HTML 进入统一阅读器展示入口。

边界：

- PDF 不走普通 HTML 章节提取路径。
- PDF 页面图像 URL 必须可追踪、可释放。
- PDF 内部链接坐标转换必须与 viewport 保持一致。

## 5. 章节预处理

1. 接收章节 HTML 与外部样式。
2. 执行 HTML 消毒。
3. 提取并清洗内联样式。
4. 清洗外部样式。
5. 移除原始 style 标签。
6. 对样式加 scope。
7. 对大章节生成 `SegmentMeta`。
8. 输出清洗后的 HTML、fragment 与样式结果。

边界：

- 消毒和 scope 不能跳过。
- Worker 路径和同步 fallback 路径都必须可用。
- 大章节优化以前置预处理结果驱动，而不是渲染后的临时补丁。

## 6. 滚动模式渲染

1. `ReaderView` 判定有效模式为 `scrolled-continuous` 后挂载 `ScrollReaderView`。
2. `ScrollReaderView` 通过 `useScrollReaderRefs()` 建立 DOM、pipeline、章节、进度和虚拟段 refs。
3. `useChapterLoader()` 按需读取章节 HTML / styles，并调用 `preprocessChapterContent()`。
4. 大章节建立 `ChapterMetaVector`，优先渲染 windowed shell；小章节进入普通 `ShadowRenderer` 路径。
5. `useScrollHandler()` 处理滚动事件、预加载触发和进度防抖写回。
6. `useVirtualSegmentSync()` 负责视口范围内虚拟段 mount / release。
7. `useChapterUnloader()` 把远离当前章节的 DOM 折叠回 placeholder，并调用 `provider.unloadChapter()`。
8. `useHighlightAndSelection()` 处理选区与高亮 idle 注入。

边界：

- 视口外段应尽量避免立即物化。
- placeholder 与 hydrate 必须保证滚动位置稳定。
- 章节卸载不仅回收 DOM，还要释放媒体资源、段池和 provider 级章节资源。

## 7. 分页模式渲染

1. `ReaderView` 基于 `bookFormat + settings.pageTurnMode` 计算 `resolveReaderRenderMode()`。
2. 固定布局格式只允许 `paginated-single`；可重排格式允许单页、双页和连续滚动。
3. `PaginatedReaderView` 接收 `paginated-single | paginated-double`，决定列宽、翻页布局和测量容器。
4. 分页路径仍通过 `ShadowRenderer` 渲染完整章节供分页测量。
5. 阅读器内设置面板通过 `ReaderModeSettings` 写 `settings.updateSetting('pageTurnMode', ...)`，触发重新决策。
6. 书库设置面板也写同一设置项。
7. 分页高亮已经抽到 `usePaginatedHighlights()`，采用章节级缓存加总数失效校验。

边界：

- 分页模式不复用只适用于滚动模式的假设。
- 分页主组件当前不是重灾区，后续只做轻度外移，避免过度模块化。
- 高亮注入重点关注查询策略和缓存失效，而不是把主组件拆成大量小文件。

## 8. 搜索与跳转

1. 搜索输入位于 `ReaderLeftPanel`，通过 `useReaderNavigation.handleSearch()` 触发。
2. `handleSearchWithKeyword()` 调用当前 `provider.search(keyword)` 并写入 `searchResults`。
3. 搜索结果点击统一走 `jumpToAnnotation(res.cfi, searchQuery)`。
4. `jumpToAnnotation()` 先解析 spineIndex，再按当前模式派发到 `scrollReaderRef.jumpToSpine()` 或 `paginatedReaderRef.jumpToSpine()`。
5. 滚动模式命中章节后会强制 hydrate placeholder 段，并用 `findTextInDOM()` 二次定位文本。
6. 分页模式会把 `searchText` 暂存在 `pendingSearchTextRef`，等待章节加载完成后定位。
7. 选区菜单中的“全文搜索”通过 `handleSelectionSearch()` 交给 `openSearchPanelWithKeyword()`，再进入统一搜索链路。

边界：

- 搜索跳转应通过阅读器统一导航层，不直接操作子组件 DOM。
- provider 搜索结果是候选定位，最终仍需在当前渲染 DOM 中确认文本位置。

## 9. 阅读进度、TOC 高亮与阅读统计

### 9.1 阅读进度恢复

1. `useReaderBookSession` 打开时读取 `db.progress.get(bookId)`。
2. `resolveInitialLocation()` 解析 `vitra:` / `bdise:` / 旧 href 位置。
3. `resolveReaderRenderMode()` 决定把恢复结果写入滚动或分页初始化参数。

### 9.2 阅读进度写回

滚动模式：

- `syncViewportState()` 根据视口位置推导 active chapter 与 progress snapshot。
- `useScrollHandler()` 以防抖方式提交 progress snapshot。
- `commitProgressSnapshot()` 回调 `onProgressChange(progress)`，并写入 `db.progress`。

分页模式：

- `PaginatedReaderView` 在 `currentSpineIndex` 变化时回传章节。
- 另一个 effect 依据 `currentSpineIndex/currentPage/totalPages` 计算全书进度。
- 经过 debounce 后写入 `db.progress`，位置格式为 `vitra:{spineIndex}:{currentPage}`。

### 9.3 TOC 高亮

- `ReaderView.handleChapterChange()` 规范化 href 后写入 `currentSectionHref`。
- `readerToc.ts` 的 `isTocHrefActive()` 负责 TOC 激活判定。
- `ReaderLeftPanel` 给激活项写入样式与 `data-toc-active="true"`。
- `useAutoScrollActiveToc()` 在 TOC 面板打开时滚动到激活项附近。

### 9.4 阅读统计

1. `ReaderView` 调用 `useReadingActivityTracker({ bookId, isReady })`。
2. 键盘、滚轮、指针、触摸和阅读进度变化会调用 `markActivity()`。
3. tracker 只在页面可见、窗口聚焦且未超过 idle timeout 时累计活跃毫秒数。
4. 达到 flush 阈值后调用 `addActiveReadingMs()`。
5. `readingStatsService` 按本地日期累加到 `readingStatsDaily`。
6. `ReadingStatsPanel` 读取 day / week / month 汇总，并展示条形图或扇形图。

边界：

- 阅读统计记录的是活跃时长，不是页面停留时长。
- 统计数据是日聚合业务数据，会进入 WebDAV `data/full` 同步。

## 10. 同步、恢复与翻译配置

### 10.1 WebDAV 自动同步调度

`App` 顶层 effect 是当前调度入口：

1. 启动时先执行 `loadPersistedSettings()`。
2. 再执行 `syncStore.loadConfig()`。
3. 随后执行 `syncStore.autoSync('startup')`。
4. 每 15 分钟执行 `autoSync('interval')`。
5. `beforeunload` 执行 `autoSync('exit')`。

### 10.2 WebDAV 配置加载

`useSyncStore.loadConfig()` 从 `db.settings` 读取 `sync:` 前缀下的 WebDAV 地址、路径、用户名、同步模式、恢复模式、覆盖策略、`sync:lastSyncTime` 和 `sync:remoteEtag`，并兼容迁移旧键。

当前密码策略：

- `webdavPass` 不持久化。
- 加载配置时会删除历史遗留 `webdavPass`。
- 密码只保留在本次 session 的 store 状态中。

### 10.3 手动与自动上传

1. `useSyncStore.syncData()` 或 `autoSync('interval'/'exit')` 调用 `buildUploadPayload(syncMode, now)`。
2. payload 构建在 `src/stores/syncStorePayload.ts`。
3. `data/full` 模式包含 `books/progress/readingStatsDaily/bookmarks/highlights/settings`。
4. `files/full` 模式包含 base64 后的 `bookFiles`。
5. `settings` 先过滤敏感键和不可同步前缀。
6. 上传前通过 `head` + ETag 比较确认不会覆盖远端新版本。
7. 上传成功后写回 `sync:remoteEtag` 与 `sync:lastSyncTime`。

### 10.4 启动拉取与手动恢复

- `autoSync('startup')` 会下载远端备份，只有远端 `timestamp` 新于本地 `sync:lastSyncTime` 时才应用。
- `restoreData()` 会按 `restoreMode` 或 payload 内 `mode` 决定恢复范围。
- `applyDownloadedPayload()` 按 `replaceBeforeRestore` 决定是否先清空本地表。
- 下载 payload 中的 `settings` 会再次过滤，远端不能写入敏感 settings 键。

### 10.5 翻译配置与缓存

- `loadTranslateConfig()` 从 `db.settings['translateConfig']` 读取配置，并解密 API key。
- `saveTranslateConfig()` 合并当前配置后加密 API key，再写回 `translateConfig`。
- `translateText()` 根据 provider、语言、模型、endpoint 和文本生成 cache key。
- 命中 `translationCache` 时直接返回。
- 未命中时调用对应 provider，成功后写入 `translationCache` 并执行 TTL / `lastAccessAt` 清理。

边界：

- `translateConfig` 是敏感配置，不参加 WebDAV 同步。
- 翻译结果缓存是独立表，不混入 `settings`。

## 11. 书库元数据与统计页面

1. `useLibraryMetaState()` 初次挂载时调用 `loadLibraryCoreMeta()`。
2. 核心元数据包括进度、收藏、回收站、有书签书籍、有高亮书籍。
3. 进入 notes / highlight 视图时才调用 `loadLibraryAnnotationMeta()` 获取全量详情。
4. `ReadingStatsPanel` 只在 `activeNav === 'stats'` 时挂载。
5. 统计面板用 `loadReadingStatsSummary()` 获取聚合结果，再用 `bulkGet()` 获取书籍和进度。
6. 大数据量下，统计表格最多渲染 500 行。

边界：

- 书库首页不应无条件读取全量高亮和书签详情。
- 统计页面的图表与表格是展示层，不应成为统计真值。

## 12. 释放与销毁

1. 阅读器退出或切换文档时，`App` 切回 `library` 并清空 `currentBookId`。
2. `useReaderBookSession` cleanup 调用当前 provider 的 `destroy()`；如果异步会话在组件销毁后才返回，也会立即销毁 provider。
3. `VitraContentAdapter.destroy()` 释放 section manager、`htmlCache`、asset session，并异步写回持久缓存。
4. `VitraSectionManager.destroy()` 清理已加载资源。
5. PDF provider 销毁时释放文档对象。

边界：

- 销毁逻辑必须幂等。
- URL 释放和对象销毁必须显式执行。
- 不得把 GC 当成唯一资源清理机制。
