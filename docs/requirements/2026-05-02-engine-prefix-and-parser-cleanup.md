# 引擎命名前缀与 HTML 扫描可读性清理

## 目标

清理源码中过度扩散的 `Vitra/vitra` 实现命名前缀，让引擎、缓存、分页、测量、位置和 parser 模块使用职责命名；保留产品、协议、DOM 数据属性和历史文档标题中确有品牌含义的 `Vitra`。

同时移除 `htmlSaxStream.ts` 中用于普通字符判断的十六进制字符码，改为可读的字符常量或字符串判断。

## 交付物

- 源码文件和导出符号从品牌前缀命名改为职责命名。
- 测试文件和测试引用同步改名。
- 文档不删除，但同步更新当前源码路径、符号名和已知约束。
- 修复翻译配置新主键 `translate:config` 未进入同步敏感键过滤的问题。
- 保留 `vitra:` 阅读位置协议、`data-vitra-*` DOM 属性、`__VITRA_*` 调试开关和产品名。

## 约束

- 不改公共阅读行为。
- 不删除文档。
- 不修改依赖、根构建配置、数据库 schema 或同步协议结构。
- 不复制 GPL 项目源码。
- 不把二进制格式规范中的十六进制偏移改写为十进制，因为它们是文件格式语义。

## 验收标准

- `src/engine` 中不再有以 `vitra` 开头的文件名。
- 普通实现符号不再使用 `BookCache`、`BookPipeline`、`BaseParser`、`buildVectorRenderPlan` 等品牌前缀命名。
- `src/engine/render/htmlSaxStream.ts` 不再使用 `0x..` 字符码表达 HTML 标记字符。
- `translate:config` 与旧键 `translateConfig` 都不会进入 WebDAV settings payload。
- 定向测试和构建验证完成，无法执行的验证必须说明原因。

## 非目标

- 不重写解析架构。
- 不删除现有 `doc/` 或 `docs/` 文档。
- 不移除产品名 Vitra Reader。
- 不迁移现有 IndexedDB 数据。
