# Claude Code 与 codex 协作指南

最后更新：2026-05-10

## 1. 哲学

**Claude Code 主控、codex 执行**。CC 负责规划、审阅、拒绝；codex 负责具体编码。两者**禁止同时跑**——上次踩过的多会话逆向覆盖（见 `multi-session-conflict-handling.md`）就是源于此。

本仓库本机的相关配置分两处（都在 `.gitignore` 内或位于用户目录，不会推送）：

| 文件 | 作用 |
|---|---|
| `~/.claude.json`（project 段） | codex MCP server 注册（通过 `claude mcp add` 写入，详见 §3） |
| `.claude/agents/codex-coder.md` | 派发任务时使用的子代理定义 |
| `.claude/commands/codex.md` | `/codex <task>` slash command |

## 2. 三种调用方式

| 层次 | 触发 | 适用 |
|---|---|---|
| **L1 Bash 直调** | 主对话里直接 `codex exec -s workspace-write "..."` | 一次性、CC 自己不写代码只想换个脑子 |
| **L2 Subagent** | `Agent({ subagent_type: 'codex-coder', prompt: ... })` | 规范化派发，自动走全流程审计 |
| **L3 Slash Command** | 在终端打 `/codex <task>` | 用户主动触发，最常用 |

L2 / L3 内部都走 `codex-coder` 子代理，安全约束统一。

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
outputs/runtime/codex-handoff/<YYYYMMDD-HHMMSS>.{task,log,diff}.md
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

## 8. 与 multi-session-conflict-handling.md 的关系

那份文档讲"已经发生的多会话冲突如何小步整理回退"。本指南讲"如何从根上避免再发生"。

两者一个是事后处置 SOP，一个是事前协作架构，配套看。
