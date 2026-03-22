# 项目总览

## 1. 项目目标

本项目是一个桌面端电子书阅读器，核心能力包括：

- 导入并打开多种电子书/文档格式
- 将不同格式统一适配为阅读内容
- 提供滚动阅读与分页阅读两种阅读体验
- 针对大章节、大文档与 PDF 提供性能优化和缓存策略

从当前仓库可确认，本项目的核心竞争力不在单一 UI，而在于位于 `src/engine/` 的内容解析与渲染引擎，以及 `src/components/Reader/` 下的阅读器呈现层。

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
- `src/engine/`：内容解析、缓存、预处理、渲染与适配主干
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
- `src/components/Reader/ScrollReaderView.tsx`
- `src/components/Reader/PaginatedReaderView.tsx`
- `src/components/Reader/ShadowRenderer.tsx`

职责：

- 作为统一阅读入口组件
- 在滚动/分页模式之间切换渲染策略
- 承接章节内容、样式与阅读器配置
- 将内容注入 Shadow DOM 或页面容器中完成展示

### 4.2 内容适配与解析子系统

主要位于：

- `src/engine/core/contentProvider.ts`
- `src/engine/core/contentProviderFactory.ts`
- `src/engine/pipeline/vitraContentAdapter.ts`
- `src/engine/parsers/providers/pdfProvider.ts`
- `src/engine/parsers/providers/mobiParser.ts`
- `src/engine/parsers/providers/mobiTextDecoding.ts`

职责：

- 通过 `ContentProvider` 统一抽象对外暴露阅读能力：`src/engine/core/contentProvider.ts:25-37`
- 在 `detectFormat()` 中完成格式识别：`src/engine/core/contentProvider.ts:117-136`
- 在 `createContentProvider()` 中按格式动态装配 provider：`src/engine/core/contentProviderFactory.ts:3-38`
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
- 根据章节体量决定是否启用向量化/分段渲染
- 在 render/hydrate 阶段控制首屏与延迟水合性能

### 4.4 缓存与存储子系统

主要位于：

- `src/engine/cache/vitraBookCache.ts`
- `src/engine/cache/vitraSectionManager.ts`
- `src/utils/styleProcessor.ts`

职责：

- 管理章节 HTML、页面 HTML、Blob URL 与样式处理结果
- 对适合的格式提供 IndexedDB 持久缓存
- 通过 LRU 控制内存占用与 URL 回收

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
7. 需要改存储 / 同步 / 配置持久化时，读 `doc/06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md`
8. 遇到设计疑问时，查 `doc/adr/`

## 7. 当前文档成熟度

当前体系已经具备“从总体到模块”的接手入口，并且已经补齐了存储 / 同步 / 缓存治理这一块的项目级规范：`doc/06_STORAGE_SYNC_AND_CACHE_GOVERNANCE.md`

当前仍未完全覆盖的重点包括：

- 主题/排版设置持久化位置与写回链
- 最近打开书籍与书库元数据来源
- 搜索索引清理时机与书籍生命周期绑定关系
- `doc/` 与源码之间的长期同步纪律
