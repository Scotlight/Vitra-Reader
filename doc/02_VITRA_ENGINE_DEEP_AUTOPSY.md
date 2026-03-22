# Vitra Engine 深度尸检报告

- 日期：`2026-03-22`
- 运行模式：`vibe / benchmark_autonomous`
- 尸检范围：PDF 渲染旧实现、制度化 ADR、Reader 主链，以及当前工作树中的重建信号

## 执行摘要

结论先行：用户提出的 7 项指控里，**1、2、3、5、7 明确成立；4 部分成立；6 对文档成立、对当前工作树代码属于历史残影**。更严重的是，这些问题并不是偶发草率实现，而是通过 ADR 和内部指南被“制度化”过，形成了真正的知识债。

同时，当前工作树已经出现明显的自救信号：`src/engine/parsers/providers/pdfProvider.ts` 在工作树中处于删除状态，`src/engine/core/readerRenderMode.ts:12` 已把 PDF 限制为 `scroll-only`，`docs/requirements/2026-03-22-pdf-scroll-rebuild.md:1` 与 `docs/plans/2026-03-22-pdf-scroll-rebuild-execution-plan.md:1` 说明团队已经开始拆旧方案。这意味着本次尸检对象不是“完全静止的现状”，而是“被文档固化的旧架构 + 正在进行中的重建”。

## 证据边界

- **当前工作树事实**：`git status --short` 显示 `src/engine/parsers/providers/pdfProvider.ts` 为删除状态，Reader 相关文件仍在高频修改。
- **可复核的旧实现事实**：`HEAD` 版本的 `src/engine/parsers/providers/pdfProvider.ts` 仍完整保留了 text layer 禁用、全局 legacy 标志、JPEG Blob URL 与 `<img>` 合成路径。
- **制度化事实**：`doc/adr/0001-pdf-runtime-fallback.md:1`、`doc/adr/0002-disable-pdf-text-layer.md:1`、`doc/adr/0003-jpeg-render-strategy.md:1` 把这些取舍升级成了正式决策。
- **知识传播事实**：`docs/VITRA_CORE_ENGINE_GUIDE.md:85`、`doc/modules/pdf-provider.md:19` 仍在以“模块规范”或“架构指南”的口径传播旧方案。

## 裁定矩阵

| 编号 | 指控 | 裁定 | 核心原因 |
|---|---|---|---|
| 1 | 文字层禁用 | 成立 | 旧实现与 ADR 都明确承认 text layer 被主动禁用 |
| 2 | “三路并行”其中一路是空气 | 成立 | 旧实现把 `Promise.resolve('')` 塞进 `Promise.all` |
| 3 | 矢量 → 光栅 → JPEG → `<img>` 多级损耗 | 成立 | 旧实现与 ADR 明确采用 JPEG Blob URL + `<img>` |
| 4 | “向量化渲染管线”是命名谎言 | 部分成立 | 实现本质是 HTML 分段与虚拟化元数据，不是图形学意义的向量渲染 |
| 5 | 全局降级标志会传染 | 成立 | 旧实现与 ADR 都采用 session 级 legacy 污染 |
| 6 | `canvas.width = 0` 被写成架构亮点 | 对文档成立 | 当前工作树旧 provider 正在下线，但文档仍把 workaround 当关键优化 |
| 7 | ReaderView 是上帝组件 | 成立，且实际更重 | 当前文件长度和职责浓度都高于用户描述 |

## 逐项尸检

### 1. 文字层禁用：成立，而且是主动产品阉割，不是技术无能

证据链很完整：`doc/adr/0002-disable-pdf-text-layer.md:9` 明确写了“当前默认禁用 PDF text layer”；`docs/VITRA_CORE_ENGINE_GUIDE.md:85` 把该状态写入内部指南；`doc/modules/pdf-provider.md:40` 继续把“文字层：当前禁用”当作模块真相传播。

更关键的一点是：这不是“做不出来”。旧实现仍保留 `page.getTextContent()` 搜索路径，模块规范也把 PDF 搜索列为验收重点，说明文本语义并未从系统中消失，只是没有被接回阅读界面。换句话说，这不是能力缺失，而是**为了性能把阅读器最基础的选择/复制能力从产品面直接砍掉**。

这也是为什么该问题比一般性能权衡更严重：你不是延迟交付 text layer，而是通过 ADR 把“不支持文本选择”正式合法化了。

### 2. “三路并行”其中一路是空气：成立，而且会制造错误认知

`docs/VITRA_CORE_ENGINE_GUIDE.md:275` 明确展示了三路并行代码，其中第二路是 `Promise.resolve('')`。这意味着文档中所谓的 Layer 2 并不是“性能受限但存在的实现”，而是**一个被硬编码为空字符串的占位物**。

这类问题的技术损失并不只在运行时，更在认知层：新成员看到 `Layer 1 / Layer 2 / Layer 3` 的分层图，会自然以为文字层只是暂时关闭开关，而不是根本没接回真实实现。于是文档不是在解释系统，而是在制造系统的幻觉。

### 3. 矢量 → 光栅 → JPEG → `<img>`：成立，但要把“不可避免”和“自选损耗”分开

需要分层看：

- 使用 PDF.js 的 canvas 渲染，把 PDF 页面光栅化，是当前路径下的既定前提。
- 但在此之后继续走 `JPEG Blob URL + <img>`，就是主动追加的第二层和第三层损耗。

制度化证据很明确：`doc/adr/0003-jpeg-render-strategy.md:9` 正式规定“页面导出优先使用 JPEG、资源承载优先使用 Blob URL”；`doc/modules/pdf-provider.md:34` 把这一点写成模块职责；`docs/VITRA_CORE_ENGINE_GUIDE.md:297` 明说 `JPEG_QUALITY = 0.88`。

这条链路的问题不只在 JPEG 本身，还在于页面最终不是直接由 canvas 呈现，而是通过 `renderPdfPageHtml()` 合成为 `<img>` 页面层，见 `doc/modules/pdf-provider.md:34`。再叠加旧实现中渲染缩放被限制在较低 DPR，上清晰度损失就被放大了。

所以，用户的批评成立，但需要一个技术补充：**第一次损耗是当前 canvas 路径的代价，后两次损耗则是本项目自行选择的工程策略。**

### 4. “向量化渲染管线”是命名谎言：部分成立，问题在命名过载

真实实现位于 `src/engine/render/chapterPreprocessCore.ts:164`。`vectorizeHtmlToSegmentMetas()` 做的是：

- 按块边界扫描 HTML
- 切分片段
- 估算高度
- 生成 `SegmentMeta[]`

这更接近“分段元数据生成”“虚拟滚动预处理”或“piece-table 风格的段表”，而不是图形学意义上的 vector rendering。`doc/01_ARCHITECTURE.md:23` 把 `ShadowRenderer` 描述为承担“向量化渲染”，确实会让读者高估它的技术含义。

但这里也不能简单说它完全是谎言。若团队内部把“向量化”定义为“把大 HTML 字符串转成可调度的片段向量数组”，那它仍有一层术语自洽性。问题不在于功能不存在，而在于**术语对外表达过于像图形学向量引擎，超出了实际实现语义**。

### 5. 全局 legacy 降级标志：成立，而且比用户描述更糟

这是本轮最危险的一点。`doc/adr/0001-pdf-runtime-fallback.md:9` 正式规定“一旦触发全局降级，后续新文档继续使用 legacy runtime”。这不是代码偶发写坏，而是架构决策层面认可了“跨文档污染”。

更糟的是，`doc/modules/pdf-provider.md:76` 已经点出了一个脆弱区：`init()` 成功后会释放原始 `ArrayBuffer`，意味着 post-init fallback 不可靠。结合旧实现可以推出一个更坏的结果：**某些失败路径并不是优雅降级，而是降级后根本没有足够数据重新打开文档。**

这会带来两个问题：

1. 一次异常会影响当前 session 之后的新 PDF
2. 某些调用点会把“恢复失败”伪装成“没有结果”

因此用户说它是会传染的 bug 没有夸张；实际上它已经接近“带静默空结果的架构级污染”。

### 6. `canvas.width = 0` 被当架构亮点：对文档成立，对当前代码属于历史残影

当前工作树里，`src/engine/parsers/providers/pdfProvider.ts` 已经处于删除状态，因此不能再把这两行视为“今天仍在执行的核心实现”。但 `docs/VITRA_CORE_ENGINE_GUIDE.md:285` 和 `docs/VITRA_CORE_ENGINE_GUIDE.md:1147` 仍把这件事高亮成关键优化，这就是典型的知识债。

换句话说：

- **对代码现状**：这是被下线中的旧技巧
- **对团队知识传播**：这仍被包装成核心架构经验

所以第六罪成立的对象应当从“当前运行代码”修正为“当前内部文档叙事”。

### 7. ReaderView 上帝组件：成立，而且实际比用户说得更大

当前工作树实际文件长度为：

- `src/components/Reader/ReaderView.tsx:93` 所在文件共 `1357` 行
- `src/components/Reader/ScrollReaderView.tsx:168` 所在文件共 `1640` 行
- `src/components/Reader/PaginatedReaderView.tsx:34` 所在文件共 `759` 行
- `src/components/Reader/ShadowRenderer.tsx:386` 所在文件共 `759` 行

这里最大的反常其实不是 `ReaderView`，而是 `ScrollReaderView` 已经膨胀到 1600+ 行，超过了用户描述。`ReaderView` 自己同时承担：书籍加载、Provider 初始化、TOC、进度、搜索、批注、左侧面板、设置面板、模式切换与子阅读器装配，见 `src/components/Reader/ReaderView.tsx:253` 与 `src/components/Reader/ReaderView.tsx:820`。

这已经不是“顶层编排器”那么简单，而是**状态、IO、UI、导航、搜索入口都混在一个组件里**。用户对“上帝组件”的判断成立，而且实际问题比表面行数更重。

## 额外发现

### A. 文本提取能力其实还活着，说明被砍的是产品面，不是底层能力

旧实现仍保留 `page.getTextContent()` 用于搜索；模块规范也没有放弃“基础搜索能力”。这说明系统并非完全失去 PDF 文本语义，而是**只在阅读交互层切断了文本层输出**。这会让“搜索能搜到、却不能选中复制”的体验割裂格外刺眼。

### B. 模块文档和真实实现在 fallback 语义上已经发生漂移

`doc/modules/pdf-provider.md:54` 仍把 `reopenLegacyDocument()` 描述成“再以 legacy 重开”，但同一份文档在 `doc/modules/pdf-provider.md:76` 又承认 init 后 fallback 是脆弱区。结合旧实现，这说明文档已经同时承载了两种互相拉扯的叙事：

- 理想叙事：可以重开
- 现实叙事：重开能力并不可靠

这不是单纯文档过期，而是系统真相开始分裂。

### C. 当前工作树已经在沿着尸检结论做修复

`src/engine/core/readerRenderMode.ts:12` 把 PDF 设为 `scroll-only`；`docs/requirements/2026-03-22-pdf-scroll-rebuild.md:1` 和 `docs/plans/2026-03-22-pdf-scroll-rebuild-execution-plan.md:1` 表明团队已经冻结了 PDF 重建需求；`src/engine/parsers/providers/pdfProvider.ts` 在工作树中被删除，也说明旧单文件 provider 正在退出。

所以这份尸检报告不是逆风嘴炮，而是对当前重建方向做一次证据化校准：**哪些骂点是对的，哪些需要修正表述，哪些已经变成文档残留。**

## 根因总结

### 1. 性能焦虑被升级成了产品截肢

text layer、JPEG、runtime fallback 这些问题本来都属于“可测量、可比较、可局部优化”的工程问题；但项目把它们上升成了长期默认策略，结果是以阅读器核心能力为代价换取局部性能稳定。

### 2. 临时补丁被写进 ADR，变成了长期制度

真正致命的不是某一行 `Promise.resolve('')`，而是 `doc/adr/0002-disable-pdf-text-layer.md:1`、`doc/adr/0001-pdf-runtime-fallback.md:1`、`doc/adr/0003-jpeg-render-strategy.md:1` 让这些取舍拥有了“正式正确性”。一旦补丁被 ADR 化，后人默认会把它当设计，而不是当临时债务。

### 3. 文档把 workaround 包装成了架构能力

`docs/VITRA_CORE_ENGINE_GUIDE.md:275`、`docs/VITRA_CORE_ENGINE_GUIDE.md:285` 这类写法会让阅读者误以为系统拥有完整三层管线与成熟内存策略。实际上，一部分只是占位符，一部分只是旧浏览器时代的 workaround。于是知识债比技术债更难清理。

### 4. 组件职责没有被架构边界真正约束住

虽然项目写了分层文档，也有 Vitra 管线、Provider、ShadowRenderer 等概念，但 `ReaderView` / `ScrollReaderView` 仍然吸纳了过多状态与职责。命名上看是分层，职责上看是回流。

## 整改优先级

### P0 — 立即修正

- 把 PDF runtime fallback 改成 per-document 状态，禁止 session 级污染
- 禁止任何“恢复失败后静默返回空结果”的路径
- 清理或更新仍在传播旧叙事的文档与 ADR 注释

### P1 — 核心体验恢复

- 为 PDF 建立明确的文字层恢复策略：至少要恢复可搜索、可选中、可复制中的前两者统一性
- 重新审视 JPEG 默认策略，按页面内容与显示场景决定是否继续使用有损编码

### P2 — 架构可维护性

- 把“向量化”术语收敛为更准确的分段/片段/虚拟化词汇
- 把 `ReaderView`、`ScrollReaderView` 的状态与 IO 职责继续下沉到专用 hooks / service / controller 层

## 最终判词

这次尸检最扎眼的结论不是“代码里有几处离谱实现”，而是：**这些实现曾被认真文档化、模块化、ADR 化，进而从技术债变成了组织认知的一部分。**

好消息是，当前工作树已经开始反向修正这些错误：PDF 正被收敛到专用滚动路径，旧 provider 正在退出历史舞台。坏消息是，如果不同时清理文档叙事、命名语义和跨组件职责回流，团队很容易在下一版重建里把同样的问题换个名字再做一遍。
