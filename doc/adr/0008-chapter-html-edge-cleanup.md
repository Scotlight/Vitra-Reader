# 0008 章节 HTML 边缘空白清洗

## 状态

已采用。

## 背景

TXT、MOBI、HTML、MD、FB2、EPUB 等格式的章节 HTML 可能在章节首尾带有空文本、`<br>` 或空段落。渲染层会放大这些空节点的视觉高度，表现为章节开头或结尾出现大段空白。

这个问题不应该在每个 provider 内各自修补，否则后续新增格式时容易遗漏，也会产生重复规则。

## 决策

章节边缘空白清洗集中在 `src/engine/render/chapterHtmlCleanup.ts`。

清洗入口分两层：

1. `src/engine/parsers/providerSectionFactory.ts`
   - provider-backed 格式进入 `VitraBookSection.load()` 的第一道规范化入口。
   - 负责清洗新加载章节，并写入章节缓存、样式缓存和搜索索引。

2. `src/engine/pipeline/vitraContentAdapter.ts`
   - adapter 读取章节时的兜底入口。
   - 用于处理旧持久缓存和绕过 provider section factory 的路径。
   - 旧缓存预热阶段不全量清洗，只在章节被读取时按需清洗，避免大书打开时集中解析 DOM。

MOBI 的 `mobiHtmlRenderer` 仍会在生成章节对象时调用同一清洗工具，因为它还需要基于清洗后的内容过滤空章节。

PDF 跳过清洗。PDF 页面的 HTML 可能包含定位层，空 `div` 也可能有布局含义。

## 维护规则

- 新增 reflowable 文本格式时，优先走 `providerSectionFactory`，不要在 provider 内复制清洗规则。
- 需要新增可清理标签时，只修改 `chapterHtmlCleanup.ts` 的边缘标签集合，并补测试。
- 需要新增必须保留的内容型标签时，只修改保留集合，并补测试。
- 不要在缓存预热阶段全量调用 DOMParser。
- 不要对 PDF 页面 HTML 启用通用清洗。

## 验证

核心测试：

- `src/test/chapterHtmlCleanup.test.ts`
- `src/test/vitraChapterCleanupIntegration.test.ts`
- `src/test/mobiHtmlRenderer.test.ts`
