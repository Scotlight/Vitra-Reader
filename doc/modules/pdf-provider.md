# PDF Provider 模块规范

## 1. 模块范围

主要文件：

- `src/engine/parsers/providers/pdfProvider.ts`

## 2. 模块职责

PDF provider 负责：

- 加载 PDF.js runtime
- 打开 PDF 文档
- 将每页转换为可展示 HTML
- 管理页面缓存与图像 URL
- 提取 PDF 内部链接
- 向上暴露统一 `ContentProvider` 接口

## 3. 当前已知关键机制

### 3.1 runtime 双轨加载

源码已确认：

- `getPdfRuntime(forceLegacy)` 负责 modern / legacy runtime 选择与缓存：`src/engine/parsers/providers/pdfProvider.ts:37-66`
- `shouldFallbackToLegacy()` 负责识别需要降级的错误：`src/engine/parsers/providers/pdfProvider.ts:68-85`
- `loadPdfDocument()` 在命中可降级错误时会重试 legacy：`src/engine/parsers/providers/pdfProvider.ts:87-109`

当前行为：

- 优先 modern runtime
- 已知错误下切换到 legacy runtime
- 一旦升级到全局 legacy，后续新文档继续沿用 legacy

### 3.2 页面三层合成

源码已确认：

- `renderPdfPage()` 负责单页渲染：`src/engine/parsers/providers/pdfProvider.ts:295-318`
- `canvasToImageUrl()` 负责把 canvas 转成 JPEG Blob URL：`src/engine/parsers/providers/pdfProvider.ts:320-438`
- `renderPdfPageHtml()` 负责页面 HTML 三层合成：`src/engine/parsers/providers/pdfProvider.ts:440-460`

每页由以下三层构成：

- 像素层：canvas 渲染后转为 JPEG Blob URL
- 文字层：当前禁用
- 链接层：绝对定位 `<a>` 叠加

### 3.3 页面缓存

源码已确认缓存包括：

- `pageHtmlCache`：`src/engine/parsers/providers/pdfProvider.ts:112,189,211,225,232,235`
- `pageImageUrlCache`：`src/engine/parsers/providers/pdfProvider.ts:113,142-145,202,235`

并且相邻页存在预热逻辑：`src/engine/parsers/providers/pdfProvider.ts:225-241`

### 3.4 生命周期

源码已确认：

- `init()` 打开文档并在成功后释放外部 data 引用：`src/engine/parsers/providers/pdfProvider.ts:121-137`
- `clearPageCaches()` 负责清空 HTML 缓存并 `revokeObjectURL`：`src/engine/parsers/providers/pdfProvider.ts:140-146`
- `reopenLegacyDocument()` 会先清缓存、销毁旧文档，再以 legacy 重开：`src/engine/parsers/providers/pdfProvider.ts:148-158`
- `destroy()` 最终清缓存并销毁 `doc`：`src/engine/parsers/providers/pdfProvider.ts:160-164`

## 4. 修改约束

- 不得让 Blob URL 缺少回收路径
- 不得把 legacy fallback 做成无限重试
- 不得把 PDF 特有错误处理扩散到 UI 层
- 不得在未验证性能前重新启用 text layer

## 5. 高风险点

- `getPdfRuntime()` runtime 选择与缓存
- `shouldFallbackToLegacy()` 错误识别范围
- `renderPdfPage()` 中 canvas 生命周期
- `canvasToImageUrl()` 的编码策略
- 链接提取和坐标转换对齐
- `renderPdfPageHtml()` 的层叠结构

## 6. 验收重点

修改后必须确认：

- PDF 可正常打开
- 多页渲染无空白
- 链接点击位置准确
- destroy 后资源被释放
- 大 PDF 不出现明显内存恶化

## 7. 已确认的脆弱点

### 7.1 init 后 fallback 恢复能力需要重点验证

当前模块具备运行时 fallback 设计，但初始化完成后会释放原始 `ArrayBuffer` 持有。结合当前实现与既有引擎指南，这意味着“初始化之后再触发 legacy 重开”属于脆弱区域。

后续若修改以下路径，必须重点验证：

- `search()` 异常后的 fallback：`src/engine/parsers/providers/pdfProvider.ts:245-269`
- `renderPdfPage()` 与页面缓存复用：`src/engine/parsers/providers/pdfProvider.ts:295-318`
- `renderPdfPageHtml()` 页面三层合成：`src/engine/parsers/providers/pdfProvider.ts:440-460`

在未专门补强前，不应把 post-init fallback 当作完全可靠保证。

## 8. 对应 ADR

- `../adr/0001-pdf-runtime-fallback.md`
- `../adr/0002-disable-pdf-text-layer.md`
- `../adr/0003-jpeg-render-strategy.md`
