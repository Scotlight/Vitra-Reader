/**
 * 滚动状态接口
 */
export interface ScrollState {
  virtualOffsetY: number;        // 虚拟滚动偏移量
  velocity: number;              // 当前速度（px/frame）
  isScrolling: boolean;          // 是否正在滚动
  isDragging: boolean;           // 是否正在拖拽
  anchorElement: HTMLElement | null;  // 锚点元素
  anchorOffset: number;          // 锚点偏移量
}

/**
 * 物理引擎配置接口
 */
export interface PhysicsConfig {
  friction: number;              // 摩擦系数 (0.9-0.99)
  stopThreshold: number;         // 停止阈值 (px/frame)
  springStiffness: number;       // 弹簧刚度
  springDamping: number;         // 弹簧阻尼
}

/**
 * 默认物理配置
 */
export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  friction: 0.08,                // 衰减系数，适中减速，避免突兀刹停
  stopThreshold: 0.12,           // 降低停止阈值，减少“顿一下”
  springStiffness: 0.06,
  springDamping: 0.6
};
