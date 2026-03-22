# 存储、同步与缓存治理规范

## 1. 目标

本文档用于明确本项目“哪些数据落在哪里、哪些键可以同步、哪些缓存只是优化层、哪些资源必须显式释放”。源码是真值；本文档负责约束边界、所有权与修改风险。

## 2. 核心存储真值

### 2.1 Dexie / IndexedDB 主库

当前持久化主库由 `ReaderDatabase` 提供：`src/services/storageService.ts:69-128`

数据库名：

- `EPubReaderDB`：`src/services/storageService.ts:78-80`

当前已确认表：

- `books`：书籍元数据：`src/services/storageService.ts:70,80-82,88-90,100-102,109-111`
- `bookFiles`：书籍二进制文件：`src/services/storageService.ts:71,82,90,102,111`
- `progress`：阅读进度：`src/services/storageService.ts:72,83,91,103,112`
- `bookmarks`：书签/笔记：`src/services/storageService.ts:73,84,92,104,113`
- `highlights`：高亮：`src/services/storageService.ts:74,85,93,105,114`
- `translationCache`：翻译结果缓存：`src/services/storageService.ts:75,106,115`
- `settings`：通用键值存储：`src/services/storageService.ts:76,86,94,107,116`

### 2.2 版本迁移真值

当前数据库版本已经到 5：`src/services/storageService.ts:80-124`

已确认迁移：

- v2：基础表结构：`src/services/storageService.ts:80-87`
- v3：为历史书籍补 `format` 字段：`src/services/storageService.ts:88-99`
- v4：引入 `translationCache` 表：`src/services/storageService.ts:100-108`
- v5：为历史书籍补 `originalTitle` / `originalAuthor` / `originalDescription` / `originalCover`：`src/services/storageService.ts:109-124`

约束：

- Dexie 版本迁移属于架构级变更，不应只改表定义不补迁移说明。
- 新增持久化数据时，必须先判断应放独立表，还是放进 `settings`。
- 如果数据具备独立查询维度、批量清理需求或生命周期独立，优先建表，不要继续把 `settings` 当杂项桶。

## 3. `db.settings` 键空间治理

### 3.1 当前事实

`settings` 目前是项目中的复合键空间，既承载用户配置，也承载缓存键，还承载书库辅助状态：`src/services/storageService.ts:76,86,94,107,116`

当前已确认写入来源包括：

- Vitra 持久缓存键 `vcache-*`：`src/engine/cache/vitraBookCache.ts:20,136-174,188-195`
- 翻译配置 `translateConfig`：`src/services/translateService.ts:78,161-174`
- WebDAV 配置与同步元数据：`src/stores/useSyncStore.ts:64-69,326,335,352,360,369-375,379-389,454,458,487,497`
- 书架与书架映射：`src/hooks/useShelfManager.ts:45-48,125,159-166`
- 收藏/回收站书籍集合：`src/components/Library/LibraryView.tsx:139-154,290-297`

### 3.2 当前已确认键空间

#### A. 缓存类

- `vcache-{hash}`：Vitra 章节 HTML gzip 持久缓存：`src/engine/cache/vitraBookCache.ts:20,56-58,132-174,188-195`

#### B. 翻译配置类

- `translateConfig`：翻译配置对象：`src/services/translateService.ts:78,161-174`

#### C. WebDAV / 同步配置类

- `webdavUrl`：`src/stores/useSyncStore.ts:369,379`
- `webdavPath`：`src/stores/useSyncStore.ts:370,380`
- `webdavUser`：`src/stores/useSyncStore.ts:371,381`
- `webdavPass`：历史兼容删除位，不再持久化：`src/stores/useSyncStore.ts:372,389`
- `webdavSyncMode`：`src/stores/useSyncStore.ts:373,382,497`
- `webdavRestoreMode`：`src/stores/useSyncStore.ts:374,383`
- `webdavReplaceBeforeRestore`：`src/stores/useSyncStore.ts:375,384`
- `webdavRemoteEtag`：`src/stores/useSyncStore.ts:326,352,386,454,487`
- `lastSyncTime`：`src/stores/useSyncStore.ts:335,360,385,458`

#### D. 书库组织类

- `shelves`：`src/hooks/useShelfManager.ts:45-63,159-161`
- `shelfBookMap`：`src/hooks/useShelfManager.ts:45-74,125,164-166`
- `favoriteBookIds`：`src/components/Library/LibraryView.tsx:141-152,290-292`
- `trashBookIds`：`src/components/Library/LibraryView.tsx:142-154,295-297`

### 3.3 键空间约束

- `settings` 中的键必须按“配置 / 同步元数据 / UI 组织 / 缓存”分类理解，不能再把不同生命周期的数据混成一个概念。
- 所有前缀型缓存键都应采用可识别命名；当前已确认前缀只有 `vcache-`：`src/engine/cache/vitraBookCache.ts:20,191-194`
- 需要跨会话恢复的用户配置，才能进入 `settings`。
- 会话级临时密钥、运行时句柄、Blob URL、搜索索引不得写入 `settings`。

## 4. WebDAV 同步边界

### 4.1 Store 状态与触发入口

WebDAV 同步状态由 `useSyncStore` 承担：`src/stores/useSyncStore.ts:260-280,282-295`

已确认三类自动触发原因：

- `startup`
- `interval`
- `exit`

来源：`src/stores/useSyncStore.ts:279,297-360`

### 4.2 上传 payload 边界

上传 payload 由 `buildUploadPayload()` 生成：`src/stores/useSyncStore.ts:129-164`

当模式为 `data` / `full` 时会带上：

- `books`
- `progress`
- `bookmarks`
- `highlights`
- `settings`

来源：`src/stores/useSyncStore.ts:136-149`

当模式为 `files` / `full` 时会带上：

- `bookFiles`

来源：`src/stores/useSyncStore.ts:151-160`

### 4.3 敏感键过滤

以下 settings 键不会进入 WebDAV payload：`src/stores/useSyncStore.ts:63-69,148`

- `translateConfig`
- `webdavUrl`
- `webdavUser`
- `webdavPass`
- `webdavPath`
- `webdavRemoteEtag`
- `webdavSyncMode`
- `webdavRestoreMode`
- `webdavReplaceBeforeRestore`
- `lastSyncTime`

约束：

- 同步不是“把整个 `settings` 原封不动上传”。
- 凡是包含凭据、远端协商状态、设备本地同步状态的键，都不应进入远端备份。
- 后续若新增敏感配置，必须同时更新 `SENSITIVE_SETTINGS_KEYS`：`src/stores/useSyncStore.ts:64-69`

### 4.4 ETag 冲突控制

ETag 冲突控制逻辑在 `checkEtagAndUpload()`：`src/stores/useSyncStore.ts:166-212`

已确认行为：

- 先做 `head`：`src/stores/useSyncStore.ts:178-180`
- 远端不存在时使用 `If-None-Match: *`：`src/stores/useSyncStore.ts:182-185`
- 远端存在时使用 `If-Match`：`src/stores/useSyncStore.ts:186-189`
- 若本地记录的 `remoteEtag` 与远端 `headEtag` 不一致，则拒绝覆盖并视为冲突：`src/stores/useSyncStore.ts:189-190`
- 上传后回写新的 `etag`：`src/stores/useSyncStore.ts:210-211,351-353,453-455`

约束：

- `webdavRemoteEtag` 是同步协商元数据，不是业务数据。
- 修改同步协议时，不得绕过 `head -> compare -> conditional upload` 这条链路，否则会放大覆盖风险。

### 4.5 下载与恢复边界

下载应用逻辑在 `applyDownloadedPayload()`：`src/stores/useSyncStore.ts:214-258`

已确认行为：

- `clearFirst` 为真时会先清空本地目标表：`src/stores/useSyncStore.ts:223-235`
- `books/progress/bookmarks/highlights/settings` 通过 `bulkPut` 恢复：`src/stores/useSyncStore.ts:244-248`
- `bookFiles` 先 base64 解码，再 `bulkPut`：`src/stores/useSyncStore.ts:249-256`

恢复入口 `restoreData()`：`src/stores/useSyncStore.ts:469-505`

已确认行为：

- `restoreMode === 'auto'` 时跟随备份包内 `payload.mode`：`src/stores/useSyncStore.ts:494-495`
- 是否先清空本地由 `replaceBeforeRestore` 控制：`src/stores/useSyncStore.ts:470,495`
- 恢复完成后回写 `webdavSyncMode`：`src/stores/useSyncStore.ts:497-498`

约束：

- 恢复流程默认会触碰 `settings`，因此 `settings` 键空间治理会直接影响同步正确性。
- 新增 `settings` 键时，必须同步判断它应被恢复、应被过滤，还是根本不应进备份。

## 5. 翻译配置与凭据持久化边界

### 5.1 配置存储

翻译配置主键是 `translateConfig`：`src/services/translateService.ts:78`

读写入口：

- `loadTranslateConfig()`：`src/services/translateService.ts:161-167`
- `saveTranslateConfig()`：`src/services/translateService.ts:169-174`

### 5.2 API Key 安全边界

当前会加密处理的 key 字段：`src/services/translateService.ts:5,11-16,24-29`

- `deeplApiKey`
- `openaiApiKey`
- `geminiApiKey`
- `claudeApiKey`

加解密依赖渲染层暴露的安全存储 API：

- `safeStorageEncrypt` / `safeStorageDecrypt` / `safeStorageIsAvailable`：`electron/preload.ts:16-18`
- 主进程 IPC：`electron/main.ts:626-662`
- BrowserWindow 安全边界：`electron/main.ts:146-147`

约束：

- 翻译配置可以持久化，但其中 API key 不应以明文持久化。
- `translateConfig` 当前已被列为 WebDAV 敏感键，不参与远端同步：`src/stores/useSyncStore.ts:64-66`
- 修改翻译配置结构时，必须同步检查加密字段列表与同步过滤列表。

## 6. 缓存分层与生命周期

### 6.1 Vitra 持久缓存（L3）

`VitraBookCache` 负责把 sections HTML 压缩后写入 IndexedDB：`src/engine/cache/vitraBookCache.ts:107-204`

已确认：

- 前缀：`vcache-`：`src/engine/cache/vitraBookCache.ts:20,56-58`
- 排除格式：`PDF/DJVU/CBZ/CBT/CBR/CB7`：`src/engine/cache/vitraBookCache.ts:23-25,123-124`
- 读路径：`src/engine/cache/vitraBookCache.ts:132-156`
- 写路径：`src/engine/cache/vitraBookCache.ts:162-175`
- 全量清理：`src/engine/cache/vitraBookCache.ts:188-195`

当前风险：

- `getHash()` 未命中时递归调用了自己，而不是 `computeBufferHash()`：`src/engine/cache/vitraBookCache.ts:112-117`
- 该问题已被文档识别为高风险点，当前不在本章内直接修源码。

### 6.2 Section LRU（L2）

`VitraSectionManager` 负责 section 级内存与 Blob URL 淘汰：`src/engine/cache/vitraSectionManager.ts:38-144`

已确认行为：

- 默认最大加载数 `DEFAULT_MAX_LOADED = 5`：`src/engine/cache/vitraSectionManager.ts:13,43-45`
- `load()` 命中时刷新访问时间：`src/engine/cache/vitraSectionManager.ts:53-76`
- 淘汰时 `revokeObjectURL + section.unload()`：`src/engine/cache/vitraSectionManager.ts:116-143`
- `destroy()` 会释放全部已加载条目：`src/engine/cache/vitraSectionManager.ts:98-99`

### 6.3 Adapter 内 HTML 缓存与索引缓存（L1）

`VitraContentAdapter` 是缓存汇合点：`src/engine/pipeline/vitraContentAdapter.ts:39-180`

已确认行为：

- `htmlCache` 存章节 HTML：`src/engine/pipeline/vitraContentAdapter.ts:43,70,134-151`
- `sectionManager` 容量被提升到 10：`src/engine/pipeline/vitraContentAdapter.ts:31-32,52-54`
- 初始化时若命中持久缓存，会预热 `htmlCache`：`src/engine/pipeline/vitraContentAdapter.ts:60-78`
- 命中持久缓存后会空闲构建搜索索引：`src/engine/pipeline/vitraContentAdapter.ts:76-77,176-187`
- `extractChapterHtml()` 成功后会写入搜索索引：`src/engine/pipeline/vitraContentAdapter.ts:149-152`
- `destroy()` 会先构建缓存 payload，再释放 `sectionManager`、`htmlCache`、asset session，并异步写回持久缓存：`src/engine/pipeline/vitraContentAdapter.ts:84-95`

### 6.4 搜索索引缓存

搜索索引是独立内存缓存，不走 `settings`：`src/engine/cache/searchIndexCache.ts:35-73`

已确认接口：

- `upsertChapterIndex()`：`src/engine/cache/searchIndexCache.ts:35-40`
- `hasChapterIndex()`：`src/engine/cache/searchIndexCache.ts:42-44`
- `getIndexedChapterCount()`：`src/engine/cache/searchIndexCache.ts:46-48`
- `clearBookIndex()`：`src/engine/cache/searchIndexCache.ts:50-52`
- `searchBookIndex()`：`src/engine/cache/searchIndexCache.ts:54-72`

约束：

- 搜索索引属于会话级加速结构，不应写入 `db.settings`。
- 若书籍生命周期结束，应确保存在索引清理路径，避免长期驻留。

### 6.5 资源会话缓存

资源 Blob URL 会话缓存由 `assetLoader` 管理：`src/utils/assetLoader.ts:72-137`

已确认行为：

- `resolveSessionAssetUrl()` 负责同 session 复用 URL，并处理并发 in-flight：`src/utils/assetLoader.ts:72-113`
- `hasSessionAssetUrl()` 用于判断 Blob URL 是否仍有效：`src/utils/assetLoader.ts:115-120`
- `releaseAssetSession()` 会批量回收 URL 并清空索引：`src/utils/assetLoader.ts:122-137`

约束：

- Blob URL 生命周期必须跟 sessionKey 绑定，不能只依赖浏览器自然回收。
- 若 provider/adapter 已销毁，后续不应继续信任旧的资源 URL。

### 6.6 翻译结果缓存

翻译结果缓存走独立表 `translationCache`，不走 `settings`：`src/services/storageService.ts:75,106,115`

已确认行为：

- cache key 前缀 `tcache:`：`src/services/translateService.ts:79,177-195`
- 过期即删：`src/services/translateService.ts:197-205`
- 超上限时按 `lastAccessAt` 清理最旧项：`src/services/translateService.ts:208-219`
- 写入路径：`src/services/translateService.ts:221-235`
- 全量清理：`src/services/translateService.ts:238-240`

## 7. 修改约束

- 不要把新的大块结构化数据继续塞进 `settings`，除非它明确是单键配置。
- 不要让会话级缓存混入可同步数据。
- 不要让同步逻辑绕过敏感键过滤与 ETag 协商。
- 不要把 API key 明文持久化到 IndexedDB。
- 不要让 Blob URL 的创建点与释放点分离到不可追踪。
- 修改 `storageService.ts`、`useSyncStore.ts`、`translateService.ts`、`vitraBookCache.ts`、`assetLoader.ts` 任一文件时，都应同时回看本文档。

## 8. 高风险点

- Dexie 版本升级与历史数据迁移：`src/services/storageService.ts:80-124`
- `settings` 键空间继续膨胀但缺少注册表治理
- `VitraBookCache` 当前 `getHash()` 递归风险：`src/engine/cache/vitraBookCache.ts:112-117`
- 同步恢复会直接覆盖 `settings`：`src/stores/useSyncStore.ts:241-249`
- WebDAV 元数据键与真实业务键混存于同一表
- 翻译配置、同步配置、安全存储能力跨越 renderer / preload / main 三层

## 9. 当前测试与治理缺口

结合现有测试基线，当前仍缺：

- `storageService.ts` 的表结构与升级回归
- `useSyncStore.ts` 的敏感键过滤、ETag 冲突、恢复覆盖策略回归
- `translateService.ts` 的 `safeStorage` 加解密与 `translationCache` TTL 回归
- `settings` 键空间注册表与所有权说明
- 缓存清理链路回归：持久缓存 / section LRU / asset session / 搜索索引

这些缺口也已在测试基线文档中体现：`doc/05_TEST_ORACLES.md:142-149`
