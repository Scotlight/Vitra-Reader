# ADR-0003：PDF 页面采用 JPEG Blob URL 而非 PNG / Data URL

## 状态

已采用

## 背景

PDF 页面经 canvas 光栅化后，需要转换为可嵌入页面的图像资源。候选方案包括：

- PNG
- JPEG
- Data URL
- Blob URL

## 决策

- 页面导出优先使用 JPEG
- 资源承载优先使用 Blob URL
- `toBlob()` 优先，`toDataURL()` 仅作为 fallback

## 原因

- JPEG 编码更快，体积更小
- 多数 PDF 页面不依赖透明通道
- Blob URL 避免 base64 膨胀
- 有利于降低大文档页面缓存成本

## 影响

正向：

- 页面生成更快
- 内存与传输体积更低
- 更适合多页 PDF 阅读场景

代价：

- 需要显式管理 Blob URL 生命周期
- 对极端图像质量诉求需谨慎调节质量参数

## 后续约束

- 修改编码格式或质量参数必须进行视觉与性能双验证
- 若切换为 PNG 或其他格式，需更新模块文档和本 ADR
