# 存储、同步与缓存治理规范

## 1. 目标

本文档约束项目里的持久化数据、同步边界与缓存生命周期。源码是真值；本文档只记录已经在当前代码中确认的结构、责任和修改风险。

## 2. Dexie / IndexedDB 主库

主库由 `src/services/storageService.ts` 中的 `ReaderDatabase` 提供，数据库名是 `EPubReaderDB`。当前最高 schema 版本为 6；下次修改 schema 必须从 v7 开始，并同步更新源码顶部的版本注释与本文档。

当前表：

- `books`：书籍元数据。
- `bookFiles`：书籍二进制文件。
- `progress`：阅读进度。
- `bookmarks`：书签与笔记。
- `highlights`：高亮。
- `translationCache`：翻译结果缓存。
- `readingStatsDaily`：按本地日期聚合的活跃阅读时长。
- `settings`：通用键值存储。

已确认迁移：

- v2：基础表结构。
- v3：为历史书籍补 `format`，默认 `epub`。
- v4：引入 `translationCache`。
- v5：为历史书籍补 `originalTitle` / `originalAuthor` / `originalDescription` / `originalCover`。
- v6：引入 `readingStatsDaily`，索引为 `id, dateKey, bookId, updatedAt`。

约束：

- Dexie schema 变更属于架构级变更，不应只改表定义，不更新迁移说明和同步边界。
- 新增持久化数据时，先判断是否具备独立查询维度、批量清理需求或独立生命周期；满足任一条件时优先建表。
- `settings` 只能承载单键配置、同步元数据、UI 组织状态或前缀型缓存键，不作为任意结构化数据的默认容器。

## 3. `db.settings` 键空间

`settings` 当前是复合键空间。新增键时必须归类，并判断是否可同步。

### 3.1 当前已确认键

配置类：

- `settings:readerSettings`：阅读器主题、排版、翻页模式、滚动惯性和 UI 外观，由 `useSettingsStore` 持久化。
- `settings:savedColors`：自定义文字色和背景色历史。
- `translateConfig`：翻译配置。API key 字段经过 `safeStorage` 加解密。

WebDAV / 同步元数据：

- `sync:webdavUrl`
- `sync:webdavPath`
- `sync:webdavUser`
- `sync:syncMode`
- `sync:restoreMode`
- `sync:replaceBeforeRestore`
- `sync:remoteEtag`
- `sync:lastSyncTime`

`webdavPass` 是历史兼容删除位。当前 `useSyncStore.loadConfig()` 会删除持久化的 `webdavPass`，密码只保留在 session 状态中。

书库组织类：

- `groups:groups`
- `groups:bookMap`
- `groups:bookOrder`
- `groups:homeOrder`
- `library:favoriteBookIds`
- `library:trashBookIds`

兼容遗留键：

- `webdavUrl`
- `webdavPath`
- `webdavUser`
- `webdavSyncMode`
- `webdavRestoreMode`
- `webdavReplaceBeforeRestore`
- `webdavRemoteEtag`
- `lastSyncTime`
- `groups`
- `groupBookMap`
- `groupBookOrder`
- `homeOrder`
- `favoriteBookIds`
- `trashBookIds`
- `shelves`
- `shelfBookMap`

缓存类：

- `vcache-{hash}`：Vitra 章节 HTML 持久缓存。
- `tcache:` 前缀当前只作为不可同步前缀保留；翻译结果缓存主路径已经是独立表 `translationCache`。

### 3.2 键空间约束

- 用户设置可以写入 `settings`，但敏感配置必须明确过滤同步。
- Blob URL、搜索索引、运行时句柄、worker 状态和 provider 实例不得写入 `settings`。
- 前缀型缓存键必须有明确前缀，并且同步过滤逻辑必须能识别。
- 新增键时要同步检查 `src/stores/syncStorePayload.ts` 的过滤策略。

## 4. WebDAV 同步边界

WebDAV 运行时状态由 `src/stores/useSyncStore.ts` 编排；payload 构建、下载应用和统计日志已经下沉到 `src/stores/syncStorePayload.ts`。

### 4.1 调度入口

自动同步由 `App` 顶层 effect 启动：

- 启动阶段：先执行 `loadPersistedSettings()`，再执行 `syncStore.loadConfig()`，随后 `autoSync('startup')`。
- 定时阶段：每 15 分钟执行 `autoSync('interval')`。
- 退出阶段：`beforeunload` 执行 `autoSync('exit')`。

同步 store 自身不自发启动定时器，调度边界在应用壳层。

### 4.2 上传 payload

`buildUploadPayload(syncMode, timestamp)` 是上传 payload 的真值入口。

`data` / `full` 模式包含：

- `books`
- `progress`
- `readingStatsDaily`
- `bookmarks`
- `highlights`
- `settings`

`files` / `full` 模式包含：

- `bookFiles`，以 base64 编码写入 payload。

同步上传不是整库裸传。`settings` 会先取 primary keys，再过滤可同步键，最后 `bulkGet()` 取实际行。

### 4.3 敏感键与不可同步前缀

`syncStorePayload.ts` 当前过滤两类 settings：

敏感键：

- `translateConfig`
- `sync:webdavUrl`
- `sync:webdavUser`
- `sync:webdavPath`
- `sync:remoteEtag`
- `sync:syncMode`
- `sync:restoreMode`
- `sync:replaceBeforeRestore`
- `sync:lastSyncTime`
- `webdavUrl`
- `webdavUser`
- `webdavPass`
- `webdavPath`
- `webdavRemoteEtag`
- `webdavSyncMode`
- `webdavRestoreMode`
- `webdavReplaceBeforeRestore`
- `lastSyncTime`

不可同步前缀：

- `vcache-`
- `tcache:`

约束：

- 凭据、远端协商状态、设备本地同步状态和本地缓存都不能进入远端备份。
- 新增敏感配置时必须更新 `SENSITIVE_SETTINGS_KEYS`。
- 新增缓存前缀时必须更新 `UNSYNCABLE_SETTINGS_KEY_PREFIXES`。

### 4.4 ETag 冲突控制

上传前先执行 `head`：

- 远端不存在时使用 `If-None-Match: *`。
- 远端存在时使用 `If-Match`。
- 本地记录的 `remoteEtag` 与远端 ETag 不一致时，拒绝覆盖并视为冲突。
- 上传成功后写回 `sync:remoteEtag` 和 `sync:lastSyncTime`。

约束：

- `sync:remoteEtag` 是同步协商元数据，不是业务数据。
- 修改同步协议时不得绕过 `head -> compare -> conditional upload`。

### 4.5 下载与恢复

`applyDownloadedPayload(payload, resolvedMode, clearFirst)` 是下载应用入口。

当前行为：

- `clearFirst` 为真且恢复数据时，会清空 `books`、`progress`、`readingStatsDaily`、`bookmarks`、`highlights`。
- `clearFirst` 为真且恢复文件时，会清空 `bookFiles`。
- `books`、`progress`、`readingStatsDaily`、`bookmarks`、`highlights`、可同步 `settings` 使用 `bulkPut()` 写回。
- `bookFiles` 先从 base64 解码，再 `bulkPut()`。
- 下载 payload 中的 settings 仍会再次执行可同步过滤，不接受远端写入敏感键。

约束：

- 恢复流程会改写 `settings` 中的可同步键，因此 settings 键空间治理直接影响恢复正确性。
- `replaceBeforeRestore` 是高风险开关，涉及本地数据清空。

### 4.6 Payload 观测

`logSyncPayloadStats()` 会输出 payload 大小和各数组条目数，覆盖 `books/progress/readingStatsDaily/bookmarks/highlights/settings/bookFiles`。这是大数据量排查入口，不是业务逻辑。

## 5. 阅读统计持久化

阅读统计由以下链路组成：

- `ReaderView` 接入 `useReadingActivityTracker()`。
- 用户键盘、滚轮、指针、触摸、进度变化会调用 `markActivity()`。
- tracker 只在页面可见且窗口聚焦、未超过 idle timeout 时累计活跃毫秒数。
- 累计达到阈值后调用 `addActiveReadingMs(bookId, pendingMs)`。
- `readingStatsService` 按本地日期写入 `readingStatsDaily`，主键为 `${dateKey}::${bookId}`。
- `loadReadingStatsRowsForSync()` 只同步保留期内的统计行，当前保留期常量是 `READING_STATS_RETENTION_DAYS = 400`。
- `ReadingStatsPanel` 读取 day / week / month 汇总，使用 `bulkGet()` 获取书籍与进度，并把表格渲染限制在前 500 行。

约束：

- 阅读统计是业务数据，应参与 `data/full` 同步。
- 阅读统计不是逐事件日志，只保存日级聚合。
- 大数据量页面只渲染有限行数，避免书库统计页面一次创建过多 DOM。

## 6. 翻译配置与翻译缓存

翻译配置主键是 `translateConfig`，存于 `db.settings`。

API key 加密字段：

- `deeplApiKey`
- `openaiApiKey`
- `geminiApiKey`
- `claudeApiKey`

加解密边界：

- renderer 调用 `safeStorageEncrypt` / `safeStorageDecrypt` / `safeStorageIsAvailable`。
- preload 通过 `contextBridge` 暴露能力。
- main 进程提供对应 IPC。

翻译结果缓存：

- 主表是 `translationCache`。
- cache key 由 provider、语言、模型、endpoint 和文本内容共同决定。
- 过期缓存会删除。
- 超上限时按 `lastAccessAt` 删除最旧项。

约束：

- `translateConfig` 不参与 WebDAV 同步。
- API key 不应明文持久化。
- 翻译结果缓存不写入 `settings`。

## 7. 缓存分层与生命周期

### 7.1 Vitra 持久缓存（L3）

`VitraBookCache` 把可缓存格式的 sections HTML 压缩后写入 `db.settings`，键前缀为 `vcache-`。

当前排除格式包括 PDF、DJVU、CBZ、CBT、CBR、CB7。

约束：

- 持久缓存只是性能优化层，命中缓存不能改变业务语义。
- `vcache-` 不参与 WebDAV 同步。
- 读取失败时必须能回退到重新解析。

### 7.2 Section LRU（L2）

`VitraSectionManager` 限制同时保留的 section 数量。淘汰时需要执行 `revokeObjectURL` 与 `section.unload()`；`destroy()` 必须释放全部已加载条目。

### 7.3 Adapter 内缓存（L1）

`VitraContentAdapter` 是章节 HTML 缓存、section manager 和资源会话的汇合点：

- `init()` 尝试从持久缓存预热 `htmlCache`。
- `extractChapterHtml()` 成功后可写入搜索索引。
- `destroy()` 释放 section manager、`htmlCache`、asset session，并异步写回持久缓存。

### 7.4 搜索索引缓存

`searchIndexCache` 是会话内内存缓存，不走 `settings`，也不走同步。书籍生命周期结束时需要保留清理路径。

### 7.5 资源会话缓存

`assetLoader` 使用 sessionKey 管理 Blob URL。`releaseAssetSession()` 是批量回收入口，provider/adapter 销毁后不应继续信任旧 URL。

## 8. 书库组织状态

当前分组主路径已经迁移到：

- `groups:groups`
- `groups:bookMap`
- `groups:bookOrder`
- `groups:homeOrder`

`groupManagerRepository.ts` 负责从 `settings` 读取和保存；`groupManagerState.ts` 负责清洗、排序、旧结构迁移。`groups` / `groupBookMap` / `groupBookOrder` / `homeOrder` 和 `shelves` / `shelfBookMap` 只是遗留兼容来源，不应继续作为新功能主路径。

书库元数据状态已经抽到 `libraryMetaRepository.ts`：

- `loadLibraryCoreMeta()` 读取进度、收藏、回收站，并通过 `uniqueKeys()` 获取有书签/高亮的书籍 ID。
- `loadLibraryAnnotationMeta()` 只在注释/高亮视图需要详情时读取全量书签和高亮。

约束：

- 不要把新分组能力写回旧 `shelves` 主路径。
- 注释详情读取应延迟到对应视图需要时执行。

## 9. 修改约束

- 不要把新的大块结构化数据继续写入 `settings`，除非它明确是单键配置。
- 不要让会话级缓存进入可同步数据。
- 不要绕过敏感键过滤与 ETag 协商。
- 不要明文持久化 API key。
- 不要把 Blob URL 创建点与释放点分离到不可追踪。
- 修改 `storageService.ts`、`syncStorePayload.ts`、`useSyncStore.ts`、`useSettingsStore.ts`、`translateService.ts`、`vitraBookCache.ts`、`assetLoader.ts` 任一文件时，都应回看本文档。

## 10. 当前测试与治理缺口

当前仍缺：

- `storageService.ts` 的表结构与升级回归。
- `syncStorePayload.ts` / `useSyncStore.ts` 的敏感键过滤、ETag 冲突、恢复覆盖策略回归。
- `useSettingsStore.ts` 的设置持久化回归。
- `translateService.ts` 的 `safeStorage` 加解密与 `translationCache` TTL 回归。
- `VitraBookCache` / `VitraSectionManager` / `assetLoader` / `searchIndexCache` 的清理链路回归。
- `settings` 键空间注册表与新增键评审规则。
