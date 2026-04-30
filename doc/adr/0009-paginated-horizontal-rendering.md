# ADR 0009：分页水平渲染边界

## 状态

已采纳。

## 背景

分页阅读模式当前使用 CSS columns 进行水平排版，再通过 `translateX` 切换页面。连续滚动模式才使用章节向量分段、窗口化挂载和 DOM 节点池。

相关入口：

- `src/components/Reader/PaginatedReaderView.tsx`
- `src/components/Reader/paginatedReader/usePaginatedPageLayout.ts`
- `src/components/Reader/paginatedReader/usePaginationMeasure.ts`
- `src/components/Reader/ShadowRenderer.tsx`
- `src/engine/render/vitraMeasure.ts`
- `src/engine/render/vitraPaginator.ts`

## 决策

分页模式继续保留“整章 DOM + CSS columns + 水平位移”的主路径，不在当前阶段改成移除 DOM 节点级别的真正横向窗口化虚拟渲染。

当前阶段只做低风险优化：

1. 复用分页测量缓存，减少章节回访和 resize 后的重复离屏测量。
2. 将页面数量、页码约束、水平位移格式化等规则收敛到小型纯函数。
3. 对页窗外的段落、标题、列表、图片等元素做 `visibility` 级别的水平窗口裁剪，保留布局占位，不移动、不删除 DOM 节点。
4. 保持 `PaginatedReaderView` 对外接口不变。

## 原因

完整横向虚拟渲染需要同时处理这些边界：

- CSS columns 的真实排版结果依赖完整 DOM、字体加载、图片尺寸和用户样式。
- 目录跳转、正文内链接、选区菜单、标注定位都依赖真实 DOM 坐标。
- 章节尾部空白页规避依赖逻辑页图和实际元素探测。
- 双页模式把视口宽度、列宽和翻页单位耦合在一起，不能直接复用连续滚动的纵向 segment 窗口。

直接把分页模式改成分段挂载，容易引入页码漂移、标注错位、目录跳转错误和图片跨页异常。

## 当前性能边界

已具备：

- 章节内容预处理在 Worker 中执行。
- ShadowRenderer 支持大章节分块追加。
- 分页边界测量使用 idle 批处理。
- 分页测量结果按书籍、章节、视口和排版参数缓存。
- 分页可按当前页加 overscan 隐藏页窗外的可渲染块，减少非当前页的绘制和命中测试成本。
- 章节节点重复挂载时会先判断是否已经独占挂载，避免同一 DOM 节点被 `releaseMediaResources` 提前清空。
- 同一章节节点旁存在临时兄弟节点时，先临时移出章节节点，再清理兄弟节点，避免当前章节图片资源被误清理。
- 章节挂载和 resize 中的帧回调会在 cleanup 中取消，避免旧章节帧回调在新章节挂载后继续更新页码、高亮或动画状态。

仍未具备：

- 分页模式不按页窗口化挂载 DOM。
- 分页模式不复用连续滚动的 segment DOM pool。
- 单个超大章节进入分页模式时，仍需要完整 DOM 参与 CSS columns 排版。
- 页窗外元素只隐藏渲染，不释放 DOM 和资源。

## 后续触发条件

只有满足以下条件，才进入真正横向虚拟渲染设计：

1. 有稳定复现的超大章节分页性能问题。
2. 已补齐目录跳转、选区、标注、双页模式的回归测试。
3. 可以证明 segment 边界和页面边界之间存在稳定映射。
4. 有独立实验分支，不影响现有分页主路径。

## 维护规则

- 分页模式优先优化测量、缓存和重复计算，不优先重写渲染模型。
- 涉及页码、位移、页面数量的规则必须集中维护，避免散落在组件和 hook 中。
- 不为了减少行数拆分 `PaginatedReaderView`，只外移稳定规则和可测试逻辑。
- 清理 `columnContainer` 前必须确认要挂载的是新章节节点；同一个 `chapterNode` 已在容器内时不得调用 `releaseMediaResources`。
- 页窗候选收集必须记录“已收集”状态，不能用候选数量是否为 0 判断是否需要重新扫描。
- 任何延后执行的分页布局帧回调都必须带 cleanup 取消逻辑，并在执行前确认当前容器仍包含对应章节节点。
