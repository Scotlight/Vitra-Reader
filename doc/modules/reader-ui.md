# Reader UI 模块规范

## 1. 模块范围

主要文件：

- `src/components/Reader/ReaderView.tsx`
- `src/components/Reader/ScrollReaderView.tsx`
- `src/components/Reader/PaginatedReaderView.tsx`
- `src/components/Reader/ShadowRenderer.tsx`

## 2. 模块职责

Reader UI 层负责：

- 作为阅读体验总入口
- 按阅读模式组织内容呈现
- 向下消费统一内容接口
- 向下驱动 Shadow/Vitra 渲染
- 承担用户可见交互与布局组织

## 3. 分工原则

### 3.1 App / ReaderView 入口关系

- Renderer 入口是 `src/main.tsx:1-11`
- `App` 负责在 `library` 与 `reader` 视图之间切换：`src/App.tsx:10-21,79-84`
- 当前顶层不是 Router，而是状态切视图；文档和后续改动都不应误写成“路由切页”
- `ReaderView` 是阅读器总入口，负责：
  - 读取书籍元数据、文件数据、已保存进度：`src/components/Reader/ReaderView.tsx:257-267`
  - 创建 `VitraPipeline` 与 `VitraContentAdapter`：`src/components/Reader/ReaderView.tsx:283-299`
  - 恢复初始阅读位置：`src/components/Reader/ReaderView.tsx:316-338`
  - 根据 `resolveReaderRenderMode()` 决定最终模式：`src/components/Reader/ReaderView.tsx:134-176`
  - 处理标注跳转、目录点击、搜索入口：`src/components/Reader/ReaderView.tsx:388-462`

同时，`resolveReaderRenderMode()` 会对固定布局格式强制限制模式：`src/engine/core/readerRenderMode.ts:9-18,25-59`

### 3.2 ReaderView

应承担：

- 统一入口
- 基本模式切换与公共参数组织
- 连接上层业务状态与下层阅读视图
- 维护顶部工具栏、左侧 TOC/搜索/标注面板、底部页脚、右侧设置面板：`src/components/Reader/ReaderView.tsx:623-905,910+`
- 通过 ref 调用子阅读器统一跳转能力，而不是把跳转细节散落到多个面板事件里：`src/components/Reader/ReaderView.tsx:388-448,830-889`

不应承担：

- 具体格式解析细节
- PDF runtime 细节
- 大量章节预处理逻辑

### 3.3 ScrollReaderView

应承担：

- 滚动阅读模式下的可视内容组织
- 与延迟渲染、IO 驱动 hydration 协同
- 大章节连续阅读体验控制
- 通过 `jumpToSpine()` 暴露命令式跳章接口：`src/components/Reader/ScrollReaderView.tsx:71-73,1218-1220`
- 负责滚动模式的阅读进度写回：`src/components/Reader/ScrollReaderView.tsx:1064-1070`
- 在卸载章节时调用 `provider.unloadChapter()` 并配合 placeholder/段向量回收：`src/components/Reader/ScrollReaderView.tsx:957,1347-1537`

### 3.3 PaginatedReaderView

应承担：

- 分页模式布局与翻页体验
- 与章节切分、页面定位和渲染容器协同
- 通过 `jumpToSpine()` 暴露命令式跳章接口：`src/components/Reader/PaginatedReaderView.tsx:30-31,698`
- 负责分页模式的阅读进度写回：`src/components/Reader/PaginatedReaderView.tsx:577-583`
- 通过 `ShadowRenderer` 渲染完整章节供分页测量：`src/components/Reader/PaginatedReaderView.tsx:170,711`

### 3.4 ShadowRenderer

应承担：

- 样式注入
- 内容 DOM 构建
- 向量化渲染计划执行
- placeholder 与 hydrate 节奏控制

## 4. 修改约束

- 不要在 Reader UI 层写入具体文件格式分支，优先收敛到 provider/adapter
- 不要把缓存释放策略散落到多个 UI 组件中
- 不要在模式组件内复制公共渲染管线逻辑
- 对 `ShadowRenderer` 的修改默认视为高风险，需要同时验证滚动/分页路径
- 阅读模式选择必须经过 `resolveReaderRenderMode()`，不能只改按钮显示不改模式约束：`src/components/Reader/ReaderView.tsx:1214-1228`
- 子阅读器应继续维持统一接口契约：`provider` + 初始定位参数 + `readerStyles` + 进度/章节回调 + `jumpToSpine()`
- 当前阅读器状态真实来源仍以 `ReaderView` 本地状态为主，仓库中未检到 `useReaderStore()` 实际消费点；不要把不存在的 store 当成真值层

## 5. 高风险点

- Reader 模式切换条件
- 首屏内容装载顺序
- 延迟段 placeholder 尺寸估算
- Shadow DOM 内样式注入顺序
- 与搜索、目录跳转、阅读位置恢复的联动

## 6. 需要继续补齐的源码真值

后续仍可继续细化的函数级引用：

- ScrollReaderView 的 IO 驱动 hydration 触发位置
- PaginatedReaderView 的分页计算入口
- ShadowRenderer 的阶段调用位置与关键 DOM 组织点

当前已补到的关键真值：

- `App.handleOpenBook()` 通过 `currentBookId` / `jumpTarget` 切到 `ReaderView`：`src/App.tsx:17-21,80-83`
- `ReaderView.loadBook()` 并行读取 `db.books` / `db.bookFiles` / `db.progress`，再创建 `VitraPipeline` 与 `VitraContentAdapter`：`src/components/Reader/ReaderView.tsx:257-306`
- `jumpTarget` 在 ready 后触发 `jumpToAnnotation()`：`src/components/Reader/ReaderView.tsx:412-421`
- `jumpToAnnotation()` / `handleTocClick()` / `handleSearchWithKeyword()` 的派发点：`src/components/Reader/ReaderView.tsx:418,465,553,713,746,782,859,886`
- `ScrollReaderView` 的 IO hydration 主入口：`src/components/Reader/ScrollReaderView.tsx:1347-1537`
- `PaginatedReaderView` 的章节预处理与 `ShadowRenderer` 挂载：`src/components/Reader/PaginatedReaderView.tsx:170,711`
