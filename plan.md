# 平滑滚动设置面板重写计划

## 目标
参照 SmoothScroll 1.2.4 的 UI 风格，推倒重写平滑滚动设置面板，全部中文。
去掉不适用于本项目的功能（开机自启、全应用默认启用），保留所有滚动参数。

## 分析
截图中 SmoothScroll 的布局结构：
- 顶部：标题 + 「启用」开关
- 中间：档案选择下拉（"Default (All Applications)"）→ 本项目简化为只显示当前配置名
- 主体：左右双栏 grid
  - **左栏**：5 行参数（label + 数值输入框），label 右对齐，输入框左对齐
  - **右栏**：4 个 checkbox（带勾选标记的开关）
- 底部：重置按钮 + 档案增删按钮

## 变更范围

### 1. ReaderView.tsx — JSX 重写（行 1266-1397）
- 删除"开机自启"checkbox 及其 `autoStartOnLogin`/`autoStartSupported`/`autoStartPending` 相关代码
- 删除"当前系统不支持开机自启控制"提示
- 重写面板布局，贴近 SmoothScroll 截图风格：
  - 顶部标题行："平滑滚动" + 右侧「启用」toggle
  - 档案行改为纯展示 "默认配置"
  - 左右双栏 grid 保持不变，但 label 改为**右对齐**风格（类似截图的 "Step size [px]" 对齐方式）
  - 右栏 checkbox：「启用缓动曲线」「反转滚轮方向」（只保留适用的 2 项，不强加不存在的功能）
  - 底部：「重置全部」按钮

### 2. ReaderView.module.css — 样式重写（行 537-701）
- 重写全部 `.smooth*` 样式类
- 仿照 SmoothScroll 截图的视觉风格：
  - 面板有明确的边框和内边距
  - 数值 label 右对齐（`text-align: right`）
  - 输入框固定宽度、居中数字
  - checkbox 使用 accent-color
  - 底部按钮区单独一行
- 保留暗色/亮色主题兼容（使用 CSS 变量）
- 保留响应式断点

### 3. ReaderView.tsx — 清理 autoStart 残留
- 删除 `autoStartOnLogin`、`autoStartSupported`、`autoStartPending` 三个 state（行 127-129）
- 删除 `toggleAutoStartOnLogin` 函数（行 183-195）
- 删除对应的 useEffect（如有初始化 autoStart 的）

## 不变更
- 设置 store（`useSettingsStore.ts`）的字段和默认值不变
- 物理引擎逻辑不变（`useScrollEvents.ts`、`useScrollInertia.ts`）
- `SMOOTH_DEFAULTS`、`clampInt`、`clampDecimal` 函数不变
- `resetSmoothSettings` 函数逻辑不变
- ScrollReaderView 的 `smoothConfig` prop 接口不变
