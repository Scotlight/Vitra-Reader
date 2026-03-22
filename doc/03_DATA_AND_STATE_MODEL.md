# 数据与状态模型

## 1. 目标

本文档描述阅读相关数据、缓存与运行时状态的推荐理解方式。源码是真值；本文档用于约束“状态应该放在哪里、由谁负责”。

## 2. 状态分层

当前项目至少可拆为四类状态：

### 2.1 UI 运行时状态

典型包括：

- 当前阅读模式（滚动 / 分页）
- 当前章节或当前页
- 主题、字号、行高、边距等阅读器样式配置
- 章节渲染是否已完成
- 首屏/延迟水合进度

这些状态通常应由 Reader 组件树控制，而不是由 parser/provider 反向持有。

### 2.2 内容提供状态

由 `ContentProvider` 或其实现维护，例如：

- 文档是否已 `init`
- 目录与 spine 信息
- 当前已提取章节 HTML
- 章节样式列表
- 搜索能力与索引状态
- 资源会话是否仍有效

约束：

- Provider 负责源文档到“可渲染内容”的转换
- Provider 不应承担大量 UI 状态管理

### 2.3 渲染管线状态

由 Vitra 渲染链路维护，例如：

- preprocess 结果
- html fragment 列表
- segment metas
- 当前阶段 trace/timing
- 向量化渲染计划
- 已水合段、占位段、活跃段集合

约束：

- 这些状态属于中间产物，生命周期通常短于持久数据
- 阶段结果应有明确前后依赖，避免跨层乱用

### 2.4 缓存与持久化状态

典型包括：

- PDF 页面 HTML 缓存
- PDF 页面图像 URL 缓存
- Vitra section LRU
- scope CSS LRU
- IndexedDB 中的书籍级缓存

约束：

- 持久缓存不是 UI 真值，只是性能优化层
- 命中缓存不应改变功能语义
- 释放逻辑必须与资源生命周期绑定

## 3. 当前确认的缓存真值

### 3.1 PDF provider 内缓存

已知包括：

- `pageHtmlCache`
- `pageImageUrlCache`
- 原始 `data` buffer 在 `init()` 后释放引用

约束：

- 渲染后生成的 Blob URL 必须可追踪、可释放
- 已释放的原始 buffer 不应再次被逻辑依赖

### 3.2 VitraSectionManager

职责是基于 LRU 限制同时保留的 section 数量。

约束：

- `load()` 命中缓存时应刷新访问时间
- 淘汰必须伴随 `revokeObjectURL` 与 `section.unload()`

### 3.3 scopeCssCache

职责是缓存 CSS 作用域处理结果。

约束：

- key 设计应同时区分 CSS 内容和 chapterId
- 命中缓存只影响性能，不影响样式结果

### 3.4 VitraBookCache

职责是将可缓存格式的 sections HTML 持久化到 IndexedDB。

约束：

- key 必须稳定、可重复生成
- 排除格式策略必须文档化
- 读取失败时应可回退到重新解析

## 3.5 Dexie 持久化真值

当前主持久化层是 Dexie / IndexedDB：`src/services/storageService.ts:69-128`

已确认表：

- `books`：书籍元数据：`src/services/storageService.ts:70,80-82,88-90,100-102,109-111`
- `bookFiles`：书籍二进制：`src/services/storageService.ts:71,82,90,102,111`
- `progress`：阅读进度：`src/services/storageService.ts:72,83,91,103,112`
- `bookmarks`：书签/笔记：`src/services/storageService.ts:73,84,92,104,113`
- `highlights`：高亮：`src/services/storageService.ts:74,85,93,105,114`
- `translationCache`：翻译结果缓存：`src/services/storageService.ts:75,106,115`
- `settings`：通用键值：`src/services/storageService.ts:76,86,94,107,116`

当前数据库版本迁移：`src/services/storageService.ts:80-124`

- v3：补 `books.format`
- v4：引入 `translationCache`
- v5：补 `originalTitle` / `originalAuthor` / `originalDescription` / `originalCover`

### 3.6 `db.settings` 当前角色

`db.settings` 当前不是单一“设置表”，而是复合键空间：`src/services/storageService.ts:76,86,94,107,116`

当前已确认至少承载：

- Vitra 持久缓存键 `vcache-*`：`src/engine/cache/vitraBookCache.ts:20,136-174,188-195`
- 翻译配置 `translateConfig`：`src/services/translateService.ts:78,161-174`
- WebDAV 配置与同步元数据：`src/stores/useSyncStore.ts:64-69,369-389,454-458,487-497`
- 书架组织数据 `shelves` / `shelfBookMap`：`src/hooks/useShelfManager.ts:45-48,125,159-166`
- 收藏与回收站集合 `favoriteBookIds` / `trashBookIds`：`src/components/Library/LibraryView.tsx:139-154,290-297`

约束：

- `settings` 只能作为单键配置、同步元数据或前缀型缓存的承载层。
- Blob URL、搜索索引、运行时句柄不得进入 `settings`。
- 更完整键空间治理以 `doc/06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md` 为准。

### 3.7 翻译配置与翻译结果缓存

当前翻译链路拆成两类持久化状态：

- `translateConfig`：配置，存于 `db.settings`：`src/services/translateService.ts:78,161-174`
- `translationCache`：结果缓存，存于独立表：`src/services/translateService.ts:197-240`, `src/services/storageService.ts:75,106,115`

已确认：

- API key 字段会经过 `safeStorage` 加解密：`src/services/translateService.ts:5-31`
- 渲染层通过 preload 暴露 `safeStorageEncrypt` / `safeStorageDecrypt` / `safeStorageIsAvailable`：`electron/preload.ts:16-18`
- 主进程提供对应 IPC：`electron/main.ts:626-662`
- `translationCache` 带 TTL 与按 `lastAccessAt` 的清理：`src/services/translateService.ts:197-240`

### 3.8 WebDAV 配置与同步元数据

WebDAV 状态以 `useSyncStore` 为运行时真值：`src/stores/useSyncStore.ts:260-295`

其中持久化到 `db.settings` 的包括：

- `webdavUrl` / `webdavPath` / `webdavUser`
- `webdavSyncMode` / `webdavRestoreMode` / `webdavReplaceBeforeRestore`
- `webdavRemoteEtag` / `lastSyncTime`

来源：`src/stores/useSyncStore.ts:326,335,352,360,369-389,454,458,487,497`

已确认 `webdavPass` 为 session-only，不持久化：`src/stores/useSyncStore.ts:372,388-395`

约束：

- 同步元数据是协商状态，不是业务真值。
- 敏感键过滤、ETag 冲突控制、恢复覆盖策略详见 `doc/06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md`。

## 4. 推荐的状态真值边界

### 4.1 Reader UI 是这些状态的真值层

- 当前模式
- 当前定位（章节/页）
- 用户阅读样式设置
- 当前可视内容范围

### 4.2 Provider 是这些状态的真值层

- 文档解析结果
- 目录结构
- 章节内容获取能力
- 资源访问能力

### 4.3 Cache 不是业务真值层

Cache 只能回答“是否已有可复用结果”，不能成为业务正确性的唯一来源。

## 5. 当前已确认的阅读进度真值

当前阅读进度的真实持久化读写点已确认：

- `ReaderView` 打开书籍时读取进度：`src/components/Reader/ReaderView.tsx:262-279`
- 滚动模式写入进度：`src/components/Reader/ScrollReaderView.tsx:1064-1070`
- 分页模式写入进度：`src/components/Reader/PaginatedReaderView.tsx:577-583`

当前进度格式采用：

- 滚动模式：`vitra:{spineIndex}:{scrollTop}`
- 分页模式：`vitra:{spineIndex}:{currentPage}`

这意味着：

- `db.progress` 是阅读位置持久化的当前真值层
- `ReaderView` 负责恢复入口
- 具体模式组件负责写回

## 6. 当前缺失但必须补齐的状态说明

要把项目提升到真正全局可接手，后续需要补齐：

- 主题/排版设置持久化位置
- 最近打开书籍与书库元数据来源
- 搜索索引清理时机与书籍生命周期绑定关系
- `settings` 键空间注册表与新增键评审规则（当前治理基线见 `doc/06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md`）
