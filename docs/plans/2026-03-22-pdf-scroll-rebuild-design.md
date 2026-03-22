# PDF 连续滚动重建设计

- 日期：`2026-03-22`
- 主题：`pdf-scroll-rebuild`

## 设计结论

本次重构采用“保留 `pdfjs-dist` 内核，重建外围 PDF 阅读层”的方案。

不保留当前单文件 `pdfProvider.ts` 的实现堆积方式；改为拆成专用文件夹，按职责拆分为：runtime、导航、页面渲染、HTML 组装、provider 主体与元数据解析。

## 核心原则

1. `pdfjs-dist` 只负责文档打开、页面获取、文本提取、注释解析与 canvas 渲染
2. PDF 阅读器层职责由本项目自己维护，不把模式决策和阅读器接线混在 provider 内
3. PDF 是固定版式文档，但阅读交互仅支持连续滚动；“固定版式”与“分页视图”不再强绑定
4. 搜索能力必须适配当前 `VitraContentAdapter` 的 HTML 索引机制，不能只留在 provider 内部未接线的异步搜索函数里

## 模块边界

### `pdfRuntime.ts`
- 管理 modern / legacy runtime 加载
- 管理打开文档与可恢复错误下的 legacy 升级

### `pdfNavigation.ts`
- 负责 outline 解析
- 负责 annotation link → 目标页映射
- 负责坐标换算

### `pdfPageRenderer.ts`
- 负责单页 canvas 渲染
- 负责提取文本内容
- 负责提取页面链接
- 输出统一页面渲染结果

### `pdfPageHtml.ts`
- 负责把页面渲染结果组装为 HTML
- 图像层保持可视渲染
- 链接层保持跳转能力
- 隐藏文本层用于搜索索引，不参与可视排版

### `pdfContentProvider.ts`
- 实现 `ContentProvider`
- 管理文档生命周期、页面缓存、邻页预渲染、目录、搜索与元数据桥接

### `pdfProvider.ts`
- 仅作为兼容导出入口

## 模式策略

在 `readerRenderMode.ts` 中为 PDF 定义“仅连续滚动”模式集合，而不是继续归入“固定布局=只能单页分页”的旧规则。

其他固定布局格式维持原状，避免扩大修改面。

## 搜索策略

当前 `ReaderView` 实际搜索链路走 `VitraContentAdapter -> searchIndexCache`，不是直接调用 `PdfContentProvider.search()`。

因此本次重建会把每页提取出的纯文本以隐藏文本层写回页面 HTML，让现有 HTML 索引链自然获得 PDF 搜索能力；同时保留 provider 内部逐页文本搜索实现，作为 PDF 专属能力的完整保留。

## 兼容性策略

- 保留 `contentProviderFactory.ts` 的导入路径不变
- 保留 `data-pdf-page` 跳转协议不变
- 保留 PDF 暗色模式在 UI 层处理的现状，不把视觉反相逻辑塞进 provider
