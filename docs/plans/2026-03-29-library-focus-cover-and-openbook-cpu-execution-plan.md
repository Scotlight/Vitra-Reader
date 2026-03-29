# Library Focus Cover Flicker And Open-Book CPU Execution Plan

## Grade

- Internal grade: `L`
- Runtime mode: `benchmark_autonomous`

## Waves

### Wave 1: Freeze and inspect

- 写入 skeleton receipt、intent contract、requirement doc、execution plan。
- 梳理主页面焦点恢复链路、虚拟网格重置条件、封面按需读取链路。
- 梳理打开书籍路径，确认 CPU 主要消耗点属于解析、渲染还是预处理。

### Wave 2: Root-cause fixes

- 仅在书籍顺序或结构真正变化时重置虚拟网格，避免无意义重挂载。
- 为封面按需读取增加稳定缓存或状态保持，消除已解析封面的占位回退。
- 对打开书籍 CPU 热点施加最小必要修复，避免扩大读取或预渲染工作量。

### Wave 3: Verify and ship

- 运行构建验证。
- 写入 phase receipt 与 cleanup receipt。
- 提交并推送。

## Ownership Boundaries

- `LibraryView`：焦点恢复后的状态更新边界。
- `BookGrid`：虚拟网格重置策略、封面渲染稳定性。
- 阅读器打开链路相关文件：CPU 热点定位与修复。

## Verification Commands

- `npm run build --silent`

## Rollback Rules

- 若修复导致列表排序、分组或虚拟滚动异常，优先回退虚拟网格重置条件的修改。
- 若 CPU 优化影响阅读器正确性，优先回退热点修复而不是增加隐藏兜底。

## Cleanup Expectations

- 不保留一次性调试日志。
- 写入 `phase-plan_execute.json` 与 `cleanup-receipt.json`。
