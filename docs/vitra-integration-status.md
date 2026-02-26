# Vitra 引擎融合状态报告

> 最后更新：2026-02-26
> 文档规格（koodo-reader-parsing.md）实施进度：**6/6 部分完成**
> 融合状态：**未融合** — Vitra 引擎模块已全部就绪，UI 层仍走旧 ContentProvider 系统

## 文档实施进度

| 部分 | 标题 | 状态 | 说明 |
|------|------|------|------|
| 第一部分 | 工程架构 | ✅ 完成 | Parser 类层次、统一接口、格式嗅探 |
| 第二部分 | 格式解析规范 | ✅ 完成 | EPUB/MOBI/PDF/DJVU/TXT/FB2/DOCX/MD/HTML/漫画 |
| 第三部分 | 通用章节分割器统一化 | ✅ 完成 | 共享标题检测、隐式标题增强、空内容常量统一 |
| 第四部分 | 向量化渲染引擎 | ✅ 完成 | 分页算法、渲染管线、离屏测量、水合调度、CSS 模板 |
| 第五部分 | 缓存与性能 | ✅ 完成 | IndexedDB 解析缓存、Section LRU 管理、搜索索引 |
| 第六部分 | 第三方库总览 | ✅ 参考 | 纯参考表，无需代码实现 |

---

## 当前渲染链路（旧系统）

```
用户打开书 → ReaderView.tsx
  → createContentProvider(format, data)          ← 旧系统入口
  → ContentProvider.init()
  → provider.extractChapterHtml(spineIndex)      ← 逐章提取 HTML
  → ShadowRenderer 注入 HTML 到 Shadow DOM
  → PaginatedReaderView / ScrollReaderView 渲染
      ├─ vitraMeasure.startMeasure()             ← 已接入 Vitra 分页测量
      ├─ vitraVectorPlanner.buildVitraVectorRenderPlan()  ← 已接入大章节决策
      └─ readerCss.buildReaderCssTemplate()      ← 已接入 CSS 模板
```

### 旧系统关键文件

| 文件 | 职责 |
|------|------|
| `src/services/contentProvider.ts` | `ContentProvider` 接口定义 + `BookFormat` 类型 |
| `src/services/contentProviderFactory.ts` | `createContentProvider(format, data)` 工厂 |
| `src/services/providers/epubProvider.ts` | EPUB ContentProvider |
| `src/services/providers/txtProvider.ts` | TXT ContentProvider |
| `src/services/providers/htmlProvider.ts` | HTML ContentProvider |
| `src/services/providers/fb2Provider.ts` | FB2 ContentProvider |
| `src/services/providers/mdProvider.ts` | MD ContentProvider |
| `src/services/providers/mobiProvider.ts` | MOBI ContentProvider |
| `src/services/providers/pdfProvider.ts` | PDF ContentProvider |
| `src/components/Reader/ReaderView.tsx` | 顶层阅读器组件（调用旧系统） |
| `src/components/Reader/PaginatedReaderView.tsx` | 翻页模式渲染 |
| `src/components/Reader/ScrollReaderView.tsx` | 连续滚动模式渲染 |
| `src/components/Reader/ShadowRenderer.tsx` | Shadow DOM 渲染容器 |

---

## Vitra 引擎链路（已实现，未接入 UI）

```
VitraPipeline.open({ buffer, filename })
  → detectVitraFormat(buffer, filename)           ← 格式嗅探（Magic Bytes + 扩展名）
  → VitraXxxParser.parse()                       ← 统一 Parser 接口
  → VitraBook                                    ← 统一 Book 模型
      ├─ book.metadata                           ← 元数据
      ├─ book.toc                                ← 目录树
      ├─ book.sections[i].load()                 ← 懒加载章节 HTML (Blob URL)
      ├─ book.sections[i].unload()               ← 释放 Blob URL
      ├─ book.resolveHref(href)                  ← 链接解析
      ├─ book.getCover()                         ← 封面提取
      └─ book.destroy()                          ← 资源释放
```

### Vitra 引擎关键文件

| 文件 | 职责 | 状态 |
|------|------|------|
| **类型层** | | |
| `src/types/vitraBook.ts` | `VitraBook`/`VitraBookSection`/`VitraTocItem` 统一模型 | ✅ 完成 |
| `src/types/vitraPagination.ts` | `BlockMetrics`/`PageBoundary` 分页类型 | ✅ 完成 |
| `src/types/vectorRender.ts` | 向量渲染管线类型 | ✅ 完成 |
| **核心引擎** | | |
| `src/services/vitraEngine.ts` | 统一导出入口 | ✅ 完成 |
| `src/services/vitraFormatDetector.ts` | Magic Bytes 格式嗅探 | ✅ 完成 |
| `src/services/vitraBaseParser.ts` | 抽象基类 | ✅ 完成 |
| `src/services/vitraSectionSplitter.ts` | 通用 HTML 章节分割器 | ✅ 完成 |
| `src/services/vitraSectionFactory.ts` | Section → Blob URL 工厂 | ✅ 完成 |
| `src/services/vitraPipeline.ts` | 统一 open 入口 | ✅ 完成 |
| **分页引擎** | | |
| `src/services/vitraPaginator.ts` | DOM/Canvas 双策略分页算法 | ✅ 完成 |
| `src/services/vitraCanvasMeasure.ts` | Canvas 快速测量 | ✅ 完成 |
| `src/services/vitraMeasure.ts` | 离屏 DOM 测量服务 | ✅ 完成 |
| **渲染管线** | | |
| `src/services/vitraRenderPipeline.ts` | 5 阶段追踪（parse→measure→paginate→render→hydrate） | ✅ 完成 |
| `src/services/vitraVectorPlanner.ts` | 大章节向量化决策 | ✅ 完成 |
| `src/services/vitraHydration.ts` | 7 阶段渐进式水合调度 | ✅ 完成 |
| **辅助** | | |
| `src/services/readerRenderMode.ts` | 渲染模式决策（reflowable/fixed-layout） | ✅ 完成 |
| `src/utils/readerCss.ts` | CSS 注入模板 | ✅ 完成 |
| `src/utils/chapterTitleDetector.ts` | 共享章节标题检测 | ✅ 完成 |
| `src/utils/idleScheduler.ts` | requestIdleCallback 调度器 | ✅ 完成 |
| **格式 Parser** | | |
| `src/services/vitraProviderParsers.ts` | 基于旧 Provider 的桥接 Parser（EPUB/TXT/HTML/FB2/MD/MOBI/PDF） | ✅ 完成 |
| `src/services/parsers/vitraDocxParser.ts` | DOCX Parser | ✅ 完成 |
| `src/services/parsers/vitraDjvuParser.ts` | DJVU Parser（骨架） | ✅ 完成 |
| `src/services/parsers/vitraComicParser.ts` | CBZ/CBT/CBR/CB7 漫画 Parser | ✅ 完成 |

---

## 接口对比

| 维度 | 旧系统 (ContentProvider) | Vitra 引擎 (VitraBook) |
|------|--------------------------|------------------------|
| **入口** | `createContentProvider(format, data)` | `VitraPipeline.open({buffer, filename})` |
| **格式类型** | `BookFormat` (10 种) | `VitraBookFormat` (20 种，含漫画/DJVU/DOCX) |
| **章节获取** | `provider.extractChapterHtml(i): Promise<string>` | `section.load(): Promise<string>` (Blob URL) |
| **章节释放** | `provider.unloadChapter(i)` (空操作居多) | `section.unload()` (revoke Blob URL) |
| **目录** | `provider.getToc(): TocItem[]` | `book.toc: VitraTocItem[]` (递归树) |
| **搜索** | `provider.search(keyword): SearchResult[]` | ❌ 未实现 |
| **样式** | `provider.extractChapterStyles(): string[]` | ❌ 未迁移（EPUB 特有） |
| **布局方向** | 无 | `book.direction: 'ltr' \| 'rtl' \| 'auto'` |
| **页面展开** | 无 | `section.pageSpread: 'left' \| 'right' \| 'center'` |
| **封面** | 外部解析 | `book.getCover(): Promise<Blob \| null>` |
| **资源释放** | `provider.destroy()` | `book.destroy()` |

---

## 已局部接入 Vitra 的 UI 组件

以下模块虽然走旧 ContentProvider 获取章节，但已使用 Vitra 子系统：

| UI 组件 | 使用的 Vitra 模块 | 用途 |
|---------|-------------------|------|
| `PaginatedReaderView.tsx` | `vitraMeasure.startMeasure()` | 离屏 DOM 测量 + 分页 |
| `PaginatedReaderView.tsx` | `vitraPagination.PageBoundary` | 分页数据类型 |
| `ShadowRenderer.tsx` | `vitraVectorPlanner.buildVitraVectorRenderPlan()` | 大章节向量化决策 |
| `ShadowRenderer.tsx` | `readerCss.buildReaderCssTemplate()` | CSS 注入 |
| `ReaderView.tsx` | `readerRenderMode.resolveReaderRenderMode()` | 渲染模式决策 |

---

## 融合路线（待实施）

### Phase 1: ReaderView 双轨并行
- `ReaderView.tsx` 同时支持 `ContentProvider` 和 `VitraBook` 两种数据源
- 新增 `useVitraBook` hook，内部调用 `VitraPipeline.open()`
- 通过 feature flag 或格式判断决定走哪条链路

### Phase 2: PaginatedReaderView / ScrollReaderView 适配
- 章节加载从 `provider.extractChapterHtml(i)` 迁移到 `section.load()`
- Blob URL 生命周期管理（load/unload）
- TOC 从 `TocItem[]` 适配 `VitraTocItem[]`

### Phase 3: 搜索迁移
- 在 VitraBook 层实现全文搜索（或复用旧 Provider 的 search 逻辑）

### Phase 4: 移除旧系统
- 删除 `ContentProvider` 接口及所有 Provider 实现
- 删除 `contentProviderFactory.ts`
- `BookFormat` → `VitraBookFormat` 统一
