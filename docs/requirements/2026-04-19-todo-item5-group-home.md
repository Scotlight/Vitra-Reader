# TO DO 第 5 项实现冻结（2026-04-19）

## 目标
完成 `docs/TO DO.md` 第 5 项剩余实现，确保“书架”语义统一为“分组”，并保留首页混排与排序交互。

## 输入
- 需求来源：`docs/TO DO.md` 第 5 项
- 相关模块：`src/components/Library/*`、`src/hooks/groupManagerState.ts`

## 交付物
- Library 组件层命名统一为 `group` 语义（组件名、props 名、样式类名）
- 右键空白区域新建分组能力保持可用
- 主页面分组与图书混排、长按拖拽排序能力保持可用

## 约束
- 不改变既有交互行为，仅做语义收敛与引用重连
- 兼容既有数据：保留 `groupManagerState` 中旧 `shelf*` 存储键用于迁移
- 不触及第 6~8 项需求范围

## 验收标准
1. `src/components/Library` 业务代码不再出现 `CreateShelfModal`/`ManageShelfModal` 与 `styles.shelf*` 引用
2. `npm run build --silent` 成功
3. `npx vitest run src/test/libraryVirtualGrid.test.ts` 成功

## 非目标
- 不新增阅读统计
- 不新增快捷键
- 不调整全屏沉浸式视觉
