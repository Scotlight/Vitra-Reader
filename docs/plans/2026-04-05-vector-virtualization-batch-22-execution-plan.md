# 向量化虚拟渲染第二十二批执行计划

- 日期：2026-04-05
- 运行时：`vibe`
- 内部等级：`M`

## Wave 1

1. `src/test/scrollReaderVectorFlow.test.tsx`
   - 搭建 `ScrollReaderView` 组件级向量路径测试桩
   - 覆盖向量章节绕过 `ShadowRenderer`
   - 覆盖样式切换重新预处理

## 验证命令

1. `npx vitest run src/test/scrollReaderVectorFlow.test.tsx`
2. `npx tsc --pretty false --noEmit`
3. `npm run build --silent`

## 回滚规则

1. 若测试桩对组件真实行为建模不准确，只回退测试，不动已落地主链代码。
2. 不改动调查目录未跟踪材料。

## 清理要求

1. 只提交本批测试和运行时文档。
2. 完成后推送远端。
