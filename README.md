# Vitra Reader

[中文](./README.md) | [English](./README.en.md)

Vitra Reader 是一个专注于 **本地优先、阅读体验、同步可控** 的桌面 EPUB 阅读器。  
项目基于 Electron + React + TypeScript 构建，目标是提供“能长期主力使用”的 Windows 桌面阅读方案。

---

## 展示图

![Vitra Reader 主界面](./docs/showcase-main.png)

> 建议将展示图保存到 `docs/showcase-main.png`，仓库首页会自动展示。

---

## 为什么是 Vitra Reader

### 本地优先，离线可用
- EPUB 文件、阅读进度、书签/高亮、设置全部本地存储。
- 不依赖在线账号，断网也可完整使用。

### 阅读体验可深度调节
- 主题：浅色 / 深色 / 护眼 / 绿色 + 自定义颜色。
- 排版：字体、字号、行距、字间距、段间距、对齐方式。
- 模式：分页 / 滚动 / 连续滚动三种阅读模式。

### 数据可同步、可恢复
- WebDAV 同步：支持私有云、自建服务。
- 三种备份模式：完整 / 仅数据 / 仅文件。
- 支持连接测试、恢复策略、自动同步链路。

### 书库管理更贴近实际使用
- 分类视图：全部图书、喜爱、笔记、高亮、回收。
- 书架系统：新建、重命名、解散、迁移书籍。
- 分组浏览：主内容区支持“书架分组卡片”。

---

## 主要功能

### 1. 书库与导入
- EPUB 导入与元数据解析（标题、作者、封面）
- 搜索与排序
- 阅读进度可视化
- 图书右键操作（加入喜爱、加入书架、回收、恢复、彻底删除）

### 2. 阅读器
- EPUB 渲染（epub.js）
- 目录导航（TOC）
- 全文搜索与跳转
- 键盘翻页（方向键 / PageUp / PageDown）
- 文本选择菜单（复制、高亮、笔记、搜索、在线搜索、朗读入口）

### 3. 阅读样式
- 系统字体选择
- 字号 / 行距 / 字间距 / 段间距 / 页面宽度 / 亮度
- 对齐模式（左对齐 / 两端对齐 / 居中）
- 自定义前景色与背景色

### 4. 同步与备份
- WebDAV 连接测试
- 上传同步与下载恢复
- 同步模式（完整/仅数据/仅文件）
- 恢复模式（自动/完整/数据/文件）
- 自动同步（启动拉取 + 定时同步 + 退出前同步）

---

## 快速开始

### 环境要求
- Node.js 18+
- npm 9+
- Windows 10/11（当前主要测试平台）

### 安装依赖

```bash
npm install
```

### 启动开发

```bash
npm run dev
```

### 构建发布包

```bash
npm run build
```

---

## 项目结构

```text
.
├─ electron/                  # Electron 主进程与 preload
├─ src/
│  ├─ components/             # 界面组件（Library / Reader / Settings）
│  ├─ stores/                 # Zustand 状态管理
│  ├─ services/               # 存储、同步、EPUB 业务服务
│  ├─ assets/                 # 图标与静态资源
│  └─ styles/                 # 主题变量与全局样式
├─ dist/                      # 前端构建输出
└─ dist-electron/             # Electron 构建输出
```

---

## 技术栈

- Electron
- React 18
- TypeScript
- Vite
- Zustand
- Dexie.js（IndexedDB）
- epub.js
- Framer Motion

---

## 当前阶段与路线图

当前阶段：**Alpha（持续迭代中）**

下一阶段计划：
- 翻译服务（DeepL / OpenAI / 自定义 API）
- TTS 文字转语音（可配置语音和语速）
- 词典能力（离线或在线）
- 大型 EPUB 搜索与渲染性能优化（Worker）
- 关键路径自动化测试（解析、同步、阅读状态）

---

## 贡献与反馈

欢迎提交 Issue / PR，一起完善 Vitra Reader。  
如果你在阅读稳定性、同步兼容性或 UI 交互上有建议，欢迎直接反馈。
