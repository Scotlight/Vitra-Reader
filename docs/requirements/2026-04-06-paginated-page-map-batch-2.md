# 翻页模式逻辑页数对齐批次 2

## 目标

修复 `PaginatedReaderView` 中“视觉页数来自 `scrollWidth`，逻辑页数来自 `PageBoundary[]`”的偏差问题，避免翻页模式出现额外空白页、章节末尾停留错误页、以及后续翻页目标判断失真。

## 交付物

1. 翻页模式总页数对齐逻辑。
2. 测量完成后基于逻辑页图回写 `totalPages/currentPage` 的修复。
3. 对应测试，证明测量完成后不会再把额外视觉页当成有效页。

## 约束

- 不重写 `vitraPaginator` 算法。
- 不引入完整翻页向量化分页器。
- 不改变 `PaginatedReaderView` 对外接口。
- 修复必须兼容当前的离屏测量异步流程与中途 abort 机制。

## 验收标准

1. 当 `pageMapReadyRef.current === true` 且 `pageBoundariesRef.current.length > 0` 时，翻页模式的有效总页数以逻辑页数为准。
2. 如果当前页超出逻辑页范围，测量完成后会自动回落到有效最后一页。
3. 在“视觉页数大于逻辑页数”的场景中，右翻页会直接进入下一章，而不是停在额外空白页。
4. 相关测试通过，构建通过。

## 非目标

- 本批次不处理首次进入章节之前的临时视觉页偏差。
- 不处理跨章节分页缓存持久化。
- 不处理 PDF 专用 provider 的页面渲染策略。

## 推断与假设

1. 逻辑页数与视觉页数偏差主要出现在 CSS columns 形成的尾部空列或测量结果更精确的场景。
2. 一旦离屏测量完成，`PageBoundary[]` 比 `scrollWidth / viewportWidth` 更适合作为翻页可达页数真值。
3. 当前问题可通过页数对齐与页码回写解决，无需进入更重的分段分页重构。

## 证据锚点

- `src/components/Reader/PaginatedReaderView.tsx:307-316`
- `src/components/Reader/PaginatedReaderView.tsx:401-405`
- `src/components/Reader/PaginatedReaderView.tsx:455-463`
- `src/engine/render/vitraMeasure.ts:68-111`
