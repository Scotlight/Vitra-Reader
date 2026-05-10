# 项目级 Claude Code 约束

本文件**只承载本项目特有的硬约束**。全局 `~/.claude/CLAUDE.md` 已覆盖的（中文输出、ACE 工具优先级、不主动 push、不主动 commit、不写注释、Git Safety Protocol、destructive 命令需确认 等）不再重复，默认遵守。

优先级：用户当前会话明确指令 > 本文件 > 全局 `~/.claude/CLAUDE.md` > 项目根 `AGENTS.md`。冲突时**先报告**而不是擅自决定。

---

## 1. 项目特有的不可逆禁区 [硬性]

全局已禁的（`rm -rf` / `git reset --hard` / `push --force` / `clean -fd` / `commit --no-verify` 等）默认遵守。本项目**额外硬禁**：

- **`git checkout HEAD -- <file>` 单文件回滚**——除非主对话明确确认这是 §3 多会话冲突的整理步骤
- **修改 `.gitignore`**——影响推送策略，必须人工确认
- **修改 `package.json` 的 `dependencies` / `devDependencies`**——版本变化牵连构建与安装链
- **修改 `electron/main.ts` / `electron/preload.ts`**——IPC 表面，错改导致渲染进程崩
- **清空 IndexedDB / `localStorage.clear()`**——本应用书库、高亮、设置都在客户端持久化
- **`git rm` 任何 `docs/plans/` 历史文件**——已 tracked 推送过远程，强行删会让远程历史不一致
- **`pnpm`/`yarn` 切换包管理器**——本仓库锁定 `npm`，混用会破 lockfile

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
3. **codex CLI 与 CC 不得同时运行本项目**。`codex-coder` subagent 工作流第 1 步会 `Get-Process codex` 检测，≥1 即拒发——绕过这层护栏 = 直接违反本约束

---

## 4. 文档目录约定 [硬性]

| 路径 | 规则 |
|---|---|
| `doc/` | 新增规范、指南、协作约定**只许**放这里 |
| `docs/` | 历史已有，**不主动新增**任何文件 |
| `docs/plans/` | 历史污染区（已 tracked 60+ 份 codex 产物，部分推送过远程），**绝对禁止**再写入 |
| `outputs/runtime/codex-handoff/` | codex 任务产物 `<ts>.{task,log,diff}.md`（已 gitignore） |
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

---

## 6. CC 与 codex 分工 [硬性]

| 角色 | 职责 |
|---|---|
| **Claude Code** | 产品决策、架构设计、**前端实现**（React 组件 / UI / 状态层 / 路由）、规划、审阅 |
| **codex** | **后端 / 接口实现**、代码审查、bug 修复、单测编写 |

调用入口（按用途选）：

| Slash | 走法 | 用途 |
|---|---|---|
| `/codex <task>` | `codex-coder` subagent → `codex exec` | 中小实现（后端 / 接口） |
| `/codex-review <target>` | `codex-coder` subagent → `codex review` | 专项代码审查 |
| `/codex-fix <bug>` | `codex-coder` subagent → `codex exec` + 复现优先 | bug 修复（先复现再修） |
| `/goal <objective>`（人工进 codex TUI） | codex 内部 slash，**不经 CC**（详见 §10） | 大任务自主推进 |

硬性约束：

- **不允许**主对话直接 `codex exec ...`——必须走 subagent / slash
- 派发**前**：`Get-Process codex` 检测 ≥1 拒发，`git status` 必须 clean
- 产物**只许**落 `outputs/runtime/codex-handoff/`，越界 = 立即停手 + 报告
- codex 改完 working tree **必须** `git diff --stat` 审计；动了 §1 禁区文件**必须** `git stash push -m "codex-out-of-scope-<ts>"` 留人工
- codex 跑完不得自行 `git commit` / `git push`
- 详见 [doc/codex-collaboration.md](doc/codex-collaboration.md)

---

## 7. 工具链速查

| 任务 | 命令 |
|---|---|
| 类型检查（每次提交前） | `npx tsc -b --pretty false` |
| 单测 | `npx vitest run <pattern>` |
| dev（Electron + Vite） | `npm run dev` |
| codex 派发 | `/codex <task>` |
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

任何 ≥50 行实现 / 跨 ≥3 文件 / 涉及上述 §5 高敏区的工作，**先写 plan**（落在 `outputs/runtime/` 或主对话），用户确认方向后再动手。直接写代码的本能 → 改成"先 plan 再 codex"。

---

## 10. codex `/goal` 模式 [人工触发，CC 不插手]

codex CLI 0.128 起的实验性 slash（feature-gated `goals`），把"目标"提升为**持久 thread state**：模型有 `get_goal / create_goal / update_goal` 工具，runtime 在 idle 时自动注入 continuation 推进任务。**这是 codex CLI TUI 内部 slash，不通过 CC 派发，也不通过 `codex mcp-server` 暴露**。

### 适用场景

- 修一整套 flaky 测试到全绿
- 实现一个 named spec phase
- bounded PR 评审与回复
- 单个新工具 + 配套验证

### 不适用

- 模糊清理（"improve the repo"）
- 开放研究无终止条件
- Codex Desktop 端 / 团队共享流程

### 启用

```bash
codex features list             # 查 goals 是否可用
codex features enable goals     # 持久启用
codex --enable goals            # 仅本次启动启用
```

### 用法（在 codex TUI 内）

```
/goal <objective>      # 设目标
/goal pause            # 暂停
/goal resume           # 继续
/goal clear            # 清除
/goal                  # 打开 goal UI
```

### CC 的判定职责

接到任务时若识别为 "/goal 适用"（大 + 有清晰终点 + 可量化完成），CC **必须**建议人工进 codex TUI 走 `/goal`，**不要**自己派 `codex exec` 拆细——后者会失去 `/goal` 的 budget / continuation 能力。

详见 [doc/codex-collaboration.md](doc/codex-collaboration.md) §9。
