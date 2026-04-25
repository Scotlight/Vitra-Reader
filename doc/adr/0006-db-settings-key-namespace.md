# ADR-0006：db.settings 键空间治理

## 状态

已采用：模块前缀化主键 + 遗留键迁移 + 同步层过滤。

## 背景

`db.settings` 表结构是 `{ key: string; value: unknown }`。它被阅读设置、同步配置、翻译配置、分组、书库组织和缓存共同使用。早期实现使用无前缀键，例如 `webdavUrl`、`groups`、`favoriteBookIds`，键归属不够清晰，也增加了同步过滤风险。

当前已确认主键：

| 模块 | 当前主键 |
| --- | --- |
| `useSyncStore` | `sync:webdavUrl`, `sync:webdavPath`, `sync:webdavUser`, `sync:syncMode`, `sync:restoreMode`, `sync:replaceBeforeRestore`, `sync:lastSyncTime`, `sync:remoteEtag` |
| `useSettingsStore` | `settings:readerSettings`, `settings:savedColors` |
| `translateService` | `translateConfig` |
| `groupManagerRepository` | `groups:groups`, `groups:bookMap`, `groups:bookOrder`, `groups:homeOrder` |
| `libraryMetaRepository` | `library:favoriteBookIds`, `library:trashBookIds` |
| `VitraBookCache` | `vcache-{hash}` |

遗留兼容键：

- 同步：`webdavUrl`, `webdavPath`, `webdavUser`, `webdavSyncMode`, `webdavRestoreMode`, `webdavReplaceBeforeRestore`, `lastSyncTime`, `webdavRemoteEtag`, `webdavPass`
- 分组：`groups`, `groupBookMap`, `groupBookOrder`, `homeOrder`, `shelves`, `shelfBookMap`
- 书库：`favoriteBookIds`, `trashBookIds`

## 考虑过的方案

### 方案 1：保留现有键名，只在同步层过滤

优点是改动小；缺点是键归属继续不清晰，新增键容易误入 WebDAV payload。

### 方案 2（已采用）：主键前缀化，读取入口迁移旧键

为同步、阅读设置、分组和书库组织写入带模块前缀的主键，读取入口兼容旧键并迁移。同步层同时过滤新旧敏感键和不可同步前缀。

### 方案 3：拆表，每个模块独立 Dexie 表

隔离性最好，但需要 Dexie v7 schema 迁移，回归面更大。

## 决策

采用方案 2。

## 原因

- 不需要升级 Dexie schema。
- 主键归属更明确，后续审查成本低于无前缀键。
- 读取入口迁移旧键，兼容已有本地数据。
- 同步 payload 仍由 `src/stores/syncStorePayload.ts` 统一过滤，避免远端备份包含凭据、同步元数据或本地缓存。

## 当前约束

- 新增 settings 键时，必须在 `doc/06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md` 中登记用途和同步边界。
- 新增敏感配置时，必须更新 `SENSITIVE_SETTINGS_KEYS`。
- 新增本地缓存前缀时，必须更新 `UNSYNCABLE_SETTINGS_KEY_PREFIXES`。
- 不允许把 Blob URL、搜索索引、运行时句柄、worker 状态和 provider 实例写入 `settings`。
- `webdavPass` 不持久化；读取配置时应删除历史遗留 `webdavPass`。

## 影响

正向：

- 不需要数据库升级。
- 模块主键更清晰。
- 旧数据可在读取时迁移。
- 同步过滤覆盖新旧同步键。

负向：

- `settings` 仍是复合键空间。
- 需要维护文档、迁移入口和过滤列表一致。
- 未来如果 settings 键继续增多，仍可能需要进入拆表方案。

## 未来变更条件

满足任一条件时，重新评估拆表或专用 store：

- settings 键数量继续明显增长。
- 多模块出现键名冲突。
- 同步过滤规则复杂到难以维护。
- 需要对某类 settings 做独立迁移、导出或加密。
