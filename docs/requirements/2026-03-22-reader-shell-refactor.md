# Reader Shell Refactor

## 背景

根据 `doc/00_PROJECT_OVERVIEW.md`、`doc/01_ARCHITECTURE.md`、`doc/modules/reader-ui.md` 与 `docs/VITRA_CORE_ENGINE_GUIDE.md`，阅读器层应维持明确分层：

- `ReaderView` 负责阅读器入口、模式决策与壳层 UI
- `ScrollReaderView` / `PaginatedReaderView` 负责具体阅读模式渲染
- Provider / Adapter 负责格式差异收敛

当前 `src/components/Reader/ReaderView.tsx` 已膨胀到千行级，混杂了：

- 书籍会话初始化
- TOC 纯函数与 href 归一化
- 跳转 / 搜索 / 面板互斥命令
- 右侧设置面板专用辅助逻辑

这使入口组件承担了过多非壳层职责，削弱了可维护性。

## 目标

在不改变阅读器外部行为的前提下，先完成入口层的职责收口：

1. 抽离书籍会话初始化逻辑到独立 hook
2. 抽离 TOC 归一化与章节匹配纯函数到 utils
3. 抽离跳转 / 搜索 / 面板互斥命令到独立 hook
4. 清理 ReaderView 中只写不读的残留 ref

## 验收标准

- `ReaderView` 不再直接创建 `VitraPipeline` / `VitraContentAdapter`
- `ReaderView` 不再内联 `buildFallbackTocFromSpine`、href 匹配等纯函数
- `ReaderView` 不再内联 jump / toc / search / jumpTarget 编排逻辑
- `npm run lint` 通过

## 非目标

- 本轮不重写 `ScrollReaderView` 的 hydration / preload / unload 逻辑
- 本轮不改 PDF Provider、MOBI Parser 或缓存策略
- 本轮不新增二次状态容器
