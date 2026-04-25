# Vitra Reader

[中文](./README.md) | [English](./README.en.md)

Vitra Reader 是一款桌面电子书阅读器，强调本地优先、阅读体验和可控同步。
项目基于 Electron + React + TypeScript 构建，当前以 Windows 作为主要开发平台。

## 许可说明

- 本项目采用 `PolyForm Noncommercial 1.0.0` 许可。
- 你可以在非商业场景下使用、修改和分发本项目。
- 任何商业使用都必须先获得作者书面许可。
- 本项目属于 `source-available`，不属于 OSI 定义的开源许可。

详见：
- [LICENSE](./LICENSE)
- [COMMERCIAL_USE.md](./COMMERCIAL_USE.md)
- [LICENSE-FAQ.md](./LICENSE-FAQ.md)

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
- 功能闭环完整：书库管理、目录导航、全文检索、标注笔记、进度管理统一在同一产品内。
- 迭代方向明确：翻译、朗读、词典和大文件性能优化持续推进。

---

## 核心能力

### 1) 书库与导入

- 导入 EPUB 并解析元数据（书名、作者、封面）。
- 支持搜索、排序和阅读进度展示。
- 提供常见书籍操作：收藏、加入书架、移入回收站、恢复、永久删除。

### 2) 阅读器

- 基于 `epub.js` 承载 EPUB 渲染。
- 支持目录导航、全文检索与结果跳转。
- 支持键盘导航（Arrow / PageUp / PageDown）。
- 提供文本选择菜单（复制、高亮、笔记、站内搜索、网络搜索、朗读入口）。

### 3) 阅读样式

- 支持系统字体选择。
- 支持字号、行高、字距、段距、页宽、亮度等排版参数。
- 支持文本对齐（左对齐、两端对齐、居中）。
- 支持主题与前景色/背景色自定义。

### 4) 同步与恢复

- 支持 WebDAV 连接测试。
- 支持上传同步与下载恢复。
- 支持同步模式（完整 / 仅数据 / 仅文件）。
- 支持恢复模式（自动 / 完整 / 仅数据 / 仅文件）。
- 支持自动同步流程（启动拉取 + 周期同步 + 退出前同步）。

### 5) 渲染与性能

- 阅读页面采用 `ShadowRenderer + 虚拟化 + rAF` 的渲染策略。
- EPUB 资源通过会话级 Blob URL 映射，降低 `ERR_FILE_NOT_FOUND` 风险。
- 大体积文档处理优先保证 UI 响应性，持续优化解析与渲染路径。

---

## 支持格式

- 已支持：`EPUB` `PDF` `TXT` `MOBI` `AZW` `AZW3` `MD` `HTML` `HTM` `XHTML` `XML` `FB2` `DOCX`
- 规划中：`CBZ` `CBT` `CBR` `CB7`
- 备注：`DJVU` 处于预研阶段，尚未进入稳定发布范围。

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
- `epub.js`
- `pdfjs-dist`
- `fflate`
- `Framer Motion`

---

## 当前阶段与路线图

当前阶段：`Alpha`（持续迭代）

下一步重点：

- 翻译服务体验优化（OpenAI-compatible / Gemini-compatible / Claude-compatible / Ollama-compatible / DeepL / DeepLX，含本地缓存）。
- TTS 朗读能力增强（音色与语速配置）。
- 词典能力（离线或在线）。
- 大体积 EPUB 性能优化（Worker 化处理）。
- 关键路径自动化测试（解析、同步、阅读状态）。

---

## 反馈与贡献

欢迎提交 Issue 和 PR。
对阅读稳定性、同步兼容性、交互细节的反馈尤为重要。
