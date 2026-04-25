# 运行与构建规范

## 1. 目标

本文档记录项目运行、构建、测试与调试的关键入口。源码与脚本是真值；本文档负责解释职责、边界和当前已验证结果。

## 2. 顶层运行入口

当前仓库是 Vite + React + TypeScript + Electron 架构。

核心文件：

- `package.json`：脚本、依赖、Electron 主入口声明。
- `vite.config.ts`：renderer、main、preload 的 Vite / Electron 构建配置。
- `src/main.tsx`：renderer 入口，挂载 `App`。
- `src/App.tsx`：书库视图、阅读视图、WebDAV 自动同步调度和设置加载入口。
- `electron/main.ts`：Electron 主进程。
- `electron/preload.ts`：renderer 暴露的安全桥接能力。

当前脚本：

- `npm run dev`：启动 Vite 开发服务。
- `npm run dev:monitor`：同时启动开发服务与性能采样脚本。
- `npm run build`：先执行 `tsc -b`，再执行 `vite build`。
- `npm run lint`：执行 `tsc -b --pretty false`。
- `npm test` / `npm run test:ui` / `npm run test:run`：Vitest 入口。
- `npm run monitor`：执行 `scripts/monitor.js`，定期记录 CPU / 内存 / Node 进程占用到 `logs/perf-*.csv`。

## 3. 构建链路

当前已确认链路：

1. renderer 入口是 `src/main.tsx -> App`。
2. Electron 开发集成由 `vite-plugin-electron` 驱动，源入口是 `electron/main.ts` 与 `electron/preload.ts`。
3. `BrowserWindow` 加载 preload 产物 `dist-electron/preload.js`。
4. `npm run build` 输出 renderer 产物到 `dist/`，输出 main / preload 到 `dist-electron/`。
5. `package.json.main` 指向 `dist-electron/main.js`。

当前仓库没有独立安装包生成脚本。桌面壳层产物边界以 `vite-plugin-electron` 输出为准。

## 4. 当前构建验证结果

最近一次验证命令：

- `npm run build --silent`

结果：通过。

当前仍存在的构建告警：

- Vite 仍提示部分 chunk 在压缩后超过 500 kB。
- `pdf-vendor-BXAeeLSZ.js` 约 `946.90 kB`。
- `index-ZDQLdoPX.js` 约 `500.45 kB`。

当前已消失的告警：

- 未再出现 `VitraPipeline` / `VitraContentAdapter` 同时静态导入与动态导入导致分包不生效的告警。

结论：构建可用，但大 chunk 告警仍是性能治理项，不应写成已经解决。

## 5. 测试运行注意事项

Vitest 使用 Vite 配置加载测试环境。当前在受限沙箱内启动 `vitest` 时，可能触发 `esbuild` `spawn EPERM`。该现象与进程创建权限有关，不等同于测试失败。

已确认的可行方式：

- 单条测试串行执行。
- 必要时在获得授权后于沙箱外执行同一条测试命令。

已验证通过的单测记录见 `doc/05_TEST_ORACLES.md`。

## 6. 阅读相关运行时重点

### 6.1 PDF.js runtime

PDF provider 使用动态 import 加载 `pdfjs-dist` modern runtime，并在失败时降级到 `pdfjs-dist/legacy/build/pdf.mjs`。

运行约束：

- `GlobalWorkerOptions.workerSrc` 必须与打包产物兼容。
- modern / legacy runtime 切换后要保持缓存语义一致。
- PDF runtime fallback 问题优先从 provider 内部排查。

### 6.2 Worker 预处理

章节预处理使用 worker 执行消毒、样式处理、分片和向量化，并在 worker 不可用、初始化失败或超时时同步回退到主线程 core 实现。

运行约束：

- worker 打包路径必须稳定。
- worker 返回结构必须可序列化。
- 大章节预处理不应阻塞主线程首屏。

### 6.3 设置与同步启动顺序

`App` 启动时先执行 `loadPersistedSettings()`，再执行 `syncStore.loadConfig()` 和 `autoSync('startup')`。阅读器主题、排版和翻页模式已经由 `useSettingsStore` 持久化到 `db.settings`。

## 7. 调试入口

- 阅读器 UI：`src/components/Reader/`
- 滚动阅读内部调度：`src/components/Reader/scrollReader/`
- 内容适配：`src/engine/pipeline/` 与 `src/engine/parsers/providers/`
- PDF：`src/engine/parsers/providers/pdfProvider.ts`
- 样式隔离：`src/utils/styleProcessor.ts` 与 `src/engine/render/chapterPreprocess*`
- 存储与同步：`src/services/storageService.ts`、`src/stores/useSyncStore.ts`、`src/stores/syncStorePayload.ts`
- 阅读统计：`src/services/readingStatsService.ts`、`src/components/Reader/useReadingActivityTracker.ts`、`src/components/Library/ReadingStatsPanel.tsx`
- 性能采样：`scripts/monitor.js`

## 8. 发布前最少核查项

阅读引擎相关发布前至少核查：

- EPUB 可以打开。
- PDF 可以打开。
- 滚动与分页模式都可以进入。
- 阅读设置重启后仍能恢复。
- 样式没有污染宿主页面。
- 大章节没有长时间空白。
- PDF 页面缓存释放后没有持续增长的 URL 或内存占用。
- WebDAV 自动同步不会覆盖远端新版本。

## 9. 当前缺口

后续需要补齐：

- Electron 主进程 IPC 能力全表与调用方映射。
- 运行日志分类与故障排查顺序。
- worker / PDF runtime 在最终产物中的路径验证清单。
- 崩溃与性能分析工具清单。
- 固定样本集与可重复性能基线。
