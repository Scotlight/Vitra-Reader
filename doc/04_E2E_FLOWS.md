# 端到端流程规范

## 1. 目标

本文档描述从“打开一本书”到“完成阅读展示”的关键链路，用于帮助接手者快速定位入口、边界与高风险节点。

## 1.5 流程 0：导入并进入书库

1. 书库页面由 `LibraryView` 挂载，并消费 `useLibraryStore()`：`src/components/Library/LibraryView.tsx:21-22`
2. 导入时由 `useLibraryStore.importBook()` 先把文件二进制写入 `db.bookFiles`：`src/stores/useLibraryStore.ts:35-46`
3. 再执行 `detectFormat()` 与 `parseBookMetadata()` 提取元数据，生成 `BookMeta`：`src/stores/useLibraryStore.ts:48-95`
4. 最终把元数据写入 `db.books`，并按需调用 `loadBooks()` 刷新书库：`src/stores/useLibraryStore.ts:96-100`
5. `LibraryView` 把 `onOpenBook` 继续下传给 `LibrarySidebar`、`AnnotationList`、`BookGrid`：`src/components/Library/LibraryView.tsx:392-399,506-523`
6. 普通书籍入口由 `LibrarySidebar` / `BookGrid` 直接调用 `onOpenBook(book.id)`：`src/components/Library/LibrarySidebar.tsx:110`, `src/components/Library/BookGrid.tsx:120`
7. 标注入口由 `AnnotationList` 调用 `onOpenBook(bookId, { location, searchText })`，把跳转位置信息带入阅读器：`src/components/Library/AnnotationList.tsx:35-56`

边界：

- 入库阶段的真值层是 `db.bookFiles` 与 `db.books`
- 阅读器不负责导入和元数据落库
- 从注释/书签打开书籍时，允许带跳转参数进入阅读器

## 2. 流程 A：打开一本非 PDF 书籍

### 2.1 高层步骤

1. `App.handleOpenBook()` 接收 `bookId` 与可选 `jumpTarget`，写入 `currentBookId`、`jumpTarget`，再把 `currentView` 切到 `reader`：`src/App.tsx:17-21`
2. `App` 在 `currentView === 'reader'` 时渲染 `ReaderView(bookId, jumpTarget)`：`src/App.tsx:80-83`
3. `ReaderView.loadBook()` 并行读取 `db.books`、`db.bookFiles`、`db.progress`：`src/components/Reader/ReaderView.tsx:257-267`
4. 从 `bookMeta.format` 与 `file.data` 组装 `VitraPipeline.open({ buffer, filename })` 请求：`src/components/Reader/ReaderView.tsx:283-294`
5. `VitraPipeline.open()` 先按格式选择 parser，再返回包含 `ready` 的 handle：`src/engine/pipeline/vitraPipeline.ts:61-73`
6. `ReaderView` 等待 `handle.ready` 拿到 `vitraBook`：`src/components/Reader/ReaderView.tsx:295`
7. `ReaderView` 用 `new VitraContentAdapter(vitraBook, bookId, bookData)` 把 `VitraBook` 适配成 `ContentProvider`，再执行 `cp.init()`：`src/components/Reader/ReaderView.tsx:297-298`
8. `VitraContentAdapter.init()` 会在允许缓存的格式上尝试从 `VitraBookCache` 预热 `htmlCache`，并延迟构建搜索索引：`src/engine/pipeline/vitraContentAdapter.ts:60-78`
9. `ReaderView` 把 provider 写入 `providerRef.current` 与本地状态：`src/components/Reader/ReaderView.tsx:304-306`
10. 随后读取 TOC，必要时从 spine 回退生成：`src/components/Reader/ReaderView.tsx:308-314`
11. 再解析 `progress.location` 为 `vitra:{spineIndex}:{pageOrOffset}` 或通过 `getSpineIndexByHref()` 回退定位：`src/components/Reader/ReaderView.tsx:316-329`
12. 最终通过 `resolveReaderRenderMode()` 决定滚动或分页的初始参数，并置 `isReady = true`：`src/components/Reader/ReaderView.tsx:332-340`
13. 若这次打开来自书库标注入口，`jumpTarget` 会在阅读器 ready 后触发 `jumpToAnnotation()`：`src/components/Reader/ReaderView.tsx:412-421`
14. 对 provider 兼容格式，`handle.ready` 背后实际是 `VitraProviderBackedParser.parse()`：它会并行执行 `createContentProvider()` 与 `parseBookMetadata()`，随后 `provider.init()`，再基于 spine / toc 构造 `VitraBook`：`src/engine/parsers/vitraProviderParsers.ts:74-100`
15. `createSections()` 会把 `provider.extractChapterHtml()` / `extractChapterStyles()` / `unloadChapter()` 桥接成 `VitraBookSection` 生命周期：`src/engine/parsers/vitraProviderParsers.ts:222-275`
16. `createBookObject()` 会把 `resolveHref()` / `releaseAssetSession()` / `search()` / `destroy()` 注入 `VitraBook`：`src/engine/parsers/vitraProviderParsers.ts:289-327`

### 2.2 关键边界

- `App` 只负责视图切换，不负责阅读器内部恢复逻辑：`src/App.tsx:17-25`
- 打开流程统一收敛在 `ReaderView.loadBook()`，而不是散落到模式组件中：`src/components/Reader/ReaderView.tsx:257-357`
- 非 PDF 内容通过 `VitraPipeline + VitraContentAdapter` 统一进入阅读器
- 章节 HTML 进入渲染前应完成消毒与样式隔离
- 阅读位置恢复入口当前统一收敛在 `db.progress -> ReaderView.loadBook()`，而不是子阅读器自行读库：`src/components/Reader/ReaderView.tsx:262-280,316-338`

## 3. 流程 B：打开一本 PDF

### 3.1 高层步骤

1. 使用 `PdfContentProvider` 初始化 PDF 文档
2. provider 加载 PDF.js runtime，必要时 fallback 到 legacy
3. 每页作为最小内容单元处理
4. 单页渲染时并行执行：像素渲染、链接提取、可选文字层
5. 合成为页面 HTML
6. Reader UI 以统一入口展示 PDF 页面内容

### 3.2 关键边界

- PDF 不走普通 HTML 章节提取路径
- 页面渲染缓存与 Blob URL 生命周期必须可控
- PDF 内部链接坐标转换必须与 viewport 保持一致

## 4. 流程 C：章节预处理

### 4.1 高层步骤

1. 接收章节 HTML 与外部样式
2. HTML 消毒
3. 提取并清洗内联样式
4. 清洗外部样式
5. 移除原始 style 标签
6. 对样式加 scope
7. 对大章节生成 segment metas
8. 输出清洗后的 HTML、fragment 与样式结果

### 4.2 关键边界

- 消毒在 render 之前完成
- scope 是隔离策略，不可跳过
- 大章节优化应以前置预处理结果驱动，而不是后置补丁

## 5. 流程 D：滚动模式渲染

### 5.1 高层步骤

1. Reader 进入滚动模式
2. `ShadowRenderer` 根据章节大小和模式评估是否启用向量化
3. render 阶段构造容器与内容节点
4. 对首批段立即 materialize
5. 对延迟段使用 placeholder
6. hydrate 阶段按策略逐步加载剩余段

### 5.2 关键边界

- 视口外段应尽量避免立即物化
- 延迟水合必须保证视觉连续性与滚动稳定性
- Worker 向量化路径与主线程 fallback 路径都需可运行

## 6. 流程 E：分页模式渲染

分页模式与滚动模式共享部分前置处理，但最终布局和翻页行为不同。

已确认链路：

1. `ReaderView` 每次 render 都会基于 `bookFormat + settings.pageTurnMode` 计算 `modeDecision` 与 `effectivePageTurnMode`：`src/components/Reader/ReaderView.tsx:134-137`
2. 打开书籍时 `loadBook()` 也会再次调用 `resolveReaderRenderMode()`，把恢复位置写入滚动或分页初始化参数：`src/components/Reader/ReaderView.tsx:332-338`
3. 当 `effectivePageTurnMode === 'scrolled-continuous'` 时挂载 `ScrollReaderView`；否则挂载 `PaginatedReaderView`：`src/components/Reader/ReaderView.tsx:832-889`
4. `PaginatedReaderView` 接收 `pageTurnMode` 为 `paginated-single | paginated-double`，再决定列宽与翻页布局：`src/components/Reader/ReaderView.tsx:864-873`, `src/components/Reader/PaginatedReaderView.tsx:701-704`
5. 阅读器内设置面板的三枚模式按钮会直接写 `settings.updateSetting('pageTurnMode', ...)`，从而触发 `ReaderView` 重新决策和重挂载子阅读器：`src/components/Reader/ReaderView.tsx:1214-1230`
6. 书库主设置面板也可修改同一设置项：`src/components/Library/SettingsPanel.tsx:323-332`
7. 模式约束真值由 `resolveReaderRenderMode()` 定义：固定布局格式只允许 `paginated-single`，可重排格式允许 `paginated-single` / `paginated-double` / `scrolled-continuous`：`src/engine/core/readerRenderMode.ts:9-19,25-59`

约束：

- 不得复用只适用于滚动模式的假设
- 分页模式修改需重点关注内容切片、定位与首屏体验
- 共用阶段的修改不能破坏分页模式输出

## 7. 流程 F：搜索

当前统一接口包含 `search(keyword)` 能力。

已确认链路：

1. 搜索输入框在 `ReaderView` 左侧面板内，通过 Enter 或按钮触发 `handleSearch()`：`src/components/Reader/ReaderView.tsx:694-705`
2. `handleSearch()` 继续调用 `handleSearchWithKeyword(searchQuery)`：`src/components/Reader/ReaderView.tsx:450-466`
3. `handleSearchWithKeyword()` 通过当前 `provider.search(keyword)` 拉取结果并写入 `searchResults`：`src/components/Reader/ReaderView.tsx:450-461`
4. 搜索结果点击后统一走 `jumpToAnnotation(res.cfi, searchQuery)`，而不是直接操作子阅读器：`src/components/Reader/ReaderView.tsx:708-720`
5. `jumpToAnnotation()` 会先把 location 解析为 spineIndex，再按当前模式派发到 `scrollReaderRef.jumpToSpine()` 或 `paginatedReaderRef.jumpToSpine()`：`src/components/Reader/ReaderView.tsx:388-409`
6. 滚动模式 `jumpToSpine()` 会在命中章节后强制 hydrate placeholder 段，并用 `findTextInDOM()` 二次滚动到 `searchText`：`src/components/Reader/ScrollReaderView.tsx:1077-1145`
7. 分页模式 `jumpToSpine()` 会把 `searchText` 暂存到 `pendingSearchTextRef`，等待章节加载完成后定位具体文本：`src/components/Reader/PaginatedReaderView.tsx:661-668,327-331`
8. 选区菜单里的“全文搜索”不会直接调用 provider，而是通过 `onSelectionSearch` 回传给 `ReaderView`，由后者切到 search tab 并执行 `handleSearchWithKeyword()`：`src/hooks/useSelectionMenu.tsx:107-112`, `src/components/Reader/ReaderView.tsx:854-860,881-886`

## 7.5 流程 F2：阅读进度写回、恢复与 TOC 高亮

### 7.5.1 恢复入口

1. `ReaderView.loadBook()` 打开时并行读取 `db.progress.get(bookId)`：`src/components/Reader/ReaderView.tsx:262-267`
2. 读取到的 `progress.location` 会被解析为 `vitra:{spineIndex}:{pageOrOffset}`；旧格式则回退走 `getSpineIndexByHref()`：`src/components/Reader/ReaderView.tsx:277-280,316-329`
3. 随后 `resolveReaderRenderMode()` 决定把恢复结果写入滚动或分页初始化参数：`src/components/Reader/ReaderView.tsx:332-338`

### 7.5.2 滚动模式写回

1. `ScrollReaderView.updateCurrentChapter()` 根据视口探针线判断当前章节，并通过 `onChapterChange(id, href)` 回传：`src/components/Reader/ScrollReaderView.tsx:987-1018`
2. `ScrollReaderView.updateProgress()` 根据视口中线计算章节内相对进度与全书进度：`src/components/Reader/ScrollReaderView.tsx:1022-1061`
3. 之后同步回调 `onProgressChange(progress)`，并把 `location/currentChapter/percentage/updatedAt` 写入 `db.progress`：`src/components/Reader/ScrollReaderView.tsx:1061-1070`

### 7.5.3 分页模式写回

1. `PaginatedReaderView` 在 `currentSpineIndex` 变化后通过 `onChapterChange(id, href)` 回传当前章节：`src/components/Reader/PaginatedReaderView.tsx:558-563`
2. 另一个 effect 根据 `currentSpineIndex/currentPage/totalPages` 计算全书进度：`src/components/Reader/PaginatedReaderView.tsx:565-572`
3. 经过 500ms debounce 后，把 `vitra:{spineIndex}:{currentPage}` 形式的位置写入 `db.progress`：`src/components/Reader/PaginatedReaderView.tsx:574-589`

### 7.5.4 ReaderView 内部同步与 TOC 高亮

1. `ReaderView` 通过 `onProgressChange` 更新 `currentProgress`，用于页脚百分比显示：`src/components/Reader/ReaderView.tsx:227-229,847-850,874-877,605`
2. `ReaderView` 通过 `onChapterChange` 更新 `currentSectionHref`：`src/components/Reader/ReaderView.tsx:851-853,878-880`
3. `isTocItemActive()` 会把 TOC href 与 `currentSectionHref` 规范化后比较，并支持只比较尾段文件名：`src/components/Reader/ReaderView.tsx:204-214`
4. `renderTocItems()` 基于 `isTocItemActive()` 给当前条目打上 `styles.tocItemActive` 与 `data-toc-active="true"`：`src/components/Reader/ReaderView.tsx:543-560`
5. 当 TOC 面板打开且当前章节变化时，effect 会自动滚动目录列表，让激活项保持在可视区中部：`src/components/Reader/ReaderView.tsx:577-599`
6. 页脚显示的 `currentChapterLabel` 则通过 `findCurrentChapterLabel(toc)` 从当前高亮 TOC 树反推：`src/components/Reader/ReaderView.tsx:216-225,601-605`

## 8. 流程 G：同步、恢复与翻译配置

### 8.0 调度入口

WebDAV 自动同步的当前调度入口已确认在 `App` 顶层 effect：`src/App.tsx:34-62`

已确认行为：

- 启动时先 `syncStore.loadConfig()`：`src/App.tsx:38-40`
- 随后立即触发 `syncStore.autoSync('startup')`：`src/App.tsx:42`
- 再注册 15 分钟定时 `syncStore.autoSync('interval')`：`src/App.tsx:44-46`
- 在 `beforeunload` 时触发 `syncStore.autoSync('exit')`：`src/App.tsx:51-55`

边界：

- 自动同步调度当前位于应用壳层 `App`，不在 `useSyncStore` 内自发启动。
- 若后续迁移调度位置，必须同步更新本文档与 `doc/06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md`。

### 8.1 流程 G1：加载 WebDAV 配置

1. `useSyncStore.loadConfig()` 从 `db.settings` 读取 `webdavUrl`、`webdavPath`、`webdavUser`、`webdavSyncMode`、`webdavRestoreMode`、`webdavReplaceBeforeRestore`、`lastSyncTime`、`webdavRemoteEtag`：`src/stores/useSyncStore.ts:378-400`
2. 同时删除历史遗留的 `webdavPass` 持久化值：`src/stores/useSyncStore.ts:388-395`
3. 最终把密码恢复为空字符串，仅保留 session 内输入：`src/stores/useSyncStore.ts:391-400`

边界：

- WebDAV 密码不是持久化真值，而是 session-only 状态。
- `webdavRemoteEtag` 与 `lastSyncTime` 属于同步协商元数据，不属于业务数据。

### 8.2 流程 G2：测试连接

1. `useSyncStore.testConnection()` 先校验地址、用户名、密码是否齐全：`src/stores/useSyncStore.ts:404-409`
2. 再通过 preload 暴露的 `webdavSync('test', ...)` 走主进程能力测试目标目录：`src/stores/useSyncStore.ts:413-420`, `electron/preload.ts:13`
3. 成功后仅更新状态提示，不写入业务表：`src/stores/useSyncStore.ts:421-425`

边界：

- 测试连接是联通性检查，不是同步动作。
- renderer 不直接发网络请求，而是通过 Electron 暴露能力执行。

### 8.3 流程 G3：手动同步上传

1. `useSyncStore.syncData()` 读取当前配置与 `remoteEtag`：`src/stores/useSyncStore.ts:429-430`
2. 通过 `buildUploadPayload(syncMode, now)` 收集本地数据：`src/stores/useSyncStore.ts:439-444`
3. `buildUploadPayload()` 在 `data/full` 模式下读取 `books/progress/bookmarks/highlights/settings`，并过滤敏感 settings 键：`src/stores/useSyncStore.ts:130-149`
4. 在 `files/full` 模式下把 `bookFiles` 编码为 base64：`src/stores/useSyncStore.ts:151-160`
5. `checkEtagAndUpload()` 先 `head`，再按远端状态决定 `If-Match` 或 `If-None-Match`：`src/stores/useSyncStore.ts:166-212`
6. 上传成功后回写 `webdavRemoteEtag` 与 `lastSyncTime`：`src/stores/useSyncStore.ts:453-458`

边界：

- 同步上传不是全库裸传，而是受 `syncMode` 与敏感键过滤共同约束。
- ETag 冲突属于主流程，不是异常补丁逻辑。

### 8.4 流程 G4：自动同步

1. `autoSync(reason)` 支持 `startup` / `interval` / `exit` 三种触发原因：`src/stores/useSyncStore.ts:279,297-360`
2. `startup` 时优先下载远端备份，若 `payload.timestamp` 新于本地 `lastSyncTime`，则应用下载内容：`src/stores/useSyncStore.ts:305-335`
3. `interval` / `exit` 时执行上传链路：`src/stores/useSyncStore.ts:339-360`
4. 若检测到远端更新冲突，则自动跳过覆盖：`src/stores/useSyncStore.ts:344-348`

边界：

- 启动自动同步是“拉新优先”，不是无条件本地覆盖云端。
- 定时/退出自动同步是“避免覆盖优先”，检测冲突后应停而不是强推。

### 8.5 流程 G5：恢复远端备份

1. `restoreData()` 下载 WebDAV 备份：`src/stores/useSyncStore.ts:469-483`
2. 解析 JSON 后，根据 `restoreMode` 或备份内 `payload.mode` 决定恢复模式：`src/stores/useSyncStore.ts:490-495`
3. `applyDownloadedPayload()` 按 `replaceBeforeRestore` 决定是否先清空本地表：`src/stores/useSyncStore.ts:214-235,470,495`
4. 再把 `books/progress/bookmarks/highlights/settings/bookFiles` 批量写回本地：`src/stores/useSyncStore.ts:237-257`
5. 恢复完成后回写 `webdavSyncMode` 与最新 `etag` 状态：`src/stores/useSyncStore.ts:485-498`

边界：

- 恢复动作会直接改写 `settings`，因此 `db.settings` 键空间治理会直接影响恢复正确性。
- `replaceBeforeRestore` 是高风险开关，影响本地数据是否先被清空。

### 8.6 流程 G6：翻译配置读写

1. `loadTranslateConfig()` 从 `db.settings['translateConfig']` 读取配置：`src/services/translateService.ts:161-167`
2. 读取后对 API key 字段做 `safeStorageDecrypt`：`src/services/translateService.ts:20-31,161-166`
3. `saveTranslateConfig()` 在保存前先合并当前配置，再做 `safeStorageEncrypt`：`src/services/translateService.ts:7-18,169-174`
4. 最终写回 `db.settings['translateConfig']`：`src/services/translateService.ts:173`

边界：

- 翻译配置持久化，但 API key 不应以明文形式落库。
- 翻译配置被视为敏感 settings 键，不参加 WebDAV 远端同步：`src/stores/useSyncStore.ts:64-66,148`

### 8.7 流程 G7：翻译执行与缓存命中

1. `translateText()` 先 trim 输入并加载翻译配置：`src/services/translateService.ts:570-586`
2. 根据 provider、语言、模型、endpoint 和文本内容构造 cache key：`src/services/translateService.ts:177-195,587`
3. 若启用缓存，先查 `translationCache`：`src/services/translateService.ts:197-205,588-597`
4. 未命中时调用对应 provider：`src/services/translateService.ts:603-653`
5. 成功后把结果写入 `translationCache`，并执行 TTL / `lastAccessAt` 清理：`src/services/translateService.ts:221-235,665-667`
6. 阅读器选区菜单的“翻译”动作由 `useSelectionMenu.handleTranslate()` 触发，随后进入 `runTranslate()`：`src/hooks/useSelectionMenu.tsx:170-175,132-168`
7. `runTranslate()` 直接调用 `translateText(sourceText)`，并把结果写入 `TranslationDialog` 状态：`src/hooks/useSelectionMenu.tsx:141-160,200-209`
8. `ScrollReaderView` / `PaginatedReaderView` 都通过 `useSelectionMenu()` 复用这条翻译入口：`src/components/Reader/ScrollReaderView.tsx:204-214`, `src/components/Reader/PaginatedReaderView.tsx:71-75`
9. 书库主设置面板中的“测试翻译”也会直接调用 `translateText('Hello world', translateConfig)`，用于配置校验：`src/components/Library/SettingsPanel.tsx:60-75`

边界：

- 翻译结果缓存是独立表，不应混入 `settings`。
- 翻译缓存只影响性能，不应改变翻译配置本身。

## 9. 流程 H：释放与销毁

### 9.1 高层步骤

1. 阅读器退出或切换文档：`src/components/Reader/ReaderView.tsx:345-354`
2. `ReaderView` 调用当前 provider `destroy()`：`src/components/Reader/ReaderView.tsx:352-353`
3. `VitraContentAdapter.destroy()` 释放 `sectionManager`、`htmlCache`、asset session，并异步写回持久缓存：`src/engine/pipeline/vitraContentAdapter.ts:84-95`
4. `VitraSectionManager.destroy()` 清理已加载资源：`src/engine/cache/vitraSectionManager.ts:98-99`
5. PDF provider 销毁时释放文档对象：`src/engine/parsers/providers/pdfProvider.ts:160-162`

### 9.2 关键边界

- 销毁逻辑必须幂等
- URL 释放和对象销毁必须显式执行
- 不得依赖 GC 作为唯一资源清理机制
- 如果是 PDF 路径，还需额外关注 provider 内页面缓存与文档对象的释放

## 10. 当前仍待补齐的精确调用链

要把本文档继续升级为更细的函数级规范，当前剩余重点是：

- 翻译配置 UI 保存链与 `saveTranslateConfig()` 的双向映射细节
- Reader 设置面板里主题/字号/排版项的持久化写回链
- 搜索索引构建、清理与书籍销毁之间的完整生命周期链
