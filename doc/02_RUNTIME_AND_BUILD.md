# 运行与构建规范

## 1. 目标

本文档记录项目运行、构建与调试所依赖的关键入口与边界。源码与脚本文件是真值，本文档负责解释其职责与风险。

## 2. 当前已确认的顶层运行文件

仓库根目录可见：

- `package.json`
- `vite.config.ts`
- `tsconfig.json`
- `index.html`
- `electron/`
- `dist/`
- `dist-electron/`

根据源码可确认：

- `package.json:7-16` 定义了 `dev`、`build`、`preview`、`lint`、`test`、`test:ui`、`test:run`、`monitor`
- `package.json:6` 指定 Electron 主入口产物为 `dist-electron/main.js`
- `vite.config.ts:15-41` 使用 `@vitejs/plugin-react`、`vite-plugin-electron`、`vite-plugin-electron-renderer`
- `vite.config.ts:20,29` 指定 Electron 源入口为 `electron/main.ts` 与 `electron/preload.ts`

说明：

- 项目当前明确是 Vite + React + TypeScript + Electron 架构
- 前端渲染与桌面壳层存在明确分层
- 实际脚本命令、打包流程与 dev/prod 差异以 `package.json` 和 `vite.config.ts` 为准

## 3. 构建链路边界

当前已确认链路：

1. `npm run dev` 直接启动 Vite dev server：`package.json:8`
2. Electron 开发集成由 `vite-plugin-electron` 驱动，主进程入口是 `electron/main.ts`，preload 入口是 `electron/preload.ts`：`vite.config.ts:15-40`
3. renderer 端入口是 `src/main.tsx -> App`：`src/main.tsx:1-11`
4. Electron 窗口通过 `BrowserWindow` 加载 preload 产物 `dist-electron/preload.js`：`electron/main.ts:132-148`
5. `npm run build` 先执行 `tsc -b`，再执行 `vite build`：`package.json:10`
6. Vite 构建会把 renderer 产物输出到 `dist/`，并把 main / preload 输出到 `dist-electron/`：`vite.config.ts:21-37,52-92`
7. `package.json.main` 指向最终桌面入口 `dist-electron/main.js`：`package.json:6`

补充说明：

- 当前仓库没有独立 `package`/`dist` 打包脚本，桌面壳层构建以 `vite-plugin-electron` 的 main/preload 输出为准：`package.json:7-16`
- preload 注入范围以 `contextBridge.exposeInMainWorld('electronAPI', ...)` 为准：`electron/preload.ts:1-11`
- 监控脚本 `npm run monitor` 会调用 `scripts/monitor.js`，每 2 秒记录 CPU / 内存 / Node 进程占用到 `logs/perf-*.csv`：`package.json:16`, `scripts/monitor.js:7-29,113-176`

## 4. 阅读相关运行时重点

### 4.1 PDF.js runtime

PDF provider 使用动态 import 加载 `pdfjs-dist` modern runtime，并在失败时降级到 `pdfjs-dist/legacy/build/pdf.mjs`。

运行约束：

- `GlobalWorkerOptions.workerSrc` 必须与打包产物兼容
- modern/legacy runtime 切换后要确保缓存语义一致
- runtime fallback 问题优先从 provider 内部排查

### 4.2 Worker 预处理

章节预处理使用独立 worker 完成消毒、样式处理与分片/向量化。

运行约束：

- worker 打包路径必须稳定
- worker 返回数据结构需可序列化
- 大章节预处理不应阻塞主线程首屏

## 5. 调试建议

当前建议按以下维度调试：

- 阅读器 UI：查看 `src/components/Reader/`
- 内容适配：查看 `src/engine/pipeline/` 与 `src/engine/parsers/providers/`
- PDF 问题：优先查看 `src/engine/parsers/providers/pdfProvider.ts`
- 样式污染：查看 `src/utils/styleProcessor.ts` 与 preprocess 相关逻辑
- 缓存问题：查看 `src/engine/cache/`

## 6. 发布前最少核查项

在进行与阅读引擎相关的发布前，至少核查：

- 能否打开 EPUB
- 能否打开 PDF
- 滚动与分页模式是否都能正常进入
- 样式是否出现宿主页面污染
- 大章节是否触发异常卡顿或空白
- PDF 页面缓存释放后是否有残留 URL/内存问题

## 7. 当前缺口

若要把本文档提升为完全可执行的运行手册，当前剩余重点是：

- Electron 主进程 IPC 能力全表与调用方映射
- 运行日志分类与故障排查顺序
- worker / PDF runtime 在最终产物中的路径验证清单
- 崩溃与性能分析工具清单
