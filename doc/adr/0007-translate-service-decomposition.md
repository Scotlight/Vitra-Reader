# ADR-0007：translateService 职责拆分

## 状态

已采用

## 背景

`src/services/translateService.ts` 达到 684 行，同时承担：

- 类型定义与默认配置（`TranslateConfig`、`TranslateProvider`、`DEFAULT_TRANSLATE_CONFIG`）
- 配置持久化与加密（`loadTranslateConfig`、`saveTranslateConfig`、`encryptApiKeys`、`decryptApiKeys`）
- 翻译缓存（`buildCacheKey`、`getCached`、`setCached`、`cleanupCache`、`clearTranslationCache`）
- 各引擎 HTTP 调用（`callOpenAICompatible`、`callDeepL`、`callClaude`、`callDeepLX`、`requestViaMain`）
- 入口调度（`translateText`、`getProviderLabel`）

## 考虑过的方案

### 方案 1（已采用）：按职责拆到子目录，主文件保留入口 + re-export

新建 `src/services/translate/` 子目录：

- `translateTypes.ts` — 类型、枚举、常量、`DEFAULT_TRANSLATE_CONFIG`
- `translateConfig.ts` — 配置持久化与加密
- `translateCache.ts` — 缓存读写与清理
- `translateEngines.ts` — 各引擎 HTTP 调用

`translateService.ts` 保留 `translateText` 入口和 re-export，外部调用方 import 路径不变。

### 方案 2（已否决）：保持单文件，只加注释分区

不改变文件结构，只用注释标记各区域。

## 决策

采用方案 1。

## 原因

- 各职责之间依赖单向（types ← config ← cache ← engines ← service），无循环
- 拆分后每个文件 ≤150 行，可独立测试
- 外部调用方（`TranslateSettingsTab.tsx`、`ReaderView.tsx` 等）的 import 路径不变，零破坏性
- 方案 2 只是视觉分区，不解决"任何人都可以随手往里加代码"的根本问题

## 影响

正向：
- 主文件从 684 行降到 ~80 行
- 缓存逻辑可独立测试，不需要 mock 整个翻译流程
- 新增引擎只需在 `translateEngines.ts` 加一个函数

负向：
- 子目录增加 4 个文件，初次浏览文件数增加
