# Reader Shell Refactor Execution Plan

## Grade

- Internal grade: `XL`
- Runtime mode: `benchmark_autonomous`

## Waves

### Wave 1: Freeze and isolate

- 写入 skeleton receipt / intent contract / requirement doc / execution plan
- 依据文档与热点分析锁定 `ReaderView` 为首个低风险切入点

### Wave 2: Extract stable seams

- 新增 `readerToc` utils，承载 TOC 归一化与活动项匹配
- 新增 `useReaderBookSession`，承载 IDB 读取、pipeline 打开、provider 初始化
- 新增 `useReaderNavigation`，承载 jump / toc / search / panel 命令编排
- 新增 `useReaderSystemFonts` 与相关辅助 utils，继续消减入口噪音

### Wave 3: Integrate safely

- 将 `ReaderView` 改为装配层
- 删除只写不读的残留 ref
- 保持 `ScrollReaderView` / `PaginatedReaderView` 契约不变

## Ownership boundaries

- `ReaderView`: 入口壳、模式切换、面板和子阅读器装配
- hooks/utils: 会话初始化、导航命令、TOC 匹配、字体枚举等非壳层逻辑
- 子阅读器: 具体渲染与模式行为

## Verification commands

- `npm run lint`

## Rollback rules

- 若类型检查失败，优先回退最近一次集成修改，而不是引入隐藏兜底逻辑
- 不修改 Provider / Parser 协议，避免跨层回滚扩大化

## Cleanup expectations

- 写入 phase receipt 与 cleanup receipt
- 不保留临时脚本或一次性调试文件
