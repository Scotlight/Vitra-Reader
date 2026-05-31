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

## 2. 调用方式

三种入口 + 一种自主模式：

| 入口 | 走法 | 用途 |
|---|---|---|
| `/codex <task>` | `codex-coder` subagent → `codex exec` + wt 窗口 + 哨兵 | 中等实现（后端 / 接口、多文件 refactor） |
| `Agent({ subagent_type: "codex-coder" })` | 直接 subagent，无 prompt 模板 | 编程化派发大任务 |
| **`mcp__codex__codex` 工具** | 主对话直接调，同步 await response | 小型 read-only 审计 / 5 分钟内单查询（无 wt 窗口、零哨兵） |
| **`/goal <objective>`**（在 codex TUI 内） | codex 内部 slash，**不经 CC** | 大任务自主推进，详见 §9 |

**禁止**主对话直接 `codex exec` —— 必须走 subagent / slash 才受 §4 冲突护栏与 §6 禁区约束保护。`mcp__codex__codex` 工具不受同样护栏，但它走 mcp-server 通道，由 MCP 协议层做基本隔离。

**选哪个通道**详见 §12 决策矩阵。

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

`codex-coder` 子代理的工作流第 1 步做**目录级冲突检测**（不是进程级）：

- 无窗口标题的 codex 进程（mcp-server）→ 放行
- 窗口标题含 `CC-codex-` marker → CC 自己派的，放行
- 有窗口标题但不含 marker → 用户 TUI，**仅当其 cwd 指向本项目时**才拒发

这是 2026-05-10 事故后加上的护栏 —— 那次事故里 CC 派发的 codex 子进程被 codex 单实例锁卡死 27 分钟。2026-05-30 从进程级放宽到目录级：用户在其他项目跑 codex TUI 不再误拦本项目的派发。

**注意**：MCP server 模式下，CC 也会拉起一个 codex 子进程（mcp-server）。mcp-server 无窗口标题，检测脚本自动放行。

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

## 11. task.md 模式（CC 写任务书 → codex 自读自干）

针对"任务已经想清楚，不要 CC 再 plan 一遍"的场景。CC 把任务写成 md 落盘，派发时 prompt 只丢路径——绕开命令行中文编码 + 给 codex 高确定性的英文指令。

### 适用 vs 不适用

| 适用 | 不适用 |
|---|---|
| 改动 ≥ 3 文件、需事前钉死边界 | 单文件单函数小改（直接英文 prompt 更快） |
| 涉及 §5 高敏区敏感符号清单 | 探索性任务（边界没法事前列） |
| 跨模块 refactor 有明确产出 | `/goal` 适用场景（直接走 codex TUI，不经 CC） |

### 流程

1. **CC 写任务书**，落到 `outputs/runtime/codex-handoff/<YYYYMMDD-HHMMSS>.task.md`（已 gitignore，不入库）
2. **派 codex 时 prompt 用英文 + 只丢路径**：

   ```
   Read and execute the task specified in `outputs/runtime/codex-handoff/<ts>.task.md`.
   Stay strictly within the file scope listed there. Do not touch files outside the allowlist.
   Report back with a diff summary and any deviations.
   ```

3. **CC 接 diff 审**：`git diff --stat` + `git diff`，越界即 `git stash push -m "codex-out-of-scope-<ts>"`
4. **CC 跑回归**：`npx tsc -b --pretty false` + 相关 `npx vitest run <pattern>`

### 为什么中文 md + 英文 prompt

- **中文走 UTF-8 文件**：PowerShell 管道 / 命令行参数传中文经常掉字符（chcp / 控制台代码页 / BOM 各种坑）。文件读取走 fs API，UTF-8 透明
- **英文走 prompt**：OpenAI 模型英文训练语料占大头，工具调用 / 路径解析 / 边界遵守的确定性比中文 prompt 更高
- **任务书留底**：codex 偶尔越界时，能立刻翻 task.md 核对当初写的边界，diff 出问题不靠脑补

### task.md 内容骨架

```markdown
# <一句话目标>

## 背景
为什么做、上游事故 / 需求来源（≤3 句）

## 范围（必读，越界即 stash 撤回）
允许修改：
- src/xxx/yyy.ts
- src/xxx/zzz.ts

禁止触碰（§6 禁区 + 本任务额外锁定）：
- src/components/Reader/ 任何文件（如不涉及 §5）
- package.json / .gitignore / electron/**

## 敏感符号（如涉及 §5 高敏区）
- `getPosition` / `ScrollPipelineState` / `useChapterResizeObserver`
- 不允许内联 hook、不允许 `@/xxx` 退回相对路径

## 验收标准
- npx tsc -b --pretty false 通过
- 涉及的 vitest 子集全绿
- 不引入新依赖
- diff 总行数预算：±N 行（超出停下汇报）

## 实施提示（可选）
具体实现交给 codex，不写死细节；只标注必须遵守的约定
```

### 三件套时间戳约定

延续 §5 产物隔离规则，同一时间戳串联三个文件：

```
outputs/runtime/codex-handoff/
  20260523-143055.task.md     ← CC 写的任务（输入）
  20260523-143055.log.md      ← codex 自留日志
  20260523-143055.diff.md     ← CC 审完留底
```

### 与既有约定的关系

- **§5 高敏区双干工作流**：task.md 不替代 plan，**就是 plan 的载体**——`§5` 第 1 步「CC 出 plan」实际产物就是这份 task.md
- **§6 禁区清单**：task.md 的「禁止触碰」段必须显式列出 §6 禁区，给 codex 双保险
- **§4 多会话冲突防御**：派发前 `Get-Process codex` + `git status` clean 仍由 codex-coder subagent 第 1 步自动执行，task.md 不绕过

### 反模式

- ❌ task.md 写到 `docs/plans/`（命中 guard-write 拦截 + 历史污染区）
- ❌ 同时中文 task.md + 中文 prompt（双重编码风险，没必要）
- ❌ task.md 没有「范围」「敏感符号」「验收标准」三段（codex 无锚点 → 输出不可预测）
- ❌ 派发完不审 diff（task.md 是事前约束，diff 是事后核对，两步都做）
- ❌ 短任务硬要写 task.md（≤ 2 文件改动直接英文 prompt 更快）

## 12. 通道路由决策（exec / MCP / goal 怎么选）

§2 列了 5 个入口，**默认 `codex-coder` subagent → exec**——有 §10 hook 防护 + wt 可见性 + 步骤 4 try/finally 哨兵 + 步骤 5 watchdog 兜底。其他通道只在明确收益时切换。

### 决策矩阵

| 任务特征 | 通道 | 理由 |
|---|---|---|
| read-only 审计 / grep 残留验证 | `mcp__codex__codex` | 秒级返回，零哨兵零 wt |
| 单一咨询（"为啥这样写"、"有没有更好的方案"） | `mcp__codex__codex` | 不需要看进度 |
| 单文件 ≤50 行小改 + 不涉及 §5 | `mcp__codex__codex` | 同上 |
| 多文件 refactor（3-5 文件） | `codex-coder` subagent → exec | wt 实时可见、长 log 不爆 CC context |
| 跨模块改动 / 涉及 §5 Reader 高敏区 | `codex-coder` subagent → exec | 同上 + diff 审计强制 |
| 任务预估 >5 分钟 | `codex-coder` subagent → exec | MCP 单次调用 ~5 分钟 timeout 风险 |
| 涉及 §6 禁区 | CC 主对话直接做 | 不让 codex 碰 |
| 大任务 + 明确终点 + 可量化 | `/goal`（codex TUI） | budget / continuation 自主推进，详见 §9 |

### 两个主要通道对比

| 维度 | `mcp__codex__codex` | `codex-coder` → exec |
|---|---|---|
| 派发→拿到结果 | 秒级（同步 await） | 分钟级（哨兵触发或 watchdog 兜底） |
| 可见性 | 不可见，黑盒 | wt 窗口实时看 codex 在干啥 |
| log 占用 CC context | response 直接进 context | 落盘 `<ts>.log.md`，CC 只拿摘要 |
| 长任务支持 | ❌ ~5 分钟 timeout | ✓ 40+ 分钟 OK |
| 哨兵机制 | 无（不需要） | 有（步骤 4 try/finally + 步骤 5 marker watchdog） |
| Ceremony 成本 | 0（prompt 直接传） | task.md（§11）+ subagent 链路 + 等哨兵 |

### 选 MCP 的判断信号

- 任务能用一句英文 prompt 写清楚
- 不需要中途观察 codex 行为
- 任务输出量小（response 不会撑爆 CC context）
- 任务时长预估 <5 分钟
- read-only 或最多动 1-2 个非高敏文件

满足以上 4+ 条 → 走 MCP；否则 fallback 到 exec。

### 实战示例

- ✓ MCP：「grep `src/` 验证 commit `94acb54` 是否还有 `wheelConfig` 残留，PASS/FAIL 一行报告」
- ✓ MCP：「读 `src/utils/mathUtils.ts` 的 `clampNumber` 实现，告诉我边界条件处理对不对」
- ✗ MCP：「重构 ScrollReader 把滚轮交回浏览器原生」（多文件 + §5 + 40 分钟 → exec）
- ✗ MCP：「修这个 bug，需要查 5 个文件的调用链才能定位」（>5 分钟 + response 大 → exec）

### 反模式

- ❌ 大型 refactor 走 MCP → timeout 拿半成品
- ❌ 简单 grep 走 exec → 40 分钟才出哨兵不值得
- ❌ §5 高敏区走 MCP → 失去 wt 可见性，diff 审计被弱化
- ❌ 同时跑 MCP 任务 + exec 任务 → 同机一个 codex 实体的原则被破坏（PID 1472 mcp-server 已经占一个 slot）

## 13. plan 往返审查模式（CC 出 plan ↔ codex 反审循环 → 派发 → codex 验收）

§11 task.md 是「CC 单方面想清楚 → 派 codex 干」。本模式是「CC 出 plan → codex 反审 → CC 修订 → 循环到双方对齐 → 再派发 → codex 验收」。

核心痛点：plan 阶段单方面 = plan 自身的 bug 要等实施完才暴露。这模式提前把 cx 拉进来当二审，避免实施完才发现 plan 本身漏 edge case / 低估影响面。

### 适用 vs 不适用

| 适用 | 不适用 |
|---|---|
| §5 高敏区 plan（Reader 模块跨模块改动） | 单文件 bug 修复（直接 §11 派发） |
| 跨模块 refactor ≥5 文件 + 不可逆架构决策 | 已有详细 spec / 已有用户钉死的实现路径 |
| API 改名、状态层重构、数据结构调整 | 探索性任务（边界没法事前列） |
| 实现路径有 2+ 候选 | `/goal` 适用场景（直接走 codex TUI） |

判定门槛：「实施一次出错回滚成本 ≥ 30 分钟」 = 值得走本模式预防。

### 流程

```
┌──────────────┐
│ CC 出 plan v1 │
└──────┬───────┘
       ▼
  ┌─────────────────────────┐
  │ mcp__codex__codex review │ ◄────┐
  └────────┬────────────────┘      │
           ▼                       │
        APPROVED?                  │
       ┌───┴───┐                   │
       ▼       ▼                   │
     YES      NO ──► CC 修订 plan ─┘
       │              （≤3 轮）
       ▼
  CC 派 codex-coder → exec（§11 task.md 模式）
       │
       ▼
  mcp__codex__codex 验收（diff vs plan）
       │
       ▼
   PASS / FAIL
```

#### 步骤 1：CC 写 plan v1

落到 `outputs/runtime/codex-handoff/<ts>.plan.md`，骨架同 §11 task.md（背景 / 范围 / 敏感符号 / 验收标准 / 实施提示）。

#### 步骤 2：mcp__codex__codex review plan

通道选 MCP 不选 exec：read-only 审计、秒级返回、零哨兵——完美匹配 §12 决策矩阵。

prompt 模板（英文，要求 cx 严格区分 BLOCKER vs SUGGESTION）：

```
Review the plan at `outputs/runtime/codex-handoff/<ts>.plan.md`.

Audit checklist:
1. Technical correctness — does the proposed approach actually work?
2. Edge cases — what does the plan miss?
3. Scope — is the file allowlist complete? any forbidden zones touched?
4. Simpler alternatives — is there a less invasive path that achieves the same goal?
5. Project constraints — conflicts with §5 high-sensitivity zone, §6 forbidden zone, or any constraint in CLAUDE.md?

Output format (strict):
- VERDICT: APPROVED | REVISE
- BLOCKERS: [list, each with file/symbol reference]. These MUST be fixed before execution.
- SUGGESTIONS: [list]. Optional improvements, do not block execution.
- ALTERNATIVE: [if any]. A different approach worth considering.

Return APPROVED only when there are zero BLOCKERS.
```

cx 返回 APPROVED → 进步骤 4。返回 REVISE → 进步骤 3。

#### 步骤 3：CC 修订 plan

对 BLOCKERS **必须**逐条响应，二选一：
- 吸收：改 plan，落新版 `<ts>.plan.v2.md`
- 驳回：在 plan 里加一段「Rebuttal to review v1」说明为什么 cx 这条意见不成立（技术理由，不是嘴硬）

SUGGESTIONS 看心情吸收，不阻塞。

修订完回步骤 2，让 cx 看 v2。

**循环上限 3 轮**。第 3 轮仍 REVISE → 停下让用户裁决。多轮分歧 = 方向问题 / 边界问题，不是局部技术问题，不该靠堆轮次解决。

#### 步骤 4：派 codex-coder subagent → exec

定稿 plan 重命名为 `<ts>.task.md`，走 §11 流程：英文 prompt + 任务书路径 + codex-coder subagent。

#### 步骤 5：mcp__codex__codex 验收

实施完成、CC 审完 diff 之后，再开一次 MCP 调用让 cx 对照 plan 验收：

```
Compare the implementation diff with the plan.

Plan: `outputs/runtime/codex-handoff/<ts>.task.md`
Diff: `outputs/runtime/codex-handoff/<ts>.diff.md` (or run `git diff <commit>~1..<commit>`)

Check:
1. Coverage — did implementation address every item in the plan?
2. Drift — did implementation touch files outside the allowlist?
3. Sensitive symbols — were the §5 sensitive symbols handled per plan?
4. Hidden regressions — any subtle behavioral change not called out in plan?

Output:
- VERDICT: PASS | FAIL
- COVERAGE_GAPS: [items in plan not implemented]
- SCOPE_DRIFT: [files touched but not in allowlist]
- HIDDEN_RISKS: [behaviors changed beyond plan intent]
```

PASS → CC 跑 tsc + vitest 收尾。FAIL → CC 决定改实施还是改 plan：
- 实施漏了 plan 里的项 → 派 codex 补做（小改用 MCP，大改用 exec）
- plan 没考虑到的副作用 → 回步骤 2 重审 plan

### 文件命名（延续 §5 / §11 时间戳约定）

```
outputs/runtime/codex-handoff/
  20260524-HHMMSS.plan.md         ← CC v1
  20260524-HHMMSS.review.v1.md    ← cx 反审 v1（落 mcp 返回）
  20260524-HHMMSS.plan.v2.md      ← CC 修订
  20260524-HHMMSS.review.v2.md    ← cx 反审 v2
  ...                              （最多 3 轮）
  20260524-HHMMSS.task.md         ← 定稿 = 派发任务书
  20260524-HHMMSS.log.md          ← codex 实施日志（exec 落）
  20260524-HHMMSS.diff.md         ← CC 审完留底
  20260524-HHMMSS.verify.md       ← cx 验收报告
```

### 与既有约定的关系

- **§5 高敏区双干工作流**：§5 第 1 步「CC 出 plan」升级为本模式的步骤 1-3，其他步骤不变
- **§11 task.md 模式**：本模式步骤 4 完全等同 §11，定稿 plan 就是 §11 的 task.md
- **§12 通道路由**：plan review / 验收走 MCP（read-only），实施走 exec（多文件 refactor）

### 成本与收益

| 项 | 成本 | 收益 |
|---|---|---|
| 单轮 plan review | ~1-2 分钟 mcp 调用 | 提前消灭 plan bug |
| 3 轮循环上限 | 最坏 ~6 分钟 | 避免一次错误实施返工（实测 ≥30 分钟） |
| cx 验收 | ~1-2 分钟 mcp 调用 | 把「实施 vs plan 偏差」量化 |

### 反模式

- ❌ Plan 循环 >3 轮强行继续：方向问题，停下让用户裁决
- ❌ CC 每轮全盘接受 cx 反馈：失去主控判断（cx 反馈也可能错），主控本质是审阅不是当传声筒
- ❌ CC 每轮驳回所有 cx 反馈：这循环就是装样子，要么方向错要么 cx 用错（plan 太模糊导致 cx 找不到锚点）
- ❌ 验收 FAIL 立即改 plan 不改实施：plan 是事前共识，验收发现的多数问题应先尝试修实施
- ❌ 不走 §11 直接把 plan 内容当 prompt 传给 codex：中文编码风险（CLAUDE.md / §11 明文禁）
- ❌ 简单 bug 修复硬要走本模式：复现优先 + 直接修更快，引入 plan 循环是反生产力
- ❌ Plan v1 写得太抽象（「重构 ScrollReader」），cx review 给不出 BLOCKER 只能给 SUGGESTION：plan 必须钉到文件级 + 符号级才能有效审

### 实战触发场景

- ✓ 「ScrollReader 滚轮交回浏览器原生」：§5 高敏区 + 影响 ≥5 文件 + 涉及物理引擎 API 变更 → 适合
- ✓ 「`useChapterResizeObserver` 拆成两个独立 hook」：高敏 hook 拆分 + 多 consumer 影响 → 适合
- ✓ 「`getPosition` 返回值结构改 ReaderModePositionSnapshot v2」：API 改名 + 跨模块消费 → 适合
- ✗ 「`useScrollEvents.ts` 里某 typo」：单文件单符号小改 → 直接修
- ✗ 「修这个 flaky 测试到全绿」：bounded 终点明确 → `/goal` 模式更合适
