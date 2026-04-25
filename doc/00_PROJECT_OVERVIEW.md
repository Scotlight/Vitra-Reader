# 项目总览

## 1. 项目目标

本项目是一个桌面端电子书阅读器，核心能力包括：

- 导入并打开多种电子书/文档格式
- 将不同格式统一适配为阅读内容
- 提供滚动阅读与分页阅读两种阅读体验
- 针对大章节、大文档与 PDF 提供性能优化和缓存策略

从当前仓库可确认，本项目的核心竞争力不在单一 UI，而在于位于 `src/engine/` 的内容解析与渲染引擎，以及 `src/components/Reader/` 下的阅读器呈现层。

## 1.5 当前已接入的格式范围

按当前源码可确认，Vitra 打开链路已经接入以下格式：

- Provider 兼容路径：EPUB、PDF、TXT、MOBI、AZW、AZW3、HTML、HTM、XHTML、MHTML、XML、MD、FB2
- 独立 parser 路径：DOCX、CBZ、CBT、CBR、CB7
- 预留但非默认可用：DJVU 已有格式嗅探与管线占位，但实际解析依赖可选的 `djvu.js`，默认构建不会导出对应 parser

## 2. 项目边界

### 2.1 核心边界

当前文档体系重点覆盖以下边界：

- 阅读器 UI 层
- 内容提供者接口与格式适配层
- Vitra 渲染管线
- PDF 专用渲染链路
- 缓存、预处理与样式隔离机制
- 运行与构建链路

### 2.2 非目标

以下内容目前不应假定已经被完整规范化：

- 全量业务页交互细节
- 所有外部工具链、发布流程与 CI 细节
- 所有历史兼容行为
- 任意格式在极端异常输入下的全部边界行为

## 3. 顶层目录地图

基于当前仓库根目录：

- `src/`：应用源码主目录
- `src/main.tsx`：Renderer 启动入口，挂载 `App`：`src/main.tsx:1-11`
- `src/App.tsx`：书库视图与阅读视图切换入口：`src/App.tsx:10-87`
- `src/components/Library/`：书库、导入、书架、注释列表等入口 UI
- `src/components/Reader/`：阅读器 UI 组件与 Shadow 渲染相关实现
- `src/components/Reader/scrollReader/`：滚动阅读模式下的 refs、滚动处理、章节卸载、虚拟章节运行时等局部 hook
- `src/components/Reader/paginatedReader/`：分页阅读模式下的高亮与局部外移 hook
- `src/engine/`：内容解析、缓存、预处理、渲染与适配主干
- `src/services/`：Dexie、翻译、阅读统计、系统桥接等服务层
- `src/stores/`：Zustand 状态、设置持久化与同步调度
- `src/test/`：Vitest 自动化测试
- `src/utils/`：样式处理、资产加载等辅助工具
- `electron/`：Electron 主进程与 preload 集成
- `scripts/`：脚本工具
- `docs/`：历史文档与现有引擎指南
- `doc/`：当前新增的全项目级规范目录
- `dist/` / `dist-electron/`：构建产物

## 4. 核心子系统地图

### 4.1 阅读器 UI 子系统

主要位于：

- `src/components/Reader/ReaderView.tsx`
- `src/components/Reader/useReaderBookSession.ts`
- `src/components/Reader/useReaderNavigation.ts`
- `src/components/Reader/ScrollReaderView.tsx`
- `src/components/Reader/PaginatedReaderView.tsx`
- `src/components/Reader/ShadowRenderer.tsx`
- `src/components/Reader/scrollReader/`
- `src/components/Reader/paginatedReader/`

职责：

- 作为统一阅读入口组件
- 把书籍会话装配、目录/搜索/跳转派发与注释面板数据拆到独立 hook
- 在滚动/分页模式之间切换渲染策略
- 承接章节内容、样式与阅读器配置
- 将内容注入 Shadow DOM 或页面容器中完成展示

### 4.2 内容适配与解析子系统

主要位于：

- `src/engine/core/contentProvider.ts`
- `src/engine/core/contentProviderFactory.ts`
- `src/engine/core/providerRegistry.ts`
- `src/engine/pipeline/vitraPipeline.ts`
- `src/engine/pipeline/vitraContentAdapter.ts`
- `src/engine/parsers/providers/pdfProvider.ts`
- `src/engine/parsers/providers/mobiParser.ts`
- `src/engine/parsers/providers/mobiTextDecoding.ts`
- `src/engine/parsers/vitraDocxParser.ts`
- `src/engine/parsers/vitraComicParser.ts`

职责：

- 通过 `VitraPipeline` 统一调度格式嗅探、parser 创建、预览与实际解析
- 通过 `ContentProvider` 统一抽象对外暴露阅读能力：`src/engine/core/contentProvider.ts:25-37`
- 在 `detectFormat()` 中完成格式识别：`src/engine/core/contentProvider.ts:117-136`
- 在 provider 兼容格式上通过 `providerRegistry` 装配内容提供者与元数据解析器
- 在 DOCX、漫画归档等格式上走独立 parser，而不是强行复用 provider 路径
- 为 PDF 提供独立页面渲染与链接提取逻辑
- 为非 PDF 格式提供通用适配路径

### 4.3 Vitra 渲染引擎子系统

主要位于：

- `src/engine/render/`
- `src/engine/render/chapterPreprocessCore.ts`
- `src/engine/render/chapterPreprocessService.ts`
- `src/components/Reader/ShadowRenderer.tsx`

职责：

- 执行章节预处理、消毒、样式作用域隔离
- 在 `chapterPreprocessService` 中复用 worker、按章节大小动态放宽超时，并在 worker 不可用时同步回退
- 根据章节体量决定是否启用向量化/分段渲染
- 在 render/hydrate 阶段控制首屏与延迟水合性能

### 4.4 缓存与存储子系统

主要位于：

- `src/engine/cache/vitraBookCache.ts`
- `src/engine/cache/vitraSectionManager.ts`
- `src/services/storageService.ts`
- `src/stores/useSyncStore.ts`
- `src/stores/syncStorePayload.ts`
- `src/stores/useSettingsStore.ts`
- `src/services/readingStatsService.ts`
- `src/services/translateService.ts`
- `src/utils/styleProcessor.ts`

职责：

- 管理章节 HTML、页面 HTML、Blob URL 与样式处理结果
- 对适合的格式提供 IndexedDB 持久缓存
- 通过 LRU 控制内存占用与 URL 回收
- 承载 Dexie 表结构、阅读设置持久化、WebDAV 同步状态、阅读统计、翻译结果缓存与敏感配置加密边界

## 5. 当前确认的关键统一接口

`ContentProvider` 是上层阅读器与底层格式实现之间的核心契约。现有 Vitra 指南中给出了接口轮廓，源码真值以 `src/engine/core/contentProvider.ts` 为准。

对上层而言，格式差异应尽量被收敛在 Provider/Adapter 内部，而不是扩散到 Reader UI 层。

## 6. 最小接手路径

新人或新会话建议按以下顺序接手：

1. 先读 `doc/01_ARCHITECTURE.md`
2. 再读 `doc/04_E2E_FLOWS.md`
3. 需要改阅读体验时，读 `doc/modules/reader-ui.md`
4. 需要改渲染/性能时，读 `doc/modules/vitra-engine.md`
5. 需要改 PDF 时，读 `doc/modules/pdf-provider.md`
6. 需要改缓存时，读 `doc/modules/cache-system.md`
7. 需要改存储 / 同步 / 设置持久化 / 阅读统计时，读 `doc/06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md`
8. 遇到设计疑问时，查 `doc/adr/`

## 7. 当前文档成熟度

当前体系已经具备“从总体到模块”的接手入口，并且已经补齐了存储 / 设置 / 同步 / 阅读统计 / 缓存治理这一块的项目级规范：`doc/06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md`

当前仍未完全覆盖的重点包括：

- 最近打开书籍与书库首页排序之间的完整规则仍需要继续文档化
- 搜索索引清理时机与书籍生命周期绑定关系仍需要补充专门说明
- Electron IPC 能力矩阵、发布流程、设置持久化测试与固定回归样本集仍未形成完整项目级手册
