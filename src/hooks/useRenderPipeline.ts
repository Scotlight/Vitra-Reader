import { useState, useCallback } from 'react';
import {
  RenderPipelineState,
  isValidTransition
} from '../engine/types/renderPipeline';

/**
 * useRenderPipeline Hook
 * 职责：管理渲染管道状态机
 */
export function useRenderPipeline() {
  const [state, setState] = useState<RenderPipelineState>(
    RenderPipelineState.IDLE
  );

  /**
   * 状态转换
   */
  const transition = useCallback((newState: RenderPipelineState) => {
    setState(currentState => {
      // 验证状态转换是否合法
      if (!isValidTransition(currentState, newState)) {
        console.error(
          `[RenderPipeline] Invalid transition: ${currentState} -> ${newState}`
        );
        return currentState;
      }

      console.log(`[RenderPipeline] State transition: ${currentState} -> ${newState}`);
      return newState;
    });
  }, []);

  /**
   * 重置到 IDLE 状态
   */
  const reset = useCallback(() => {
    console.log('[RenderPipeline] Resetting to IDLE');
    setState(RenderPipelineState.IDLE);
  }, []);

  /**
   * 检查是否可以进行用户交互
   */
  const canInteract = useCallback(() => {
    return state !== RenderPipelineState.ANCHORING_LOCKED;
  }, [state]);

  /**
   * 检查是否正在加载
   */
  const isLoading = useCallback(() => {
    return state === RenderPipelineState.PRE_FETCHING ||
           state === RenderPipelineState.RENDERING_OFFSCREEN;
  }, [state]);

  return {
    state,
    transition,
    reset,
    canInteract,
    isLoading
  };
}
