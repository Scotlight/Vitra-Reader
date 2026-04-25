# 缓存系统模块规范

## 1. 模块范围

主要文件：

- `src/engine/cache/vitraBookCache.ts`
- `src/engine/cache/vitraSectionManager.ts`
- `src/engine/cache/searchIndexCache.ts`
- `src/utils/styleProcessor.ts`
- `src/utils/assetLoader.ts`
- `src/engine/pipeline/vitraContentAdapter.ts`
- `src/engine/parsers/providers/pdfProvider.ts` 中页面缓存相关实现

## 2. 目标

缓存系统的目标是：

- 降低重复解析与重复渲染成本。
- 控制会话内内存占用。
- 避免大文档、大章节和大书库引发性能劣化。
- 在不改变功能语义的前提下提升响应速度。

## 3. 缓存分层

### 3.1 L1：局部内存缓存

典型包括：

- PDF 页面 HTML 缓存。
- PDF 页面图像 URL 缓存。
- `VitraContentAdapter.htmlCache` 中的章节 HTML。
- scope CSS 结果缓存。
- 搜索索引内存缓存。
- 分页高亮章节级缓存。

约束：

- L1 缓存必须有明确的失效或销毁入口。
- 搜索索引、分页高亮缓存和 Blob URL 不得写入 `db.settings`。

### 3.2 L2：LRU section 管理

典型实现：`VitraSectionManager`。

职责：

- 限制同时保留的 section 资源数。
- 命中时更新访问时间。
- 淘汰最旧资源，并释放 URL / section。
- 支撑 `VitraContentAdapter.extractChapterHtml()` 的 section 生命周期。

约束：

- 淘汰必须伴随 `revokeObjectURL` 与 `section.unload()`。
- `destroy()` 必须释放全部已加载条目。

### 3.3 L3：持久化缓存

典型实现：`VitraBookCache`。

职责：

- 使用稳定 key 存储书籍级章节 HTML 缓存。
- 提升重复打开速度。
- 排除不适合持久缓存的格式。
- 在 `VitraContentAdapter.init()` / `destroy()` 两端接入预热与写回。

当前 key 前缀：

- `vcache-`

当前排除格式：

- `PDF`
- `DJVU`
- `CBZ`
- `CBT`
- `CBR`
- `CB7`

约束：

- `vcache-` 属于本地持久缓存前缀，不参与 WebDAV 同步。
- 持久缓存读取失败时必须能回退到重新解析。
- 缓存命中不能改变功能结果。

## 4. 资源会话缓存

`assetLoader` 负责 sessionKey 级 Blob URL 管理：

- `resolveSessionAssetUrl()`：解析并复用同 session 的资源 URL。
- `hasSessionAssetUrl()`：判断 URL 是否仍属于有效 session。
- `releaseAssetSession()`：批量释放 session 下的 Blob URL。

当前 EPUB 资源加载通过 provider 暴露资源 session 生命周期，`VitraContentAdapter.destroy()` 会继续调用 `releaseAssetSession()` 收口资源释放。

约束：

- Blob URL 生命周期必须绑定 sessionKey。
- provider / adapter 销毁后不应继续信任旧资源 URL。
- 不得只依赖浏览器 GC 回收 Blob URL。

## 5. 搜索索引缓存

`searchIndexCache` 是会话级内存缓存，服务搜索首查后的复用。

约束：

- 不写入 `db.settings`。
- 不参与 WebDAV 同步。
- 书籍生命周期结束时需要保留清理路径。

## 6. 分页高亮缓存

分页高亮缓存位于 `usePaginatedHighlights()`：

- 以 `bookId` 和 `db.highlights.where('bookId').equals(bookId).count()` 判断缓存有效性。
- 将整本高亮分组成 `groupedBySpine` 后按章节复用。
- 注入动作进入 idle task。

约束：

- 当前没有章节索引，仍需首次读取该书全部高亮。
- 新增章节索引需要 Dexie schema 升级，不应作为小改动直接推进。

## 7. 修改约束

- 缓存命中不能改变外部行为。
- 释放资源必须与淘汰或销毁行为绑定。
- cache miss 不是错误，必须可回退。
- 不得对所有格式统一启用持久缓存。
- 新增缓存必须同时写清楚 key、失效条件、清理入口和同步边界。

## 8. 高风险点

- LRU 淘汰条件与阈值。
- `revokeObjectURL` 释放时机。
- 缓存 key 稳定性。
- 持久缓存格式排除名单。
- 样式缓存冲突。
- 搜索索引与书籍生命周期脱节。
- 分页高亮缓存失效条件不充分。

## 9. 当前已确认事实

- `VitraBookCache.getHash()` 当前已经通过 `computeBufferHash()` 计算 SHA-256，并用 `WeakMap<ArrayBuffer, string>` 缓存结果；旧的递归风险描述不再适用。
- `VitraBookCache` 直接存 `ArrayBuffer` 压缩结果，避免把 `Uint8Array` 展开成 `number[]` 带来的存储膨胀。
- `syncStorePayload.ts` 会过滤 `vcache-` 前缀，避免本地持久缓存进入 WebDAV 备份。

## 10. 推荐排查路径

- 页面重复渲染：先看 PDF 页面缓存或章节 HTML 缓存。
- 长时间阅读内存上涨：先看 `VitraSectionManager.destroy()`、PDF `clearPageCaches()` 与 asset session 释放。
- 重复打开慢：先看 `VitraBookCache.get()/put()` 与 `VitraContentAdapter.init()/destroy()`。
- 样式处理慢：先看 scope CSS 缓存。
- 搜索首查慢或命中异常：先看 `scheduleIdleIndexBuild()` 与 `searchIndexCache`。
- 分页高亮注入慢：先看 `usePaginatedHighlights()` 的 count 失效与 `groupedBySpine` 缓存。
