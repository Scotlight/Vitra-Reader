# 样式处理模块规范

## 1. 模块范围

主要文件：

- `src/utils/styleProcessor.ts`
- `src/utils/assetLoader.ts`
- `src/engine/render/chapterPreprocessCore.ts`

## 2. 模块职责

样式处理链路负责：

- 清理不安全或不受控的样式内容
- 将章节样式限定在内容作用域内
- 辅助处理资源路径与样式引用
- 为阅读器最终样式注入提供可控输入

源码锚点：

- CSS 消毒：`src/engine/core/contentSanitizer.ts:109-122`
- HTML 消毒入口：`src/engine/core/contentSanitizer.ts:330-350`
- 预处理里串起 `sanitizeStyleSheets()` + `removeStyleTags()` + `scopeStyles()`：`src/engine/render/chapterPreprocessCore.ts:43-60`
- 资源会话 URL 解析与释放：`src/utils/assetLoader.ts:72-137`

## 3. 核心原则

- 内容样式不得污染宿主页面
- 章节样式必须能在局部作用域内稳定复现
- 缓存只是优化，不改变样式语义
- 与资源路径相关的处理必须可追溯

源码已确认：

- scope CSS LRU：`src/utils/styleProcessor.ts:28-62`
- 全局选择器替换表 `:root/html/body`：`src/utils/styleProcessor.ts:125-130`
- `scopeStyles()` 作用域状态机入口：`src/utils/styleProcessor.ts:219-245`
- at-rule 递归/透传规则：`src/utils/styleProcessor.ts:115-123,296-305`

## 4. 修改约束

- 不得移除 scope 前缀逻辑而无替代方案
- 不得让 asset URL 处理脱离 provider/session 生命周期
- 不得直接信任原始文档中的任意 CSS 或 HTML 结构

## 5. 高风险点

- selector scope 重写规则
- 特殊 CSS 语法兼容
- 内联 style 与外部 style 合并顺序
- 资源 URL 重写后的一致性

## 6. 已确认的补充真值

- `assetLoader.ts` 会话 URL 生命周期主入口：`resolveSessionAssetUrl()` / `hasSessionAssetUrl()` / `releaseAssetSession()`，源码见 `src/utils/assetLoader.ts:72-137`
- EPUB 资源加载在 `resolveBlobUrl()` 中调用 `resolveSessionAssetUrl()`，并把归一化后的 archive path 转成 Blob URL：`src/engine/parsers/providers/epubResourceLoader.ts:104-121`
- EPUB provider 通过 `isAssetUrlAvailable()` / `releaseAssetSession()` 把 asset session 生命周期暴露给上层：`src/engine/parsers/providers/epubProvider.ts:38-44`
- `VitraContentAdapter.destroy()` 会继续调用 `book.releaseAssetSession?.()` 收口资源释放：`src/engine/pipeline/vitraContentAdapter.ts:84-90`
- style sanitize 当前精确入口仍以 `sanitizeStyleSheets()` 为准：`src/engine/core/contentSanitizer.ts:118-122`
- `ShadowRenderer` 本地 fallback 路径也会执行 `extractStyles()` / `removeStyleTags()` / `sanitizeStyleSheets()` / `scopeStyles()`：`src/components/Reader/ShadowRenderer.tsx:746-751`

仍需后续按需补充：

- 复杂 CSS 兼容边界的枚举化规则表
- style sanitize 的完整规则矩阵（当前源码入口已可追到 `src/engine/core/contentSanitizer.ts:109-122`）
