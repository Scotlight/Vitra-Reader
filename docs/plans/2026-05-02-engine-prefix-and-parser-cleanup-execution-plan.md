# 引擎命名前缀与 HTML 扫描可读性清理执行计划

## 内部等级

L。改动横跨源码、测试和文档，但写入范围高度相关，不适合并行写入。

## 阶段

1. 盘点命名面
   - 搜索 `src`、`doc`、`docs` 中的 `Vitra/vitra/VITRA`。
   - 区分品牌、协议、DOM 属性、调试开关和实现命名。

2. 源码重命名
   - 将引擎文件名改为职责命名。
   - 将类型、类、函数和常量同步改为职责命名。
   - 保留 `vitra:` 位置协议和 `data-vitra-*` DOM 属性。

3. HTML 扫描清理
   - 把 `htmlSaxStream.ts` 中普通字符判断改成字符常量。
   - 保留二进制格式相关文件中的十六进制偏移。

4. 同步过滤修复
   - 将 `translate:config` 加入 settings 敏感键过滤。
   - 同步更新存储和同步文档。

5. 文档同步
   - 更新 `doc/` 当前规范中的路径、符号和约束。
   - 更新 `docs/` 历史指南中仍指向当前源码的路径。

6. 验证与清理
   - 执行与重命名相关的测试。
   - 执行 `npm run build --silent`。
   - 写入 `$vibe` phase 与 cleanup 凭据。

## 写入边界

- `src/engine/**`
- `src/components/Reader/**` 中引用引擎符号的文件
- `src/test/**` 中相关测试
- `doc/**` 与 `docs/**` 中相关文档
- `outputs/runtime/vibe-sessions/2026-05-02-engine-prefix-and-parser-cleanup/**`

## 回滚规则

- 若构建失败来自重命名遗漏，继续修复引用。
- 若行为测试失败，优先恢复单个符号或适配测试，不回退整批重命名。
- 若发现需要 schema、依赖或同步协议结构变更，停止扩大范围。

## 验证命令

- `npx vitest run src/test/htmlSaxStream.test.ts src/test/canvasMeasure.test.ts src/test/pipeline.test.ts src/test/paginator.test.ts src/test/renderStageTrace.test.ts`
- `npm run build --silent`

## 清理预期

- 不留下临时脚本。
- 不启动或残留 Node dev server。
- 输出 skeleton、intent、phase 和 cleanup JSON 凭据。
