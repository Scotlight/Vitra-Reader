# Reader Debt Split Execution Plan

## Grade

- Internal grade: `XL`
- Runtime mode: `benchmark_autonomous`

## Waves

### Wave 1

- 冻结需求、计划、skeleton receipt、intent contract
- 建立 `taskmaster` CSV 轨道

### Wave 2

- 从 `ReaderView` 抽出左侧面板组件
- 保留 TOC / 搜索 / 标注回调契约不变

### Wave 3

- 抽出右侧设置面板壳层
- 如有必要，再拆成更细的设置分区组件

### Wave 4

- 执行 `any` 审计
- 运行 `npm run lint`
- 输出阶段与 cleanup 收据

## Verification

- `rg -n --glob "src/**/*.ts" --glob "src/**/*.tsx" "\\bany\\b|as any|<any>|Array<any>|Record<string, any>"`
- `npm run lint`

## Rollback Rules

- 若 Reader 行为耦合过强导致编译失败，优先回退最近一次组件抽离，不扩大补丁面
- 不在本轮顺手修改与 Reader 无关的历史问题
