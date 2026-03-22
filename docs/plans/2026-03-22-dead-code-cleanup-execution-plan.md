# 2026-03-22 Dead Code Cleanup Execution Plan

## Grade

- Internal grade: `L`
- Runtime mode: `benchmark_autonomous`

## Waves

### Wave 1 - Safe Push

- 识别并圈定本轮 Reader 重构相关文件
- 仅暂存这批文件与必要 runtime artifacts
- 提交并推送到 `origin/main`

### Wave 2 - Dead Code Audit

- 审计未使用导入、未使用导出、无调用 helper、无效常量与明显不可达分支
- 优先处理 Reader 层及直接相关文件

### Wave 3 - Cleanup + Verification

- 以最小修改删除或内联死代码
- 运行针对性 TypeScript / 检索验证
- 补齐 phase receipt 与 cleanup receipt

## Ownership Boundaries

- `ReaderView` 与其拆分子模块：主清理范围
- `ScrollReaderView`：仅处理可证明的死代码与类型脏点
- 其他脏文件：默认不纳入，除非审计证明属于本轮死代码目标

## Verification Commands

- `git diff --cached --name-only`
- `rg -n "TODO|FIXME|unused|dead|as any|\bany\b" src`
- `npx tsc --noEmit --pretty false --incremental false`

## Rollback Rules

- 若暂存范围混入无关文件，先取消暂存后重新圈定
- 若死代码删除引入类型或行为风险，回退该单项修改，不扩大范围

## Cleanup Expectations

- 写入 `phase-plan_execute` receipt
- 写入 `cleanup-receipt`
- 不保留一次性脚本或临时文件
