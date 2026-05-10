# 多会话写入冲突处理指南

最后更新：2026-05-10

## 1. 现象

多个 AI 协作会话（Claude Code / Cursor / 其他）并行编辑同一份代码时，旧会话可能持有**过期的代码快照**。当它基于这份快照再生成一次 diff 并落盘，就会无意撤销另一会话已经完成的 refactor，呈现为 working tree 中一次"逆向重构"。

这类改动在 `git diff` 中看起来像"正常修改"，但本质上是把主线已经前进的内容拉回旧版，需要识别后整体回退。

## 2. 识别信号

如果一次未提交改动同时命中以下 ≥3 条，几乎可以判定为多会话冲突：

- `import` 路径从别名 `@/xxx` 退回 `../../../xxx`
- 抽离过的 helper 又被内联回原 hook
- 已命名的 `interface` 被改回内联对象类型
- 枚举常量被改为裸字符串字面量
- `import` 顺序刚刚统一过又被打乱
- 已分离的子组件（如 `XxxShell`）的 JSX 被搬回父组件
- 多出大量纯目录性注释墙（`// ── XXX ──`）

## 3. 小步整理流程

不要一次性 `git checkout .` 全部丢弃 —— 旧会话偶尔会夹带一两处真改动。按文件单独处理：

1. `git status` 列出受影响文件
2. 对每个文件：
   1. `git diff <file>` 阅读完整 diff
   2. 判定是 **纯逆向** / **纯新增** / **混合**
   3. 纯逆向 → `git checkout HEAD -- <file>`
   4. 纯新增 → 保留
   5. 混合 → `git stash push -- <file>` 暂存，再从 stash 中 cherry-pick 真新增片段
3. 每完成一文件立即跑 `npx tsc -b --pretty false`，让类型层做兜底验证
4. 全部清理后再开始新工作

## 4. 案例存档：2026-05-10 ScrollReader 五文件

| 文件 | 退化形式 | 处置 |
|---|---|---|
| `src/components/Reader/ScrollReaderView.tsx` | 内联 `ScrollReaderShell`、删除 `getPosition` API、删除 `initialChapterProgress` prop、补 10+ 行 `// ── XXX ──` 注释墙 | `checkout HEAD --` |
| `src/components/Reader/scrollReader/useChapterResizeObserver.ts` | 5 个 helper 全部内联回 hook | `checkout HEAD --` |
| `src/components/Reader/scrollReader/useReaderUnmountCleanup.ts` | `ReaderUnmountCleanupDeps` interface 改回内联对象类型 | `checkout HEAD --` |
| `src/components/Reader/scrollReader/useScrollReaderRefs.ts` | `ScrollPipelineState.IDLE` 改成裸字符串 `'idle'` | `checkout HEAD --` |
| `src/components/Reader/scrollReader/useVirtualHeightCommit.ts` | 3 个 helper 全部内联回 hook，`@/engine` 退化为 `../../../engine` | `checkout HEAD --` |

判定主线为正确版本的依据：

- `getPosition` / `ReaderModePositionSnapshot` / `initialChapterProgress` 仍被 `ReaderView.tsx`、`useAtomicDomCommit.ts`、`PaginatedReaderView.tsx`、`atomicDomCommitDom.ts`、`usePaginatedPageLayout.ts`、`readerModeSwitchPosition.test.ts` 等 6 处消费 —— 删除会立刻引发编译错误。
- `ScrollPipelineState.IDLE` 仍在 `scrollPipelineRuntime.ts` 与同名测试中以枚举形式使用，字面量化会破坏类型一致性。
- 5 个 helper 源文件（`ScrollReaderShell.tsx`、`chapterResizeObserverTargets.ts`、`virtualHeightCommitState.ts`、`scrollChapterLoad.ts`、`readerModeSwitchPosition.ts`）均仍存在于仓库中，主线消费链完整。

结论：5 个文件均为纯逆向覆盖，无需 stash 即可全部 checkout。

## 5. 防御建议

- 长时间会话开工前先 `git pull --ff-only && git status`；`status` 非空时先弄清来源再写新代码。
- 多会话并行时，每个会话开工前重读受影响文件首尾若干行，避免基于内存中过期 cache 编辑。
- 发布性 refactor 完成立即提交，缩小被覆盖的时间窗口。
- 抽出的 helper 同步加单元测试钉住接口；下一次"内联回去"会因为测试找不到导出而 fail，提供拦截信号。
- 大段空白注释墙（仅起目录作用）一旦出现，先怀疑是会话冲突而非"补文档"。

## 6. 复盘

本次冲突没有造成线上影响，因为发现在 working tree 阶段。但若误提交，会让最近 5 次 refactor 提交（`9be7b25`、`6cec81d`、`3df1717`、`2af4049` 等）的成果全部蒸发。流程教训：**多会话并行编辑高敏感模块（reader 核心）时，必须主动 `git status` 而非默认信任 working tree 干净**。
