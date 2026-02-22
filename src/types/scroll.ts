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
  friction: 0.12,                // 衰减系数，越大减速越快
  stopThreshold: 0.5,            // 速度低于此值停止动画
  springStiffness: 0.1,
  springDamping: 0.8
};
