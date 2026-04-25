# 数据与状态模型

## 1. 目标

本文档描述阅读器的数据、缓存和运行时状态边界。源码是真值；本文档约束“状态应该放在哪里、由谁负责、哪些数据可以同步”。

## 2. 状态分层

当前项目至少包含四类状态。

### 2.1 UI 运行时状态

典型内容：

- 当前视图与当前打开书籍。
- 阅读模式、当前章节、当前页或当前滚动位置。
- 左侧面板、设置面板、搜索关键词、搜索结果。
- 章节渲染状态、首屏状态、延迟水合进度。

当前真值层：

- `App`：`library / reader` 视图切换、`currentBookId`、`jumpTarget`。
- `ReaderView`：公共阅读 UI 状态、模式决策、当前章节 href、搜索状态。
- `ScrollReaderView` / `PaginatedReaderView`：模式内当前位置、章节挂载和瞬时渲染状态。
- `useSettingsStore`：阅读主题、排版、翻页模式、滚动惯性和 UI 外观。

约束：

- UI 运行时状态可以消费 provider 输出，但不应由 parser/provider 反向持有。
- 模式组件可以持有瞬时渲染状态，但阅读位置持久化仍通过 `db.progress`。

### 2.2 用户设置状态

`useSettingsStore` 已经不是纯会话态。当前实现会把以下内容写入 `db.settings`：

- `settings:readerSettings`：`ReaderSettings` 中的主题、排版、翻页、滚动和 UI 外观字段。
- `settings:savedColors`：文字色与背景色历史。

启动时，`App` 先调用 `loadPersistedSettings()`，再加载 WebDAV 配置并触发启动同步。

约束：

- 新增阅读设置字段时，必须加入 `DEFAULT_SETTINGS`，并确认 `loadPersistedSettings()` 能恢复。
- 设置持久化是用户配置，不应写到 parser/provider。
- 需要参与 WebDAV 同步的设置键必须经过 `syncStorePayload.ts` 的过滤审查。

### 2.3 内容提供状态

由 `ContentProvider` 或其实现维护，例如：

- 文档是否已初始化。
- 目录与 spine 信息。
- 章节 HTML、章节样式和资源访问能力。
- 搜索能力与索引状态。
- 章节 unload 能力与资源会话状态。

约束：

- Provider 负责源文档到可渲染内容的转换。
- Provider 不承担 Reader UI 的展示状态。
- Provider 销毁必须释放资源会话和内部缓存。

### 2.4 渲染管线状态

由 Vitra 渲染链路维护，例如：

- preprocess 结果。
- HTML fragment 列表。
- `SegmentMeta` / `ChapterMetaVector`。
- 五阶段 trace 与 timing。
- 已水合段、占位段、活跃段集合。

约束：

- 渲染管线中间产物通常短于持久数据生命周期。
- 阶段结果应有明确前后依赖，不能跨层任意复用。

### 2.5 缓存与持久化状态

典型内容：

- PDF 页面 HTML 与图像 URL 缓存。
- Vitra section LRU。
- scope CSS 缓存。
- VitraBookCache 持久章节缓存。
- 翻译结果缓存。
- 阅读统计日聚合。

约束：

- 缓存不是业务真值，只是性能优化层。
- 命中缓存不应改变功能语义。
- Blob URL 和 provider 资源必须有显式释放路径。

## 3. Dexie 持久化模型

主库是 `ReaderDatabase`，当前最高 schema 版本为 6。

表结构：

- `books`：书籍元数据。
- `bookFiles`：书籍二进制。
- `progress`：阅读进度。
- `bookmarks`：书签与笔记。
- `highlights`：高亮。
- `translationCache`：翻译结果缓存。
- `readingStatsDaily`：阅读统计日聚合。
- `settings`：通用键值。

迁移摘要：

- v3：补 `books.format`。
- v4：引入 `translationCache`。
- v5：补原始元数据字段。
- v6：引入 `readingStatsDaily`。

更完整的存储和同步治理见 `doc/06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md`。

## 4. `db.settings` 当前角色

`db.settings` 是复合键空间，当前至少承载：

- 阅读设置：`settings:readerSettings`、`settings:savedColors`。
- 翻译配置：`translateConfig`。
- WebDAV 配置与同步元数据。
- 书库组织：`groups:groups`、`groups:bookMap`、`groups:bookOrder`、`groups:homeOrder`。
- 旧书架兼容：`shelves`、`shelfBookMap`。
- 收藏与回收站：`library:favoriteBookIds`、`library:trashBookIds`。
- Vitra 持久缓存：`vcache-*`。

约束：

- `settings` 不是任意数据容器。
- 缓存前缀、同步过滤、敏感键列表必须共同维护。
- Blob URL、搜索索引、运行时句柄不得进入 `settings`。

## 5. 阅读位置真值

阅读位置的持久化读写点：

- `useReaderBookSession.loadStoredReaderData()` 打开书籍时读取 `db.progress`。
- `resolveInitialLocation()` 把 `vitra:` / `bdise:` / 旧 href 位置转为初始渲染参数。
- 滚动模式通过 `commitProgressSnapshot()` 写回 `db.progress`。
- 分页模式按 `currentSpineIndex/currentPage/totalPages` 计算进度并写回 `db.progress`。

当前位置格式：

- 滚动模式：`vitra:{spineIndex}:{scrollTop}`。
- 分页模式：`vitra:{spineIndex}:{currentPage}`。

结论：

- `db.progress` 是阅读位置持久化真值。
- `useReaderBookSession` 是恢复入口。
- 具体模式组件负责写回。

## 6. 阅读统计模型

阅读统计由 `readingStatsDaily` 表保存，主键是 `${dateKey}::${bookId}`。

当前链路：

- `ReaderView` 接入 `useReadingActivityTracker()`。
- 用户输入、滚动、指针、触摸和进度变化会刷新活跃时间。
- tracker 只在页面可见且窗口聚焦时累计。
- `addActiveReadingMs()` 按本地日期累加 `activeMs`。
- `loadReadingStatsSummary()` 提供 day / week / month 汇总。
- `ReadingStatsPanel` 展示统计，表格最多渲染 500 行。
- `loadReadingStatsRowsForSync()` 为 WebDAV 同步提供保留期内数据。

约束：

- 阅读统计是业务数据，应参与 `data/full` 同步。
- 阅读统计不是逐事件日志，不应用于还原用户每一次交互。

## 7. 书库元数据与分组状态

书库元数据状态已经从 `LibraryView` 拆到 `useLibraryMetaState()` 与 `libraryMetaRepository.ts`：

- `loadLibraryCoreMeta()` 读取进度、收藏、回收站，并用 `uniqueKeys()` 获取有书签/高亮的书籍 ID。
- `loadLibraryAnnotationMeta()` 只在注释/高亮视图需要详情时读取全量书签和高亮。

分组状态由 `useGroupManager()` 编排，仓储层是 `groupManagerRepository.ts`，纯状态处理在 `groupManagerState.ts`：

- 主键：`groups:groups`、`groups:bookMap`、`groups:bookOrder`、`groups:homeOrder`。
- 遗留兼容键：`groups`、`groupBookMap`、`groupBookOrder`、`homeOrder`、`shelves`、`shelfBookMap`。
- 状态保存使用字段级比较和清洗逻辑，不再依赖整块 `JSON.stringify` 判断。

约束：

- 新功能应写入 group 主路径，不应继续扩展 shelf 旧路径。
- 注释详情读取需要延迟到对应视图，避免书库首页无条件读取全量注释。

## 8. 翻译配置与翻译结果缓存

翻译链路拆成两类持久化状态：

- `translateConfig`：配置，存于 `db.settings`，API key 字段经过 `safeStorage` 加解密。
- `translationCache`：结果缓存，存于独立表，带 TTL 和 `lastAccessAt` 清理。

约束：

- `translateConfig` 属于敏感键，不参与 WebDAV 同步。
- 翻译结果缓存不写入 `settings`。

## 9. 当前缓存真值

- PDF provider 内缓存：页面 HTML、页面图像 URL、PDF runtime 状态。
- `VitraSectionManager`：section 级 LRU，淘汰时释放 URL 并调用 `section.unload()`。
- `scopeCssCache`：CSS 作用域处理结果缓存。
- `VitraBookCache`：可缓存格式的章节 HTML 持久缓存，键前缀 `vcache-`。
- `searchIndexCache`：会话级搜索索引，不进入 `settings`。
- `assetLoader`：sessionKey 级 Blob URL 管理。

## 10. 当前缺口

后续仍需补齐：

- `useSettingsStore` 持久化的自动化回归。
- 搜索索引清理时机与书籍生命周期的完整说明。
- `settings` 键空间注册表与新增键评审规则。
- 真库驱动的打开、同步、恢复端到端测试。
