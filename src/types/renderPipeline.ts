/**
 * 渲染管道状态枚举
 */
export enum RenderPipelineState {
  IDLE = 'idle',                          // 静止状态，监听滚动事件
  PRE_FETCHING = 'pre_fetching',          // 滚动接近顶部阈值，Shadow Realm 正在解析下一章 HTML
  RENDERING_OFFSCREEN = 'rendering',       // HTML 已注入 Shadow DOM，正在等待图片加载和 CSS 布局计算
  ANCHORING_LOCKED = 'anchoring_locked',   // 关键状态：禁止用户交互，锁住 Scroll Event，执行 DOM 插入和坐标修正（耗时应 < 10ms）
  FLINGING = 'flinging'                   // 用户松手，物理引擎接管滚动，惯性衰减中
}

/**
 * 状态转换映射
 */
export const VALID_STATE_TRANSITIONS: Record<RenderPipelineState, RenderPipelineState[]> = {
  [RenderPipelineState.IDLE]: [
    RenderPipelineState.PRE_FETCHING,
    RenderPipelineState.FLINGING
  ],
  [RenderPipelineState.PRE_FETCHING]: [
    RenderPipelineState.RENDERING_OFFSCREEN,
    RenderPipelineState.IDLE  // 取消或错误
  ],
  [RenderPipelineState.RENDERING_OFFSCREEN]: [
    RenderPipelineState.ANCHORING_LOCKED,
    RenderPipelineState.IDLE  // 超时或错误
  ],
  [RenderPipelineState.ANCHORING_LOCKED]: [
    RenderPipelineState.IDLE
  ],
  [RenderPipelineState.FLINGING]: [
    RenderPipelineState.IDLE,
    RenderPipelineState.PRE_FETCHING
  ]
};

/**
 * 验证状态转换是否合法
 */
export function isValidTransition(
  from: RenderPipelineState,
  to: RenderPipelineState
): boolean {
  return VALID_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}
