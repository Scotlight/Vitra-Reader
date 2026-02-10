# Vitra Reader

一个基于 Electron + React + TypeScript 的本地 EPUB 阅读器，支持书库管理、阅读样式自定义与 WebDAV 同步。

## 展示图

![Vitra Reader 主界面](./docs/showcase-main.png)

> 请把你刚才这张截图保存为 `docs/showcase-main.png`（路径和文件名保持一致）。

## 主要功能

- EPUB 导入与书库管理（书架分组、收藏、回收）
- 多阅读模式（分页 / 滚动 / 连续滚动）
- 阅读样式自定义（字体、字号、行距、字距、段距、主题）
- 文本操作（复制、高亮、笔记、全文搜索、在线搜索）
- WebDAV 同步与备份（完整/仅数据/仅文件）

## 开发运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 技术栈

- Electron
- React
- TypeScript
- Zustand
- Dexie.js
- epub.js

