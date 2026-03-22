# Vitra 引擎模块规范

## 1. 模块范围

主要文件：

- `src/engine/render/chapterPreprocessCore.ts`
- `src/engine/render/chapterPreprocessService.ts`
- `src/components/Reader/ShadowRenderer.tsx`
- `src/engine/render/` 下相关向量化、分段、计划与 trace 文件

## 2. 核心职责

Vitra 引擎负责将章节 HTML 转换为可高性能展示的阅读内容，重点能力包括：

- HTML 消毒
- 样式清洗与 scope
- 章节分片
- 大章节向量化元数据生成
- 五阶段渲染追踪
- 延迟 hydrate

## 3. 五阶段模型

当前采用：

- parse
- measure
- paginate
- render
- hydrate

源码已确认：

- 五阶段类型定义：`src/engine/types/vectorRender.ts:3-8`
- 管线固定顺序：`src/engine/render/vitraRenderPipeline.ts:3-9`
- 阶段 timing 记录与失败路径保留：`src/engine/render/vitraRenderPipeline.ts:68-98`
- 向量化计划阶段列表：`src/engine/render/vitraVectorPlanner.ts:8-14`

规范要求：

- 阶段顺序不可破坏
- 阶段 trace 必须保留
- 阶段失败也要保留 timing

## 4. 预处理职责边界

`chapterPreprocessCore` 更偏纯数据处理：

- 消毒 HTML
- 提取样式
- 清理 style 标签
- 作用域隔离
- 生成 fragment 与 segment metas

源码锚点：

- 预处理主入口：`src/engine/render/chapterPreprocessCore.ts:43-60`
- `removeStyleTags()` 清理 style 标签：`src/utils/styleProcessor.ts:356-360`
- `scopeStyles()` CSS 作用域隔离：`src/utils/styleProcessor.ts:219-245`
- `vectorizeHtmlToSegmentMetas()` 向量化输出 `SegmentMeta[]`：`src/engine/render/chapterPreprocessCore.ts:164-233`

`chapterPreprocessService` 更偏线程/服务协调：

- 调用 worker
- 传递输入输出
- 屏蔽线程边界给上层

源码锚点：

- Worker 生命周期与消息解包：`src/engine/render/chapterPreprocessService.ts:24-98`
- `preprocessChapterContent()` 对外入口：`src/engine/render/chapterPreprocessService.ts:133-154`
- Worker 侧入口与 Transferable 回填：`src/engine/worker/chapterPreprocess.worker.ts:7-46`

## 5. 与 UI 的边界

- Vitra 输出的是可供渲染的“处理后内容”和“渲染计划依据”
- UI 负责可见层组织，不应重复执行完整 preprocess
- 引擎应尽量让主线程避免重复做重计算

源码锚点：

- `ScrollReaderView` 调用 `preprocessChapterContent()`：`src/components/Reader/ScrollReaderView.tsx:529-543`
- `ShadowRenderer` 按 parse → measure → paginate → render → hydrate 执行：`src/components/Reader/ShadowRenderer.tsx:477-647`
- `ScrollReaderView` 在章节 ready 后构建 `ChapterMetaVector`：`src/components/Reader/ScrollReaderView.tsx:655-657`
- `buildChapterMetaVector()` 真值定义：`src/engine/render/metaVectorManager.ts:90-108`

## 6. 修改约束

- 不得跳过 sanitize 或 scope 直接注入原始内容
- 不得随意更改大章节阈值而不进行性能回归
- 不得让 trace 逻辑缺失
- 不得把 worker 输出协议改成难以序列化或高耦合结构

## 7. 高风险点

- `splitHtmlIntoFragments()` 的切分边界：`src/engine/render/chapterPreprocessCore.ts:86-118`
- `vectorizeHtmlToSegmentMetas()` 的阈值、SAX 扫描与高度估算：`src/engine/render/chapterPreprocessCore.ts:164-233`
- `buildVitraVectorRenderPlan()` 的启用条件与首批段数决策：`src/engine/render/vitraVectorPlanner.ts:16-45,58-83`
- `ScrollReaderView` 中 placeholder → hydrated 的批量切换、测量回写与滚动补偿链：`src/components/Reader/ScrollReaderView.tsx:1356-1440`, `src/engine/render/metaVectorManager.ts:54-85`
- hydrate 阶段 IO / range / rAF 组合调度：`src/components/Reader/ScrollReaderView.tsx:1443-1552`

## 8. 已补齐的关键真值

- 渲染计划构建器与阈值：`src/engine/render/vitraVectorPlanner.ts:16-45,58-83`
- `SegmentMeta` / `ChapterMetaVector` 结构定义：`src/engine/types/vectorRender.ts:38-57`
- active segment 范围计算：`src/engine/render/metaVectorManager.ts:30-47`
- active segment 批量高度回写：`src/engine/render/metaVectorManager.ts:54-85`
- `ScrollReaderView` 的按范围预热与 `IntersectionObserver` 注册：`src/components/Reader/ScrollReaderView.tsx:1443-1482,1509-1563`
- trace 收口与日志格式：`src/engine/render/vitraRenderPipeline.ts:101-125`
- `ShadowRenderer` 在章节 render 完成后输出 trace 日志：`src/components/Reader/ShadowRenderer.tsx:696-697`
