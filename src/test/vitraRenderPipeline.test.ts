import { describe, it, expect } from 'vitest'
import {
    createVitraRenderTrace,
    runVitraRenderStage,
    finalizeVitraRenderTrace,
    formatVitraRenderTrace,
    type VitraRenderTraceState,
} from '../engine/render/vitraRenderPipeline'

describe('vitraRenderPipeline', () => {
    it('正常完整流程产生 snapshot', async () => {
        const trace = createVitraRenderTrace('ch1')
        await runVitraRenderStage(trace, 'parse', () => 'parsed')
        await runVitraRenderStage(trace, 'measure', () => [])
        await runVitraRenderStage(trace, 'paginate', () => [])
        await runVitraRenderStage(trace, 'render', () => null)
        await runVitraRenderStage(trace, 'hydrate', () => undefined)
        const snap = finalizeVitraRenderTrace(trace)
        expect(snap.chapterId).toBe('ch1')
        expect(snap.stages).toHaveLength(5)
        expect(snap.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('阶段乱序时抛错', async () => {
        const trace = createVitraRenderTrace('ch2')
        await runVitraRenderStage(trace, 'parse', () => null)
        await expect(
            runVitraRenderStage(trace, 'render', () => null)
        ).rejects.toThrow()
    })

    it('重复执行同一阶段时抛错', async () => {
        const trace = createVitraRenderTrace('ch3')
        await runVitraRenderStage(trace, 'parse', () => null)
        await expect(
            runVitraRenderStage(trace, 'parse', () => null)
        ).rejects.toThrow()
    })

    it('阶段异常时仍记录耗时并重新抛出', async () => {
        const trace = createVitraRenderTrace('ch4')
        await expect(
            runVitraRenderStage(trace, 'parse', () => { throw new Error('parse fail') })
        ).rejects.toThrow('parse fail')
        // stageTimings 应记录了 parse（即使失败）
        expect((trace as VitraRenderTraceState).stageTimings['parse']).toBeDefined()
    })

    it('缺少阶段时 finalize 抛错', async () => {
        const trace = createVitraRenderTrace('ch5')
        await runVitraRenderStage(trace, 'parse', () => null)
        expect(() => finalizeVitraRenderTrace(trace)).toThrow()
    })

    it('formatVitraRenderTrace 产生包含阶段名的字符串', async () => {
        const trace = createVitraRenderTrace('ch6')
        await runVitraRenderStage(trace, 'parse', () => null)
        await runVitraRenderStage(trace, 'measure', () => null)
        await runVitraRenderStage(trace, 'paginate', () => null)
        await runVitraRenderStage(trace, 'render', () => null)
        await runVitraRenderStage(trace, 'hydrate', () => null)
        const snap = finalizeVitraRenderTrace(trace)
        const formatted = formatVitraRenderTrace(snap)
        expect(formatted).toContain('parse')
        expect(formatted).toContain('hydrate')
        expect(formatted).toContain('ch6')
    })
})
