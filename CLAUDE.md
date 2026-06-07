# 项目级 Claude Code 约束

本文件**只承载本项目特有的硬约束**。全局 `~/.claude/CLAUDE.md` 已覆盖的（中文输出、ACE 工具优先级、不主动 push、不主动 commit、不写注释、Git Safety Protocol、destructive 命令需确认 等）不再重复，默认遵守。

优先级：用户当前会话明确指令 > 本文件 > 全局 `~/.claude/CLAUDE.md` > 项目根 `AGENTS.md`。冲突时**先报告**而不是擅自决定。

---

## 1. 项目特有的不可逆禁区 [硬性]

全局已禁的（`rm -rf` / `git reset --hard` / `push --force` / `clean -fd` / `commit --no-verify` 等）默认遵守。本项目**额外硬禁**：

- **`git checkout HEAD -- <file>` 单文件回滚**——除非主对话明确确认这是 §3 多会话冲突的整理步骤
- **清空 IndexedDB / `localStorage.clear()`**——本应用书库、高亮、设置都在客户端持久化
- **`git rm` 任何 `docs/plans/` 历史文件**——已 tracked 推送过远程，强行删会让远程历史不一致
- **`pnpm`/`yarn` 切换包管理器**——本仓库锁定 `npm`，混用会破 lockfile

### 高敏文件（可写但有自动验证）

以下文件 AI 可以直接 Write/Edit，但 PostToolUse hook 会自动跑 `npx tsc -b --pretty false` 校验。改完必须**主动报告改了什么 + 验证结果**给用户：

- `package.json` / `package-lock.json`（依赖链）
- `.gitignore`（推送策略）
- `electron/main.ts` / `electron/preload.ts`（IPC 表面）

类型检查不过 → 立即修复，不留烂摊子。

---

## 2. 提交粒度 [硬性，全局未覆盖部分]

- 一个 commit = **一个独立逻辑改动**，不混合"功能 + 重构 + 格式化"
- 每个 commit 必须 `npx tsc -b --pretty false` 通过
- 提交前必须 `git diff --stat` + `git diff` 自审
- message 格式：`<type>(<scope>): <中文短句>`
  - type：`feat` / `fix` / `refactor` / `style` / `chore` / `docs` / `test`
  - scope（已有的）：`reader` / `engine` / `library` / `electron` / `dev`
  - 参考：`git log --oneline -10`
- 禁用的 message：`WIP` / `tmp` / `update` / `fix bug` / `change` / 任何无信息量空话
- 不 squash 已有 commit；不 amend 已 push 的 commit

### 自动 commit + push 行为

用户给一个完整任务（如"接入 electron-builder"）后，AI **应该全自动闭环**：

1. 改全部所需文件（不要每改一个就停下问）
2. PostToolUse hook 自动跑 tsc，错就立即修
3. `git diff --stat` + `git diff` 自审
4. 按 message 规范**自 commit**
5. **自 push** 到当前分支的 origin（普通 `git push` 走 hook 放行，force-push / reset / amend 仍被 hook 拦死）
6. 报告完成 + commit hash + push 结果

**不要**把任务拆成"我做 X，你做 Y"让用户接手——除非确实需要用户人工干预（比如外部凭证、UAC 提权窗口）。

例外（push 前必须停下确认）：
- 改动跨越 ≥ 10 个文件且涉及 §5 Reader 高敏区
- 改动包含 `package.json` 的 `dependencies` 字段（新增/删除/升级依赖）
- commit message 涉及破坏性变更（`feat!:` 或 message 含 `BREAKING CHANGE`）

这三种情况 commit 后停下，列出 commit hash + diff 摘要，等用户说"推"。

---

## 3. 多会话冲突防御 [硬性流程]

本仓库已发生过 ≥1 次"另一会话基于过期快照覆盖最新 refactor"事故。**任何写操作前**：

1. `git status` 必须 clean。**非空就停下**，按 [doc/multi-session-conflict-handling.md](doc/multi-session-conflict-handling.md) 鉴别来源
2. 检测到以下信号 ≥3 条 = 几乎可断定冲突，**禁止继续写**：
   - import 路径从 `@/xxx` 退回 `../../../xxx`
   - 抽离的 helper 内联回 hook
   - 命名 `interface` 改回内联对象类型
   - enum 常量改裸字符串字面量
   - 已分离的子组件 JSX 搬回父组件
   - 大段 `// ── XXX ──` 目录性注释墙凭空冒出

---

## 4. 文档目录约定 [硬性]

| 路径 | 规则 |
|---|---|
| `doc/` | 新增规范、指南、协作约定**只许**放这里 |
| `docs/` | 历史已有，**不主动新增**任何文件 |
| `docs/plans/` | 历史污染区（已 tracked 60+ 份历史产物，部分推送过远程），**绝对禁止**再写入 |
| `outputs/runtime/` | 一切 AI 工作流副产品兜底（已 gitignore） |

任何"每完成一步写一份计划"风格的产物**绝不**允许落到 `docs/plans/` 或 `docs/`。

---

## 5. Reader 模块工作守则 [高敏区]

`src/components/Reader/` 是 refactor 高频区 + 多会话冲突重灾区。改这里**必须**：

1. 开工前 `git log --oneline -20 -- src/components/Reader/` 扫近期变更
2. 修改跨模块 API 前**必须 grep 消费链**。已知敏感符号：
   - `getPosition` / `ReaderModePositionSnapshot` / `initialChapterProgress`
   - `ScrollPipelineState` / `ScrollReaderShell` / `ScrollReaderHandle`
   - `virtualHeightCommitState` / `chapterResizeObserverTargets` / `scrollChapterLoad` / `scrollPipelineRuntime`
   - `useChapterResizeObserver` / `useVirtualHeightCommit` / `useReaderUnmountCleanup`
3. 抽离 helper 必须**同步加单元测试**。下一次"内联回去"会被测试 fail 拦下
4. 完成后必须 `npx tsc -b --pretty false`，无输出 = 通过
5. **禁止用注释墙拆 hook**。hook 太长是职责未拆的味道，先想 `useXxx` 抽离

### CC 直接改 Reader 的底线 [硬性]

Reader 高敏区 CC **默认不直接 Write/Edit**，走 §6 plan-codex 流程。例外（满足任一即可）：

1. 用户当前会话明确说"这次你自己改 Reader"
2. **小改豁免**：同时满足以下全部条件时 CC 可直接改：
   - ≤1 个文件
   - ≤10 行变更（含增删）
   - 不涉及上述敏感符号
   - 改动性质为**纯减法**：死代码删除 / import 清理。**禁止**常量值调整、属性值修改、任何"改一个值"的操作——改值 = 改行为，必须走 §6 流程
   - 该文件必须有现存 vitest 测试覆盖（`npx vitest run <pattern>` 能命中 ≥1 个 test file），且改完全绿
   - 改完立即 `npx tsc -b --pretty false` + 上述 vitest 子集

不满足以上任一例外 → CC 直接动手 = 重大违规，立即停下道歉。

---

## 6. CC 与 codex 协作 [人工中转]

codex 由**用户手动接入**，CC 不调 codex（无 subagent 派发，无 `codex exec`）。CC 的本质是**出 plan + 复查**。

工作流：

1. **CC 出 plan**：列改动文件、敏感符号影响面、新增/调整的 hook 拆分意图、单测要求。plan 落到 `outputs/runtime/<ts>-<topic>.md`
2. **用户人工移交 codex**：用户把 plan md 喂给 codex 实施
3. **CC 接 diff 复查**：用户告知完成后，CC 主动 `git diff` + `git diff --stat` 自审。命中以下任一立即 `git stash push -m "codex-out-of-scope-<ts>"` 留人工：
   - 改动文件超出 plan 范围
   - §3 多会话冲突 6 条信号命中 ≥3
   - hook 被内联回组件 / interface 被改回内联类型 / `@/xxx` 退回 `../../../xxx`
   - 动了 §1 禁区文件
4. **CC 跑回归**：`npx tsc -b --pretty false` + 涉及到的 vitest 子集
5. **CC 报告**：commit 候选 message + diff 摘要 + 验证结果给用户，等用户说"提交"

复查反模式（不允许）：

- ❌ "diff 看着还行" = 没认真看。逐文件审
- ❌ 只跑 tsc 不跑 vitest 子集 = 类型对了行为不一定对
- ❌ 越界改动不 stash 直接接受 = 把 codex 的越界写进自己的 commit

---

## 7. 工具链速查

| 任务 | 命令 |
|---|---|
| 类型检查（每次提交前） | `npx tsc -b --pretty false` |
| 单测 | `npx vitest run <pattern>` |
| dev（Electron + Vite） | `npm run dev` |
| MCP 自检 | `claude mcp list` |
| PDF 提取 | `pdftotext`（poppler 已装，winget 路径） |
| 代码探索（首选） | `mcp__ace-tool-rs__search_context` |
| 跨文件改名前查引用 | Grep 全仓 + `npx tsc -b` |

---

## 8. 不入版本库的目录（已 .gitignore）

- `dist/` `dist-electron/` `node_modules/`
- `bug/` `extracted/` `logs/`
- `outputs/runtime/` —— 所有 AI 工作流产物兜底
- `.claude/` —— 本机 hooks / agents / commands
- `docs/chat_export/` `docs/virtual-render/` `docs/promo/`
- 部分 `docs/plans/2026-04-*` 历史 plan

新建 AI 副产品默认落到这些路径下，自动不入库。

---

## 9. 工程文化

### 及时推倒重做

走错方向时**不要硬撑**。出现以下信号时停下来重估：

- 实现已超过 ~100 行，但发现架构假设不对
- 测试反复改不通，根因指向更深层设计问题
- 改 A 模块导致 B / C 模块连锁修，补丁越打越深
- 同一个文件被改回又改回 ≥3 次

→ 此时正确动作不是"再改一版"，而是 `git reset` 回上一个干净 commit（须用户确认）+ 重新 plan。覆盖性补丁堆 5 层 ≠ 进步。

承认走错重做的成本，几乎总是低于"沿错误方向再走 200 行"的成本。

### Plan 优先

任何 ≥50 行实现 / 跨 ≥3 文件 / 涉及上述 §5 高敏区的工作，**先写 plan**（落在 `outputs/runtime/` 或主对话），用户确认方向后再动手。直接写代码的本能 → 改成"先 plan 再实现"。

---

## 10. yolo 自约束 [硬性意识层]

**用户在 Claude Code `bypassPermissions`（yolo）模式下使用本会话**。意味着：

- 用户不会被 permission 对话框打断
- PreToolUse hook 命中只会回流 stderr 给我，**用户看不到**
- 我做的每一步，**用户事后才会通过 diff / commit / push 结果发现**

因此每个工具调用前，我必须自问：

1. **如果这个操作出问题，用户能在几秒内回滚吗？** 不能 → 停下，主动汇报+等确认（除非操作在 §1 / §5 已明确允许范围内）
2. **这个操作的副作用边界是什么？** 副作用超出当前任务描述 → 停下
3. **我是不是在"试一下看看"？** 是 → 不允许。yolo 模式不是探索模式，每步都要有明确预期结果

特别警惕：

- **看到 hook 拦截后不要换个写法绕过**——拦截理由通常是底层风险，不是语法问题。换姿势再撞 = 主动违规
- **失败 ≥ 2 次的同类操作**：停下重新理解需求，不要堆补丁
- **§5 高敏区 + 全自动 push 组合**：远程历史污染最快的路径。这个组合下 push 前必须看完整 `git diff`（不是 `--stat`），有任何疑问就停下

撒手不管 ≠ 全自动。**全自动 = 全责任**。yolo 模式下我背的责任比有 permission 对话框时更重，不是更轻。
