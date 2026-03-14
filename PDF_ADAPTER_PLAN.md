# PDF 适配计划（三项）

## 改动文件

### 1. src/types/pdfjs.d.ts
扩展 `PdfTextItem` 接口，加入坐标字段：
```ts
export interface PdfTextItem {
    str: string
    transform: number[]   // [scaleX, skewX, skewY, scaleY, translateX, translateY]
    width: number
    height: number
    fontName?: string
    dir?: string
}
```

### 2. src/engine/parsers/providers/pdfProvider.ts

**a) 渲染分辨率适配 DPR**
- 删除 `const PDF_RENDER_SCALE = 1.8`
- 新增 `getPdfRenderScale()` 函数

**b) img 加入实际宽高属性**
- `RenderedPdfPage` 接口加 `pageWidthPx; pageHeightPx`
- `renderPdfPageHtml` 生成带 width/height 属性的 img

**c) 文字层 HTML 生成**
- 新增 `renderPdfTextLayer()` 函数
- 并行调用 page.render 和 renderPdfTextLayer

---

## 实现顺序
1. 扩展 PdfTextItem 类型
2. 修改 pdfProvider.ts
3. npm run lint
4. npm run test:run
