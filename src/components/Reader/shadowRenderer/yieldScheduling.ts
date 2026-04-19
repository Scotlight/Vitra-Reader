/**
 * ShadowRenderer 内部的帧让出工具。
 *
 * 两个函数都只做一件事：给浏览器一个"喘息"机会，让其应用 pending 样式
 * 写入 / 执行 layout / 释放主线程片段。调用方通过 await 语义串成异步管线。
 *
 * - yieldToBrowser: 下一帧 rAF。适合写入后要让 layout 先跑再读几何的场景
 *   （例如 calibrateSegmentIntrinsicSizeBatch）。
 * - yieldForHydration: 优先 requestIdleCallback，fallback rAF。适合后台
 *   持续的段水合循环，给用户交互留出主线程空档。
 *
 * 两者保持独立：yieldToBrowser 承诺"下一帧", yieldForHydration 不承诺
 * 任何时间点，只承诺"空闲时"。不要合并。
 */

import { VECTOR_IDLE_TIMEOUT_MS } from './shadowRendererConstants';

export async function yieldToBrowser(): Promise<void> {
    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
    });
}

export async function yieldForHydration(): Promise<void> {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        await new Promise<void>((resolve) => {
            window.requestIdleCallback(() => resolve(), { timeout: VECTOR_IDLE_TIMEOUT_MS });
        });
        return;
    }
    await yieldToBrowser();
}
