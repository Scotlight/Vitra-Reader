# ADR-0005：格式字符串统一规范化

## 状态

已采用

## 背景

项目中存在两套格式字符串：

- `BookFormat`（`contentProvider.ts`）：小写 string union，`'epub' | 'pdf' | 'txt' | ...`，用于 UI 层、存储层、格式检测入口
- `VitraBookFormat`（`vitraBook.ts`）：大写 string union，`'EPUB' | 'PDF' | 'TXT' | ...`，用于引擎内部 pipeline、parser 分发

两套并存导致：

1. `readerRenderMode.ts` 的 Set 里同时写 `'pdf'` 和 `'PDF'`、`'djvu'` 和 `'DJVU'` 等，每次新增格式都要双写
2. 调用方需要知道当前上下文用哪套，`readerRenderMode.ts` 用 `AnyFormatString = BookFormat | string` 绕过类型检查
3. 引擎边界（`contentProviderFactory.ts` → `vitraPipeline.ts`）存在隐式大小写转换，转换点不统一

## 考虑过的方案

### 方案 1（已采用）：边界规范化，引擎内统一大写，UI 层保持小写

在 `vitraPipeline.ts` 入口做一次 `toUpperCase()` 规范化，`VitraBookFormat` 继续大写。`readerRenderMode.ts` 在 `resolveRenderProfile` 入口做 `toLowerCase()` 规范化，Set 只保留小写。两套类型继续共存但各自职责清晰：`BookFormat` 是外部协议，`VitraBookFormat` 是引擎内部协议，边界做一次转换。

### 方案 2（已否决）：合并为单一 enum，全局替换

把 `BookFormat` 和 `VitraBookFormat` 合并为一套，全局替换 17 个文件的引用。

### 方案 3（已否决）：全部统一小写

把引擎内部也改成小写，废弃 `VitraBookFormat`。

## 决策

采用方案 1。

## 原因

方案 2 和方案 3 都需要改动 17 个文件，包括引擎 parser、pipeline、cache 等核心路径，风险高、收益不明显。

方案 1 的核心洞察是：两套格式字符串的存在本身不是问题，问题是**边界转换点不统一**导致调用方需要同时处理两种大小写。只要在两个边界各做一次规范化，调用方就不需要双写 Set，也不需要 `AnyFormatString` 这种类型逃逸。

具体修改：

- `readerRenderMode.ts`：`resolveRenderProfile` 入口 `format.toLowerCase()`，Set 只保留小写
- `vitraPipeline.ts`：`detectVitraFormat` 已经在内部处理大小写，无需额外改动（已验证）

## 影响

正向：
- `readerRenderMode.ts` 的 Set 从双写变为单写，新增格式只需写一次
- 消除 `AnyFormatString` 类型逃逸，`readerRenderMode.ts` 可以直接接受 `BookFormat`
- 边界转换点明确，后续维护者不需要猜测哪层用哪套

负向：
- 两套类型仍然共存，新人仍需理解两套的分工
