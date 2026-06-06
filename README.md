# Vitra Reader

[中文](./README.md) | [English](./README.en.md)

Vitra Reader 是一款桌面电子书阅读器，强调本地优先、阅读体验和可控同步。
项目基于 Electron + React + TypeScript 构建，当前以 Windows 作为主要开发平台。

## 许可说明

- 本项目采用 `GNU AGPL-3.0-only` 许可，是 OSI 认可的自由开源许可。
- 你可以自由使用、修改和分发本项目，包括商业用途。
- 但任何衍生作品，以及通过网络对外提供服务的部署，都必须以 AGPL-3.0 公开完整对应源代码。
- 详见 [LICENSE](./LICENSE)。

![Vitra Reader 主界面](./docs/showcase-main.png)

---

## 项目定位

- 本地优先：书籍文件、阅读进度、标注与设置保存在本地。
- 阅读优先：围绕排版、翻页、检索和沉浸式阅读体验设计。
- 可控同步：通过 WebDAV 在私有云或自建服务上进行备份与恢复。
- 可扩展管线：围绕 Vitra Pipeline 持续扩展多格式解析与统一渲染能力。

---

## 核心优势

- 数据归属清晰：不依赖账号体系，默认本地保存，离线场景可持续阅读。
- 同步可控：基于 WebDAV 连接私有云或自建服务，避免被单一平台绑定。
- 阅读体验可调：主题、字体、排版、亮度和阅读模式可按个人习惯细粒度设置。
- 渲染路径面向大文档：采用 `ShadowRenderer + 虚拟化 + rAF`，重点优化长文滚动与交互稳定性。
- 架构可扩展：以统一管线承载多格式解析与渲染，便于后续持续扩容格式支持。

---

## 用户价值

- 上手路径简洁：安装后导入书籍即可阅读，不依赖注册与云端绑定。
- 数据迁移清晰：通过 WebDAV 进行备份与恢复，跨设备迁移流程更直接。
- 长期使用稳定：围绕“本地可用、同步可选、样式可调”形成日常阅读闭环。
- 功能闭环完整：书库与分组、目录导航、全文检索、标注笔记、翻译、阅读统计、进度管理统一在同一产品内。
- 迭代方向明确：朗读增强、词典与大文件性能优化持续推进。

---

## 核心能力

### 1) 书库与导入

- 导入多种格式书籍并解析元数据（书名、作者、封面）。
- 支持搜索、排序、分组管理与阅读进度展示。
- 提供常见书籍操作：收藏、加入分组、移入回收站、恢复、永久删除。

### 2) 阅读器

- 多格式正文经 Vitra Pipeline 统一为 `ContentProvider` 接口（EPUB 内部基于 `epub.js`），再统一交给 `ShadowRenderer` 渲染。
- 默认沉浸式全屏阅读界面；支持三种阅读模式：单页翻页 / 双页翻页 / 连续滚动。
- 支持目录导航、全文检索与结果跳转。
- 支持键盘导航（Arrow / PageUp / PageDown）。
- 提供文本选择菜单（复制、高亮、笔记、站内搜索、网络搜索、朗读、翻译）。

### 3) 阅读样式

- 支持系统字体选择。
- 支持字号、行高、字距、段距、页宽、亮度等排版参数。
- 支持文本对齐（左对齐、两端对齐、居中）。
- 支持主题与前景色/背景色自定义。

### 4) 翻译与朗读

- 划词翻译，支持多引擎：OpenAI 兼容（含 Gemini / Ollama 等兼容端点）、DeepL、DeepLX。
- 翻译请求经主进程转发，API Key 与端点在本地配置。
- 朗读基于系统语音合成（Web Speech），可从选择菜单一键朗读。

### 5) 阅读统计

- 跟踪阅读时长与活跃度，按书籍 / 时段汇总。
- 提供独立的阅读统计面板。

### 6) 同步与恢复

- 支持 WebDAV 连接测试。
- 支持上传同步与下载恢复。
- 支持同步模式（完整 / 仅数据 / 仅文件）。
- 支持恢复模式（自动 / 完整 / 仅数据 / 仅文件）。
- 支持自动同步流程（启动拉取 + 周期同步 + 退出前同步）。

### 7) 渲染与性能

- 阅读页面采用 `ShadowRenderer + 虚拟化 + rAF` 的渲染策略。
- EPUB 资源通过会话级 Blob URL 映射，降低 `ERR_FILE_NOT_FOUND` 风险。
- 大体积文档处理优先保证 UI 响应性，持续优化解析与渲染路径。

---

## 支持格式

- 文本 / 文档：`EPUB` `PDF` `TXT` `MOBI` `AZW` `AZW3` `MD` `HTML` `HTM` `XHTML` `XML` `FB2` `DOCX`
- 漫画 / 归档：`CBZ` `CBT` `CBR` `CB7`（按内容魔数与扩展名识别）
- 备注：`DJVU` 可识别，但解析依赖可选的 GPL-3.0 组件，未默认启用。

---

## 快速开始

### 环境要求

- `Node.js 18+`
- `npm 9+`
- `Windows 10/11`

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

### 构建

```bash
npm run build
```

---

## 项目结构

```text
.
├─ electron/                      # 主进程与 preload
├─ src/
│  ├─ components/Reader/          # 阅读器 UI 与 ShadowRenderer 交互层
│  ├─ components/Library/         # 书库视图
│  ├─ engine/                     # Vitra Pipeline、解析器适配与渲染流程
│  ├─ stores/                     # Zustand 状态管理
│  ├─ services/                   # 存储、同步与文档服务
│  └─ utils/                      # 通用工具函数
├─ docs/                          # 项目文档
├─ dist/                          # 前端构建输出
└─ dist-electron/                 # Electron 构建输出
```

---

## 技术栈

- `Electron`
- `React 18`
- `TypeScript`
- `Vite`
- `Zustand`
- `Dexie.js`
- `epub.js`（EPUB 解析与资源提取）
- `@lingo-reader/mobi-parser`
- `pdfjs-dist`
- `Mammoth`（DOCX）
- `Marked`（Markdown）
- `fflate`
- `Framer Motion`

---

## 当前阶段与路线图

当前阶段：`Alpha`（持续迭代）

下一步重点：

- 朗读能力增强（音色与语速配置、离线 / 在线引擎）。
- 词典能力（离线或在线）。
- 大体积文档性能优化（Worker 化处理、滚动平滑）。
- 翻译引擎与缓存策略持续优化。
- 关键路径自动化测试（解析、同步、阅读状态）。

---

## AI 协作实践（Harness Engineering）

本仓库的开发协作采用 harness engineering 方法：通过规则文件、子代理、slash command 与 MCP 协议把 LLM 改造成可控的工程平台，而非自由发挥。

**职责分工**：

- **Claude Code**：产品决策、架构设计、前端实现（React 组件 / UI / 状态层）、规划与审阅
- **codex CLI**：后端 / 接口实现、代码审查、bug 修复、单测编写，通过 `codex mcp-server` 受 CC 调度
- **codex `/goal` 模式**（CLI TUI only）：处理大且终点明确的长任务（修整套测试、实现 spec phase、bounded review），由人工触发，CC 不插手

**入库的规约**：

- [`CLAUDE.md`](./CLAUDE.md) —— 项目级 Claude Code 硬约束
- [`doc/codex-collaboration.md`](./doc/codex-collaboration.md) —— CC 与 codex 协作约定
- [`doc/multi-session-conflict-handling.md`](./doc/multi-session-conflict-handling.md) —— 多会话冲突处置 SOP

**本机本地配置**（位于 `.claude/`，已 gitignore）：subagent 定义、`/codex` slash command、MCP server 注册。

方法论参考：[《驾驭工程 — 从 Claude Code 源码到 AI 编码最佳实践》](https://github.com/ZhangHanDong/harness-engineering-from-cc-to-aicoding)。

---

## 反馈与贡献

欢迎提交 Issue 和 PR。
对阅读稳定性、同步兼容性、交互细节的反馈尤为重要。

### 第三方开源库致谢

Vitra Reader 调用并感谢这些主要 GitHub 开源项目；完整依赖以 `package.json` 和 `package-lock.json` 为准，实际使用遵循各项目自己的许可证：

- [Electron](https://github.com/electron/electron)（MIT）：桌面应用运行时。
- [React](https://github.com/facebook/react)（MIT）：界面组件与渲染基础。
- [Vite](https://github.com/vitejs/vite)（MIT）：开发服务与前端构建。
- [TypeScript](https://github.com/microsoft/TypeScript)（Apache-2.0）：静态类型与编译工具链。
- [Zustand](https://github.com/pmndrs/zustand)（MIT）：前端状态管理。
- [Dexie.js](https://github.com/dexie/Dexie.js)（Apache-2.0）：IndexedDB 数据访问。
- [epub.js](https://github.com/futurepress/epub.js)（BSD-2-Clause）：EPUB 包结构、目录、章节和资源提取能力。
- [@lingo-reader/mobi-parser](https://github.com/hhk-png/lingo-reader)（MIT）：MOBI / AZW / AZW3 / KF8 解析主路径。
- [PDF.js](https://github.com/mozilla/pdf.js)（Apache-2.0）：PDF 文档渲染基础。
- [fflate](https://github.com/101arrowz/fflate)（MIT）：ZIP、Deflate、Zlib 解压能力。
- [Framer Motion](https://github.com/motiondivision/motion)（MIT）：界面动效。
- [Mammoth](https://github.com/mwilliamson/mammoth.js)（BSD-2-Clause）：DOCX 到 HTML 的转换。
- [Marked](https://github.com/markedjs/marked)（MIT）：Markdown 到 HTML 的转换。
