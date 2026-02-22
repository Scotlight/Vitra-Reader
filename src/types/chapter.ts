/**
 * 章节状态枚举
 */
export enum ChapterStatus {
  IDLE = 'idle',                      // 未加载
  PRE_FETCHING = 'pre_fetching',      // 正在获取内容
  RENDERING_OFFSCREEN = 'rendering',   // 离屏渲染中
  READY = 'ready',                    // 已就绪，等待插入
  MOUNTED = 'mounted',                // 已挂载到主视口
  UNMOUNTED = 'unmounted'             // 已卸载
}

/**
 * 章节状态接口
 */
export interface ChapterState {
  id: string;                    // 章节唯一标识
  index: number;                 // 章节索引
  status: ChapterStatus;         // 当前状态
  htmlContent: string;           // HTML 内容
  height: number;                // 渲染后的高度（px）
  domNode: HTMLElement | null;   // DOM 节点引用
  loadedAt: number;              // 加载时间戳
}
