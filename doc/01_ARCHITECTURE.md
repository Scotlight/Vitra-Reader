# 系统架构规范

## 1. 分层架构

当前项目可以按以下层次理解：

1. 应用与页面层
2. 阅读器 UI 层
3. 内容适配层
4. Vitra 渲染管线层
5. Worker 预处理层
6. 缓存与存储层
7. 格式解析层

其中，真正决定阅读表现、性能和格式兼容性的核心链路，是从 `ContentProvider` 到 `ShadowRenderer` 的整条路径。

## 2. 阅读器层级结构

根据现有 Vitra 指南可确认：

- `ReaderView` 是阅读器总入口
- 其下区分 `ScrollReaderView` 与 `PaginatedReaderView`
- `ShadowRenderer` 承担章节内容注入、样式注入、向量化渲染与延迟水合的重要职责

约束：

- 格式适配差异尽量收敛在 Provider/Adapter 内，不应让 Reader UI 直接关心具体文件格式
- 阅读模式差异应体现在布局与渲染节奏，而不应破坏统一的数据契约

## 3. 统一内容接口边界

`ContentProvider` 是上层阅读器与下层格式实现的统一契约。

已知职责包括：

- 初始化与销毁
- 目录获取
- 章节/书脊信息获取
- 章节 HTML 与样式提取
- 搜索
- 按章节卸载
- 资产 URL 可用性判断
- 资源会话释放

源码真值：

- `ContentProvider` 接口：`src/engine/core/contentProvider.ts:25-37`
- 当前 Reader 实际链路不是“UI 直接持有具体 provider”，而是：
  - `ReaderView -> VitraPipeline.open()`：`src/components/Reader/ReaderView.tsx:290-295`
  - `VitraPipeline.open()` 先 `detectVitraFormat()`，再 `createParser()`，并返回包含 `ready/metadata/preview/cancel` 的 handle：`src/engine/pipeline/vitraPipeline.ts:61-75`
  - `VitraPipeline.parseBook()` 调用具体 parser 的 `parse()`：`src/engine/pipeline/vitraPipeline.ts:106-113`
  - 对 provider 兼容格式，`VitraProviderBackedParser.parse()` 会并行执行 `createContentProvider()` 与 `parseBookMetadata()`，随后 `provider.init()`：`src/engine/parsers/vitraProviderParsers.ts:74-84`
  - `VitraProviderBackedParser.parse()` 再基于 `provider.getSpineItems()` / `provider.getToc()` 构造 `sections` 与回退 TOC：`src/engine/parsers/vitraProviderParsers.ts:86-100,185-275`
  - `createBookObject()` 最终把 provider 包装成 `VitraBook`，并注入 `resolveHref()` / `releaseAssetSession()` / `search()` / `destroy()`：`src/engine/parsers/vitraProviderParsers.ts:289-327`
  - `ReaderView` 再把 `VitraBook` 包成 `VitraContentAdapter`：`src/components/Reader/ReaderView.tsx:295-299`
  - 视图层最终面向 `VitraContentAdapter` 这一 `ContentProvider` 形态消费

约束：

- 上层依赖接口，不依赖具体格式实现细节
- 具体解析器负责把“源文档”转换为“章节 HTML + 样式 + 资源访问能力”
- 对 PDF，页面是最小渲染单元；对 EPUB/MOBI/TXT 等，章节通常是最小渲染单元

## 4. PDF 专用架构边界

PDF 是一条独立复杂链路，不应简单类比普通 HTML 章节渲染。

已确认关键点：

- `pdfProvider.ts` 负责 PDF.js runtime 管理、页面渲染、链接提取与页面 HTML 合成
- 页面输出由三层组成：像素图层、文字层、链接层
- 当前文字层已被禁用，原因是性能与稳定性权衡
- PDF 使用 modern/legacy 双 runtime，并在已知错误下全局切换到 legacy

约束：

- PDF 的性能问题优先在 provider 内部解决，不把复杂度泄漏到 Reader UI
- PDF 页面图像 URL 必须在缓存释放时 `revokeObjectURL`
- PDF 降级策略属于架构级行为，修改前应同步更新 ADR

## 5. Vitra 渲染管线边界

Vitra 当前采用五阶段管线：

- parse
- measure
- paginate
- render
- hydrate

这些阶段由统一的 trace/计时逻辑追踪，并要求顺序严格合法。

约束：

- 任一阶段不得跳过前置阶段直接执行
- 即使阶段失败，也要保留耗时信息以支持排障
- 大章节优化、向量化渲染、延迟水合都属于管线行为，不应零散散落在 UI 层

## 6. Worker 与主线程边界

预处理逻辑由：

- `chapterPreprocessService.ts`
- `chapterPreprocess.worker.ts`
- `chapterPreprocessCore.ts`

共同承担。

已知职责：

- HTML 消毒
- style 提取与清洗
- CSS 作用域隔离
- 章节分片
- 大章节向量化元数据生成

约束：

- CPU 密集和纯文本结构处理优先放在 Worker
- 主线程应尽量承担最终 DOM 构建与交互绑定
- Worker 回传的结构必须足以让主线程避免重复重计算

## 7. 缓存层边界

当前至少存在三层缓存：

- L1：会话内内存缓存
- L2：基于 LRU 的 section 管理器
- L3：IndexedDB 持久缓存

另外已确认还存在：

- 搜索索引内存缓存：`src/engine/cache/searchIndexCache.ts`
- 资源 Blob URL 会话缓存：`src/utils/assetLoader.ts:72-137`
- 翻译结果缓存与 TTL：`src/services/translateService.ts`

约束：

- 会话级缓存必须支持主动清理
- Blob URL 生命周期必须被显式管理
- 可持久缓存的格式与不可持久缓存的格式边界必须明确
- 样式缓存、章节缓存、页面缓存不可混淆其释放条件

## 8. 样式隔离边界

已知样式处理通过 `scopeStyles` 等逻辑为章节增加作用域前缀，以避免内容污染外部 UI。

约束：

- 内容文档中的样式不得无边界泄漏到宿主页面
- 章节样式必须在作用域内生效
- 样式缓存命中不应改变实际渲染结果

## 9. 模块依赖原则

推荐长期遵守以下依赖方向：

- UI 层依赖 Adapter/Provider 接口，不依赖具体解析实现细节
- Adapter/Provider 依赖 parser、cache、utils
- 渲染层依赖预处理结果，不反向依赖 UI 业务状态
- utils 作为底层能力层，避免反向依赖上层组件

## 10. 高风险改动区

以下改动默认视为高风险：

- `ContentProvider` 接口字段和语义变更
- PDF runtime 加载与 fallback 策略变更
- Vitra 五阶段顺序或阶段职责变更
- Shadow 渲染中的向量化/延迟水合逻辑变更
- IndexedDB key 设计、缓存排除格式策略变更
- CSS scope 逻辑变更
- `BookFormat`（小写）与 `VitraBookFormat`（大写）之间的映射层变更：`src/engine/core/contentProvider.ts`, `src/engine/core/vitraFormatDetector.ts`, `src/engine/parsers/vitraProviderParsers.ts:39-53`

这些改动必须同步更新模块文档和 ADR。
