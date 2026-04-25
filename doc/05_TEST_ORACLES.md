# 测试与验收基线

## 1. 目标

本文档定义修改后如何判断没有破坏阅读器核心能力。当前仓库中的测试、脚本和最近一次验证结果是真值；本文档给出最小验收框架。

## 2. 自动化测试入口

脚本入口：

- `npm test`
- `npm run test:ui`
- `npm run test:run`
- `npm run build`
- `npm run lint`

Vitest 配置：

- 测试环境：`jsdom`。
- setup 文件：`src/test/setup.ts`。
- 匹配范围：`src/**/*.{test,spec}.{ts,tsx}`。

性能采样：

- `npm run monitor` 调用 `scripts/monitor.js`。
- 默认每 2 秒记录 CPU / 内存 / Node 进程占用。
- 输出到 `logs/perf-*.csv`。

## 3. 当前测试文件矩阵

当前 `src/test/` 中已确认的代表性测试：

- `bookGridVirtualFlow.test.tsx`
- `chapterPreprocessCore.test.ts`
- `chapterPreprocessService.test.ts`
- `chapterTitleDetector.test.ts`
- `contentProvider.test.ts`
- `contentSanitizer.test.ts`
- `fontFallback.test.ts`
- `groupManagerState.test.ts`
- `htmlSaxStream.test.ts`
- `libraryVirtualGrid.test.ts`
- `mathUtils.test.ts`
- `metaVectorManager.test.ts`
- `mobiTextDecoding.test.ts`
- `paginatedChapterJump.test.ts`
- `paginatedChapterLoad.test.ts`
- `paginatedMeasureCache.test.ts`
- `paginatedProgress.test.ts`
- `paginatedReaderFlow.test.tsx`
- `pdfContentProvider.test.ts`
- `pdfPageRenderer.test.ts`
- `readingStatsService.test.ts`
- `scrollChapterFetch.test.ts`
- `scrollChapterJump.test.ts`
- `scrollChapterLoad.test.ts`
- `scrollChapterRerender.test.ts`
- `scrollChapterViewport.test.ts`
- `scrollReaderVectorFlow.test.tsx`
- `scrollSelectionState.test.ts`
- `scrollVectorStrategy.test.ts`
- `styleProcessor.test.ts`
- `textFinder.test.ts`
- `vitraCanvasMeasure.test.ts`
- `vitraPaginator.test.ts`
- `vitraPipeline.test.ts`
- `vitraPosition.test.ts`
- `vitraRenderPipeline.test.ts`

覆盖范围：

- 格式检测与文件名规范。
- 内容消毒与样式作用域隔离。
- 章节预处理 core / worker service / fallback。
- VitraPipeline 预览与 warmup 降级。
- PDF provider、页面渲染、Blob 生命周期。
- 滚动与分页阅读核心流程。
- 向量化、分页、定位与测量工具链。
- 书库虚拟列表与分组状态。
- 阅读统计纯函数。
- 滚动选区状态解析。
- 文本查找与高亮恢复。

## 4. 当前自动化边界

已经覆盖：

- 纯函数和工具链。
- 章节预处理服务。
- PDF provider 的关键行为。
- 滚动/分页阅读的关键组件流。
- 书库虚拟列表与分组状态。
- 阅读统计日期、保留期、时长格式和剩余时间估算。

仍未形成完整自动化闭环：

- `App` 顶层启动、设置加载与 WebDAV 自动同步调度。
- `useReaderBookSession` 的真 Dexie 装配链路。
- WebDAV 同步、恢复、冲突和 payload 过滤。
- 翻译配置 safeStorage 与 provider 调用。
- 固定样本文件驱动的真实 EPUB/PDF/MOBI/DOCX/漫画端到端回归。

## 5. 当前验证记录

最近一次已执行验证：

- `npm run build --silent`：通过。
- `npx vitest run src/test/readingStatsService.test.ts`：通过，4 个用例通过；沙箱内曾遇到 `esbuild spawn EPERM`，授权到沙箱外重试后通过。
- `npx vitest run src/test/scrollChapterFetch.test.ts`：通过，4 个用例通过。
- `npx vitest run src/test/scrollSelectionState.test.ts`：通过，4 个用例通过；沙箱内曾遇到 `esbuild spawn EPERM`，授权到沙箱外重试后通过。

当前构建告警：

- 仍有压缩后超过 500 kB 的 chunk。
- `pdf-vendor-BXAeeLSZ.js` 约 `946.90 kB`。
- `index-ZDQLdoPX.js` 约 `500.45 kB`。
- 未再出现 `VitraPipeline` / `VitraContentAdapter` 的 dynamic import 冲突告警。

运行注意事项：

- 在受限沙箱内启动 Vitest 时，可能触发 `esbuild spawn EPERM`。后续测试优先串行执行。
- 历史已知边界：`scrollChapterFetch.test.ts` 与 `scrollReaderVectorFlow.test.tsx` 联合执行时可能触发 Node OOM；除非正在处理该问题，不建议把它们作为普通快速回归组合。

## 6. 最小人工回归集合

阅读器核心链路修改后，至少验证：

### 6.1 格式打开

- 可以打开至少一本 EPUB。
- 可以打开至少一本 PDF。
- 涉及 MOBI/TXT 解析时，额外验证对应格式。
- 涉及 DOCX 或漫画归档时，额外验证封面、目录和翻页入口。

### 6.2 阅读模式

- 滚动模式可以正常进入。
- 分页模式可以正常进入。
- 模式切换后内容、定位和样式没有明显异常。

### 6.3 渲染正确性

- 内容没有整章空白。
- 样式没有泄漏到宿主 UI。
- 大章节没有长时间白屏。
- PDF 页面清晰度与加载速度仍在可接受范围内。

### 6.4 交互正确性

- TOC 跳转正常。
- PDF 内部链接可跳转。
- 搜索功能在受影响格式上可用。
- 选区菜单、高亮、翻译入口可用。

### 6.5 资源释放

- 切换文档后没有明显残留页面。
- PDF 页面 URL 不持续增长。
- 大文档关闭后内存没有明显不可回落现象。

## 7. 高风险改动对应专项核查

### 7.1 改 `pdfProvider.ts`

必须核查：

- PDF 是否能打开。
- fallback 到 legacy 后是否仍可打开文档。
- 页面图像与链接层是否对齐。
- destroy 后缓存是否释放。

### 7.2 改 `ShadowRenderer.tsx`

必须核查：

- 滚动模式首屏是否正常。
- 大章节 placeholder / hydrate 是否正常。
- 分页模式是否被连带破坏。
- 样式注入顺序是否仍正确。

### 7.3 改 `chapterPreprocess*`

必须核查：

- 消毒后内容没有丢失关键节点。
- style scope 仍生效。
- 大章节分片与 segment metas 合理。
- worker 路径与同步 fallback 都可用。

### 7.4 改缓存层

必须核查：

- 缓存命中不改变功能结果。
- 清理逻辑不会误删仍在使用的资源。
- 持久缓存失效时能回退到重新解析。

### 7.5 改存储 / 设置 / 同步 / 翻译

必须核查：

- Dexie 升级后老库仍可打开。
- `readingStatsDaily` 表结构与同步 payload 一致。
- `useSettingsStore` 能保存并恢复 `readerSettings` / `savedColors`。
- WebDAV 密码仍保持 session-only。
- 上传 payload 过滤 `translateConfig`、WebDAV 敏感键、`vcache-`、`tcache:`。
- ETag 冲突时拒绝覆盖。
- `restoreData()` 在 `replaceBeforeRestore` 不同取值下符合预期。
- 翻译配置 API key 经过 safeStorage。
- 翻译结果进入 `translationCache`，并遵守 TTL / `lastAccessAt` 清理。

## 8. 推荐固定样本集

后续建议建立固定样本目录：

- 小型 EPUB。
- 大章节 EPUB。
- 复杂 CSS EPUB。
- 大体积 PDF。
- 带内部链接的 PDF。
- 异常编码 TXT / MOBI。
- DOCX。
- CBZ/CBR/CB7 漫画归档。

当前仓库未确认存在正式回归样本集，因此真实格式验收仍依赖人工打开样本。

## 9. 推荐自动化补齐方向

优先补：

- `storageService.ts` 的 Dexie 升级回归。
- `syncStorePayload.ts` 的敏感键过滤、缓存前缀过滤、readingStatsDaily payload 回归。
- `useSyncStore.ts` 的 ETag 冲突与恢复覆盖回归。
- `useSettingsStore.ts` 的持久化回归。
- `translateService.ts` 的 safeStorage 包装与 translationCache TTL 回归。
- `useReaderBookSession.ts` 的真库装配与 provider 销毁测试。
- 搜索索引与资源会话释放回归。
- 固定样本文件驱动的端到端测试。
