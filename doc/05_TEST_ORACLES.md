# 测试与验收基线

## 1. 目标

本文档用于定义“改完后如何判断没有破坏阅读器核心能力”。当前仓库中的测试与脚本是真值，本文档给出最小验收框架。

## 1.5 当前已确认的自动化测试入口

根据源码可确认：

- 测试命令：`package.json:13-15`
  - `npm test`
  - `npm run test:ui`
  - `npm run test:run`
- Vitest 配置：`vite.config.ts:8-14`
  - `environment: 'jsdom'`
  - `setupFiles: ['./src/test/setup.ts']`
  - `include: ['src/**/*.{test,spec}.{ts,tsx}']`
- 性能采样脚本：`scripts/monitor.js:7-25,118-164`
  - 每 2 秒记录一次 CPU / 内存 / Node 进程占用
  - 输出到 `logs/perf-*.csv`

当前仓库已存在的代表性测试文件包括：

- `src/test/contentProvider.test.ts`
- `src/test/contentSanitizer.test.ts`
- `src/test/styleProcessor.test.ts`
- `src/test/vitraRenderPipeline.test.ts`
- `src/test/vitraPaginator.test.ts`
- `src/test/vitraPosition.test.ts`
- `src/test/textFinder.test.ts`
- `src/test/htmlSaxStream.test.ts`
- `src/test/chapterTitleDetector.test.ts`
- `src/test/fontFallback.test.ts`
- `src/test/mathUtils.test.ts`

这说明当前自动化基线主要集中在：

- 格式检测
- 内容消毒
- 样式处理
- 渲染管线顺序与 trace
- 分页/定位工具链
- 文本查找能力

## 1.6 当前测试样本矩阵

按当前 `src/test/` 可确认：

### 1.6.1 格式识别与文件名规范

- `contentProvider.test.ts` 覆盖扩展名识别、magic bytes 优先级、大小写兼容与 `stripBookExtension()`：`src/test/contentProvider.test.ts:4-59`

### 1.6.2 内容安全与样式预处理

- `contentSanitizer.test.ts` 覆盖 `escapeHtml*` 与 `sanitizeUrlValue()`，验证 `javascript:` / `vbscript:` / 非图片 `data:` 被拦截，`#` / `blob:` / `vitra-res:` 保留：`src/test/contentSanitizer.test.ts:8-70`
- `styleProcessor.test.ts` 覆盖 selector scope、`:root/body` 替换、`@font-face` / `@keyframes` 豁免、`@media/@supports` 递归、`extractStyles()` / `removeStyleTags()` 与阅读模式 CSS override：`src/test/styleProcessor.test.ts:13-120`
- `htmlSaxStream.test.ts` 覆盖块边界检测、媒体标签偏移、属性容错与 `consumeMediaOffsetInRange()`：`src/test/htmlSaxStream.test.ts:4-108`

### 1.6.3 定位、搜索与高亮恢复

- `vitraPosition.test.ts` 覆盖 DOM 路径序列化、精确恢复、模糊回退与偏移夹紧：`src/test/vitraPosition.test.ts:15-101`
- `textFinder.test.ts` 覆盖单节点/跨节点查找、跨段匹配、高亮创建/移除，以及水合后高亮恢复：`src/test/textFinder.test.ts:22-137`

### 1.6.4 分页与渲染阶段约束

- `vitraPaginator.test.ts` 覆盖分页边界、不可分割块换页、超大块切分与极小视口容错：`src/test/vitraPaginator.test.ts:9-60`
- `vitraRenderPipeline.test.ts` 覆盖五阶段顺序、重复阶段报错、异常仍记 timing、`finalize` 完整性约束与 trace 格式化：`src/test/vitraRenderPipeline.test.ts:9-67`

### 1.6.5 标题检测与基础工具

- `chapterTitleDetector.test.ts` 覆盖标题归一化、中英文章节标题识别与排除规则：`src/test/chapterTitleDetector.test.ts:4-84`
- `fontFallback.test.ts` 覆盖字体回退栈去重、顺序保持与 `sans-serif` 兜底：`src/test/fontFallback.test.ts:4-42`
- `mathUtils.test.ts` 覆盖 `clampNumber` / `clampInt` / `clampDecimal` 的边界行为：`src/test/mathUtils.test.ts:5-21`

### 1.6.6 当前自动化边界

- 当前自动化测试主体仍是纯函数、预处理、分页/定位和渲染辅助工具。
- `ReaderView` 打开链路、`App` 顶层调度、PDF 页面 HTML 合成、Dexie/WebDAV/翻译配置持久化仍主要依赖人工回归与后续专项补测：`src/components/Reader/ReaderView.tsx`, `src/App.tsx`, `src/engine/parsers/providers/pdfProvider.ts`, `src/services/storageService.ts`, `src/stores/useSyncStore.ts`, `src/services/translateService.ts`

## 2. 最小人工回归集合

每次修改阅读器核心链路后，至少验证以下场景：

### 2.1 格式打开

- 能打开至少一本 EPUB
- 能打开至少一本 PDF
- 若涉及 MOBI/TXT 解析，额外验证对应格式

### 2.2 阅读模式

- 滚动模式可正常进入
- 分页模式可正常进入
- 模式切换后内容、定位和样式未明显异常

### 2.3 渲染正确性

- 内容未出现整章空白
- 样式未明显泄漏到宿主 UI
- 大章节未出现严重卡顿或长时间白屏
- PDF 页面清晰度与加载速度仍在可接受范围

### 2.4 交互正确性

- 目录跳转正常
- PDF 内部链接可跳转
- 搜索功能在受影响格式上可用

### 2.5 资源释放

- 切换文档后无明显残留页面
- PDF 页面 URL 不持续增长
- 大文档关闭后内存无明显不可回落现象

## 3. 高风险改动对应专项核查

### 3.1 改 `pdfProvider.ts`

必须核查：

- PDF 是否能打开
- fallback 到 legacy 后是否仍可继续打开文档
- 页面图像与链接层是否仍对齐
- destroy 后缓存是否被释放

### 3.2 改 `ShadowRenderer.tsx`

必须核查：

- 滚动模式首屏是否正常
- 大章节 placeholder/hydrate 是否正常
- 分页模式是否被连带破坏
- 样式注入是否仍正确

### 3.3 改 `chapterPreprocess*`

必须核查：

- 消毒后内容未丢失关键节点
- style scope 仍生效
- 大章节分片与 segment metas 合理

### 3.4 改缓存层

必须核查：

- 缓存命中不改变功能结果
- 清理逻辑不会误删仍在使用的资源
- 持久缓存失效时能回退到重新解析

### 3.5 改 `storageService.ts` / `useSyncStore.ts` / `translateService.ts`

必须核查：

- Dexie 升级后老库是否仍可打开，历史字段是否被正确补齐：`src/services/storageService.ts:88-124`
- WebDAV 配置加载后 `webdavPass` 是否仍保持 session-only：`src/stores/useSyncStore.ts:378-400`
- 上传 payload 是否仍过滤 `translateConfig` 与 WebDAV 敏感键：`src/stores/useSyncStore.ts:63-69,130-149`
- ETag 冲突时是否拒绝覆盖：`src/stores/useSyncStore.ts:166-212,444-450`
- `restoreData()` 在 `replaceBeforeRestore` 不同取值下是否符合预期：`src/stores/useSyncStore.ts:214-258,469-498`
- 翻译配置保存后 API key 是否经过 `safeStorage`，翻译结果是否正确进入 `translationCache`：`src/services/translateService.ts:5-31,161-174,197-240,570-667`

## 4. 推荐样本集

当前建议建立固定样本目录，用于长期回归：

- 小型 EPUB
- 大章节 EPUB
- 带复杂 CSS 的 EPUB
- 大体积 PDF
- 带内部链接的 PDF
- 异常编码文本或 MOBI

当前已核实：仓库中未发现主项目自带的正式 EPUB/PDF/MOBI/AZW3/FB2/CBZ 回归样本，因此当前验收仍主要依赖手工打开真实书籍验证，而不是固定样本集自动回归。

## 5. 推荐自动化方向

如果后续要把本文档提升为更强的“可执行规范”，建议增加：

- `ContentProvider` 契约测试
- PDF 单页 HTML 输出结构断言
- style scope 结果快照测试
- preprocess 输出快照测试
- 大章节渲染基线样本
- `storageService.ts` 的 Dexie 升级回归测试
- `useSyncStore.ts` 的敏感键过滤 / ETag 冲突 / 恢复覆盖测试
- `translateService.ts` 的 `safeStorage` 包装与 `translationCache` TTL 测试

## 6. 当前缺口

当前仍需补齐：

- 存储/同步链路自动化测试（`storageService.ts`、`useSyncStore.ts`）
- 持久缓存与翻译缓存回归（`vitraBookCache.ts`、`translateService.ts`）
- 搜索索引与资源会话释放回归（`searchIndexCache.ts`、`assetLoader.ts`、`vitraContentAdapter.ts`）
- 样本文件真实路径
- 可重复的性能基线数据
- 日志与 profiling 采集方法
- 端到端测试与 CI 流水线规范
