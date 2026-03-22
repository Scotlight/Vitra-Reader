# 主页分组混排与排序执行计划（2026-03-22）

## 执行级别

- 内部级别：L

## 步骤

1. 将 `useShelfManager` 切换为 `useGroupManager`，完成状态命名与迁移落地。
2. 重写 `BookGrid`，让分组卡片与图书共享虚拟网格。
3. 在 `LibraryView` 接入首页混排、空白右键菜单与分组内排序。
4. 为分组状态迁移与排序 helper 增加定向测试。
5. 运行定向测试与构建验证。

## 验证命令

- `npx vitest run src/test/groupManagerState.test.ts`
- `npm run build --silent`

## 回滚规则

- 若混排或长按排序导致主页交互回退，则优先回退 `BookGrid` 与 `LibraryView` 的混排改动，保留状态迁移与测试资产。

## 清理要求

- 只提交本轮分组混排相关文件。
- 在 `outputs/runtime/vibe-sessions/` 下补齐本轮 receipt 与 cleanup 产物。
