# TO DO 第 5 项执行计划（2026-04-19）

## 内部执行等级
- Grade: `M`（单模块语义收敛与引用修复，不需要并行拆分）

## 批次划分
1. 批次 A：重命名分组弹窗组件与 props（`ShelfModals` -> `GroupModals`）
2. 批次 B：同步 Library 侧边栏、网格卡片与样式类名（`shelf*` -> `group*`）
3. 批次 C：构建与定向测试验证，并写入运行收据

## 所有权边界
- 写入范围：
  - `src/components/Library/LibraryView.tsx`
  - `src/components/Library/LibrarySidebar.tsx`
  - `src/components/Library/BookGrid.tsx`
  - `src/components/Library/LibraryView.module.css`
  - `src/components/Library/GroupModals.tsx`
  - `src/components/Library/ShelfModals.tsx`（删除）
  - `docs/requirements/2026-04-19-todo-item5-group-home.md`
  - `docs/plans/2026-04-19-todo-item5-group-home-execution-plan.md`
  - `outputs/runtime/vibe-sessions/2026-04-19-todo-item5-group-home/*`

## 验证命令
- `rg -n "CreateShelfModal|ManageShelfModal|styles\\.shelf" src/components/Library`
- `powershell.exe -Command "npm run build --silent"`
- `powershell.exe -Command "npx vitest run src/test/libraryVirtualGrid.test.ts"`

## 回滚规则
- 若编译失败，先回滚组件重命名链路，再回滚样式类名重命名
- 不回滚 `groupManagerState` 的 legacy key，避免历史数据兼容中断

## 阶段清理预期
- 写入 `phase-*.json` 与 `cleanup-receipt.json`
- 不保留临时脚本
