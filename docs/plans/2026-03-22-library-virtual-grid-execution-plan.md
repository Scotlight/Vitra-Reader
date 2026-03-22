# 主页面虚拟网格执行计划（2026-03-22）

## 执行级别

- 内部级别：L

## 步骤

1. 为 `LibraryView` 增加滚动容器引用传递。
2. 将 `BookGrid` 拆出虚拟网格逻辑与卡片渲染复用逻辑。
3. 实现基于探测卡片的列数/行高动态量测与可见窗口计算。
4. 为虚拟窗口计算补充单元测试。
5. 运行定向测试与构建验证。

## 验证命令

- `npx vitest run src/test/libraryVirtualGrid.test.tsx`
- `npm run build --silent`

## 回滚规则

- 若窗口化导致交互回退，则先回退到普通网格渲染，再保留文档与测试线索。

## 清理要求

- 只提交本轮主页面虚拟化相关文件。
- 在 `outputs/runtime/vibe-sessions/` 下补齐本轮 receipt 与 cleanup 产物。
