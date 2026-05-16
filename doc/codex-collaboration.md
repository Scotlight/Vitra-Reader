# Claude Code 与 codex 协作指南

最后更新：2026-05-10

## 1. 哲学与分工

**Claude Code 主控、codex 执行**。两者**禁止同时跑同一项目**——上次踩过的多会话逆向覆盖（见 `multi-session-conflict-handling.md`）就是源于此。

具体分工：

| 角色 | 职责 |
|---|---|
| **Claude Code** | 产品决策、架构设计、前端实现（React 组件 / UI / 状态层 / 路由）、规划、审阅 |
| **codex** | 后端 / 接口实现、代码审查、bug 修复、单测编写 |

本仓库本机的相关配置分两处（都在 `.gitignore` 内或位于用户目录，不会推送）：

| 文件 | 作用 |
|---|---|
| `~/.claude.json`（project 段） | codex MCP server 注册（通过 `claude mcp add` 写入，详见 §3） |
| `.claude/agents/codex-coder.md` | 派发任务时使用的子代理定义 |
| `.claude/commands/codex.md` | `/codex <task>` slash command |
| `.claude/commands/codex-review.md` | `/codex-review <target>` 专项审查 |
| `.claude/commands/codex-fix.md` | `/codex-fix <bug>` bug 修复（先复现再修） |

## 2. 调用方式

四种 slash + 一种自主模式：

| 入口 | 走法 | 用途 |
|---|---|---|
| `/codex <task>` | `codex-coder` subagent → `codex exec` | 中小实现（后端 / 接口） |
| `/codex-review <target>` | `codex-coder` subagent → `codex review` | 专项代码审查 |
| `/codex-fix <bug>` | `codex-coder` subagent → `codex exec` + 复现优先 | bug 修复 |
| `Agent({ subagent_type: "codex-coder" })` | 直接 subagent，无 prompt 模板 | 编程化派发 |
| **`/goal <objective>`**（在 codex TUI 内） | codex 内部 slash，**不经 CC** | 大任务自主推进，详见 §9 |

**禁止**主对话直接 `codex exec` —— 必须走 subagent / slash 才受 §4 冲突护栏与 §6 禁区约束保护。

## 3. MCP 模式说明

**MCP 配置不在 `.claude/settings.json`**——那个文件只承载 hooks / permissions / preferences。MCP 通过 `claude mcp add` 命令注册，CC 内部把它落到 `~/.claude.json` 的 project 段：

```bash
claude mcp add codex -- codex mcp-server
```

默认 `--scope local`，仅对当前 cwd 生效，不污染其他项目，也不入版本库。验证：

```bash
claude mcp list
# codex: codex mcp-server - ✓ Connected
```

CC 启动时拉起 `codex mcp-server`（stdio 模式），暴露的工具以 `mcp__codex__*` 形式注入 CC 工具列表。

**生效条件**：必须**重启 Claude Code 会话**。当前已开的会话不会自动重连/加载新增 MCP。

**写错位置的教训**：本仓库初版曾把 `mcpServers` 写到 `.claude/settings.json`，CC 完全忽略且不报错——直到 `claude mcp list` 输出里缺失 codex 才暴露。**下次 MCP 配置出问题，第一步永远是 `claude mcp list` 自检**。

## 4. 多会话冲突的硬护栏

`codex-coder` 子代理的工作流第 1 步是 `Get-Process codex`。只要返回 ≥ 1（即用户已开 codex CLI 交互会话），**派发立即拒绝**，输出"用户正在使用 codex，本次派发取消"。

这是 2026-05-10 事故后加上的强制护栏 —— 那次事故里 CC 派发的 codex 子进程被 codex 单实例锁卡死 27 分钟，CPU 0%。

**注意**：MCP server 模式下，CC 也会拉起一个 codex 子进程（mcp-server）。如果用户**同时**开 codex CLI，两边会抢锁。任意时刻只跑一个 codex 实体。

## 5. 产物隔离

所有 codex 任务说明 / 日志 / 中间产物**必须**写到：

```
outputs/runtime/codex-handoff/<YYYYMMDD-HHMMSS>.{task,log,diff,repro,review}.md
```

`outputs/runtime/` 已在 `.gitignore`，不会推送。

**严禁** codex 写到 `docs/plans/` —— 那个目录历史上有 60+ 份 vibe/codex 产物被无意 commit 推送过（远程已永久留痕），不再让新产物进去。

## 6. 禁区清单

`codex-coder` 子代理提示词钉死，codex 永远不能动以下文件：

- `AGENTS.md` / `CLAUDE.md` / `.claude/**`（规则层禁修改）
- `package.json` / `package-lock.json`（依赖层禁修改）
- `.gitignore`（推送策略禁修改）
- `electron/main.ts` / `electron/preload.ts`（IPC 表面禁修改）
- 任何 git 写操作（commit / push / reset / checkout）—— 永远人工

如需修改这些文件，由人工或 CC 主对话直接处理。

## 7. 沙盒与 model

- 沙盒：固定 `-s workspace-write`，禁止 `danger-full-access`
- model：跟随 codex 全局 `~/.codex/config.toml`（当前是 gpt-5.5 + xhigh reasoning）；如需快速便宜的任务可在调用时加 `-m gpt-4o-mini` 临时覆盖
- `~/.codex/AGENTS.md` 已配 Superpowers 与轻量任务策略，不在本指南覆盖范围

### Windows 平台特别注意：`[windows] sandbox` 字段命名陷阱

`~/.codex/config.toml` 里 `[windows] sandbox = "elevated"` **看起来像"以管理员身份运行命令"**，实际不是。源码（`codex-rs/core/src/windows_sandbox.rs`）确认：

| 值 | 实际含义 | 隔离强度 |
|---|---|---|
| `"elevated"` | 启用 Windows OS 自带的 Windows Sandbox feature（VM-like 容器），**首次** setup 弹一次 UAC，之后运行**不再提权** | 最强 |
| `"unelevated"` | Restricted Token + private desktop | 弱（同会话内） |
| 不写 | Sandbox 关闭，Windows 上 workspace-write **强制降级为 read-only**，codex 几乎残废 | — |

结论：本仓库的 codex-coder subagent 钉死 `-s workspace-write`，要让它真生效必须启用 sandbox，**`"elevated"` 是最优档**。看到这行不要"为了安全"删掉或改 unelevated——会反向降级。

完整源码考据见 `outputs/runtime/codex-handoff/20260516-175441.codex-windows-sandbox-investigation.md`。

## 8. 与 multi-session-conflict-handling.md 的关系

那份文档讲"已经发生的多会话冲突如何小步整理回退"。本指南讲"如何从根上避免再发生"。

两者一个是事后处置 SOP，一个是事前协作架构，配套看。

## 9. `/goal` 模式（codex 自主长任务）

codex CLI 0.128 起的实验特性，把"目标"提升为**持久 thread state**（SQLite `thread_goals` 表），模型有 `get_goal / create_goal / update_goal` 工具，runtime 在 idle 时可自动注入 continuation 推进任务。

**这是 codex CLI TUI 内部 slash，不通过 CC 派发，也不通过 `codex mcp-server` 暴露**。

### 适用 vs 不适用

| 适用 | 不适用 |
|---|---|
| 修一整套 flaky 测试到全绿 | "improve the repo" 这类模糊清理 |
| 实现一个 named spec phase | 开放研究无终止条件 |
| bounded PR 评审与回复 | Codex Desktop 端（无此功能） |
| 单个新工具 + 配套验证 | 团队共享流程（仅 CLI） |

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

### 与 CC 的边界

- `/goal` 只在 CLI TUI 内可用，**不通过 mcp-server 暴露给 CC**
- CC 主对话识别"大且终点明确"的任务时，应**建议人工进 codex TUI 走 `/goal`**，不要派 `codex exec` 强行拆解
- `/goal` 模式下 codex 自主推进，**CC 不插手**直到用户回报结果

### 好目标 vs 坏目标

```
✓ /goal fix the flaky OAuth callback test and push the smallest safe patch
✓ /goal implement Phase 0 of the SEO eval harness, run the documented verification, and leave a short handoff note

✗ /goal improve the repo
✗ /goal make it faster
```

### 来源

OpenAI Codex CLI 0.128.0 (rust) 源码 `slash_dispatch.rs` / `goal_tool.rs` / `goals.rs` / `0029_thread_goals.sql`，feature flag `goals`。

## 10. 本机 hook 防御层（不入库）

`.claude/hooks/` 下挂 PreToolUse + PostToolUse 五个脚本（PowerShell），在 §1-§9 提示词层之外做硬隔离与自动验证。已在 `.claude/settings.local.json` 注册（本机配置，未推送）。

设计原则：**默认让 AI 全自动**，只拦"系统级 / 历史级 / 数据级"真正不可逆的危险，常规改文件全部放开。

### PreToolUse（写之前的硬拦截）

| matcher | 脚本 | 拦截范围 |
|---|---|---|
| `Bash` | `guard-bash.ps1` | `rm -rf` / `Remove-Item -Recurse[-Force]` / `rd /s` / `del /s` / 磁盘级 cmdlet（`Format-Volume` / `Clear-Disk` / `diskpart` / `cipher /w`）/ Unix 擦盘（`shred` / `dd of=/dev/*` / `mkfs.*`）/ 盘根删除（`X:\`）/ 用户主目录删除（`~` / `$HOME` / `%USERPROFILE%`）/ `.NET Delete API` / `Node fs.rmSync(...recursive)` / `Get-ChildItem -Recurse \| Remove-Item` 等枚举删组合 / `git push --force[-with-lease]` / `git reset --hard` / `git clean -f*` / `--no-verify` / `git checkout HEAD -- <file>` / `git commit --amend` / `git rebase -i` / `pnpm` / `yarn` / `codex exec` 带 `danger-full-access` / `--dangerously-bypass-approvals-and-sandbox` / `-s read-only` |
| `Write\|Edit\|MultiEdit` | `guard-write.ps1` | 只拦 `docs/plans/` / `AGENTS.md`。`package.json` / `.gitignore` / `electron/main.ts` / `electron/preload.ts` 已放开（由 PostToolUse tsc 验证兜底） |
| `mcp__playwright__browser_run_code_unsafe\|mcp__playwright__browser_evaluate\|mcp__js-reverse__evaluate_script\|mcp__chrome-devtools__evaluate_script` | `guard-mcp.ps1` | 任意 JS 工具脚本里出现：fs 删除 API / `require('fs'\|'child_process'\|'os')` / `child_process spawn execSync` / 调 `powershell.exe \| cmd /c` / 字符串里 `rm -rf` / `Remove-Item -Recurse` / 读 `document.cookie \| localStorage \| sessionStorage \| indexedDB` / fetch 非本地 POST/PUT/DELETE / `sendBeacon` 外传 / `eval()` / `new Function()` / `window.location` 跳 `file:\|javascript:\|data:` |

命中 → `exit 2` + stderr 回流给模型，主对话能看到拦截原因。

### PostToolUse（写之后的自动验证）

| matcher | 脚本 | 触发条件 | 行为 |
|---|---|---|---|
| `Write\|Edit\|MultiEdit` | `post-verify.ps1` | 改的是 `.ts` / `.tsx` / `package.json` | 自动跑 `npx tsc -b --pretty false`，错就把输出回流给模型，模型自己修 |

这一层让 AI 不需要每改完一个文件就停下"等用户跑 tsc"，AI 看到 hook stderr 自动闭环。

### 关键点

- **hook 配置不热重载**：改 `.claude/settings.local.json` 或 `.ps1` 脚本必须**新开 CC 会话**才生效
- **测试脚本**：
  - `outputs/runtime/test-hooks.ps1`（原 56 规则）
  - `outputs/runtime/test-hooks-extra.ps1`（循环删 + MCP 共 16 规则）
  - `outputs/runtime/test-write-unlocked.ps1`（放开 4 项 + 保留禁区 11 规则）
- **盲点**：codex 子进程不走 CC 工具层（靠 codex Windows Sandbox `elevated` OS 级隔离）；CC 写脚本到磁盘让用户手动跑，hook 不看脚本内容
- **首次踩坑教训**：guard-bash 早期版本曾拦死所有 `codex exec`，导致 subagent 派发链路被自己拦死——修复后只拦 sandbox flag 改写，不拦裸命令
- **`package.json` 放开教训**：早期把 `package.json` 也拦了，导致接入 electron-builder 这类任务必须让用户手动 Copy-Item 覆盖。后改为"PreToolUse 放开 + PostToolUse tsc 兜底"，AI 才能真正全自动
