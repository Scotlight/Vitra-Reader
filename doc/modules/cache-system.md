# 缓存系统模块规范

## 1. 模块范围

主要文件：

- `src/engine/cache/vitraBookCache.ts`
- `src/engine/cache/vitraSectionManager.ts`
- `src/utils/styleProcessor.ts`
- `src/engine/parsers/providers/pdfProvider.ts` 中页面缓存相关实现

## 2. 目标

缓存系统的目标是：

- 降低重复解析与重复渲染成本
- 控制会话内内存占用
- 避免大文档/大章节引发性能劣化
- 在不改变功能语义的前提下提升响应速度

## 3. 分层

### 3.1 L1：局部内存缓存

典型包括：

- PDF 页面 HTML：`src/engine/parsers/providers/pdfProvider.ts:112,189,211,225,232,235`
- PDF 页面图像 URL：`src/engine/parsers/providers/pdfProvider.ts:113,142-145,202,235`
- `VitraContentAdapter.htmlCache` 里的章节 HTML：`src/engine/pipeline/vitraContentAdapter.ts:43,134-151,161`
- scope CSS 结果：`src/utils/styleProcessor.ts:28-62`
- 搜索索引内存缓存：`src/engine/cache/searchIndexCache.ts:35-54`

### 3.2 L2：LRU section 管理

典型实现：`VitraSectionManager`

源码锚点：`src/engine/cache/vitraSectionManager.ts:38-144`

职责：

- 限制同时保留的 section 资源数
- 更新访问时间
- 淘汰最旧资源并释放 URL/section
- 支撑 `VitraContentAdapter.extractChapterHtml()` 的 section 生命周期：`src/engine/pipeline/vitraContentAdapter.ts:129-165`

### 3.3 L3：持久化缓存

典型实现：`VitraBookCache`

源码锚点：`src/engine/cache/vitraBookCache.ts:107-204`

职责：

- 使用稳定 key 存储书籍级内容缓存
- 提升重复打开速度
- 对不适合格式进行排除
- 在 `VitraContentAdapter.init()` / `destroy()` 两端接入打开预热与退出写回：`src/engine/pipeline/vitraContentAdapter.ts:60-78,84-95`

## 4. 修改约束

- 缓存命中不能改变外部行为
- 释放资源必须和淘汰行为绑定
- 不得把 cache miss 视为错误
- 不得对所有格式一刀切启用持久缓存

## 5. 高风险点

- LRU 淘汰条件与阈值
- `revokeObjectURL` 释放时机
- 缓存 key 稳定性
- 格式排除名单
- 样式缓存冲突

## 6. 已确认的风险点

### 6.1 VitraBookCache hash 计算存在递归风险

在 `src/engine/cache/vitraBookCache.ts:112-117`，`getHash()` 当前实现会在未命中缓存时再次调用 `this.getHash(buffer)`，而不是调用 `computeBufferHash()`（`src/engine/cache/vitraBookCache.ts:46-54`）。

这意味着：

- 当前实现存在无限递归风险
- `get()` / `put()` / `evict()` 都依赖该入口：`src/engine/cache/vitraBookCache.ts:132-165,180+`
- 这属于缓存主路径风险，后续若修复，应同步更新本文档与测试基线

## 7. 推荐排查路径

- 页面重复渲染：先看 PDF 页面缓存或章节 HTML 缓存
- 长时间阅读内存上涨：先看 `VitraSectionManager.destroy()/releaseEntry()`、PDF `clearPageCaches()` 与 asset session 释放
- 重复打开慢：先看 `VitraBookCache.get()/put()` 与 `VitraContentAdapter.init()/destroy()`
- 样式处理慢：先看 scopeCssCache
- 搜索首查慢或命中异常：先看 `scheduleIdleIndexBuild()` 与 `searchIndexCache`
