import { describe, it, expect } from 'vitest'
import {
    createRenderTrace,
    runRenderStage,
    finalizeRenderTrace,
    formatRenderTrace,
    type RenderTraceState,
} from '@/engine/render/renderStageTrace'

describe('renderStageTrace', () => {
    it('正常完整流程产生 snapshot', async () => {
        const trace = createRenderTrace('ch1')
        await runRenderStage(trace, 'parse', () => 'parsed')
        await runRenderStage(trace, 'measure', () => [])
        await runRenderStage(trace, 'paginate', () => [])
        await runRenderStage(trace, 'render', () => null)
        await runRenderStage(trace, 'hydrate', () => undefined)
        const snap = finalizeRenderTrace(trace)
        expect(snap.chapterId).toBe('ch1')
        expect(snap.stages).toHaveLength(5)
        expect(snap.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('阶段乱序时抛错', async () => {
        const trace = createRenderTrace('ch2')
        await runRenderStage(trace, 'parse', () => null)
        await expect(
            runRenderStage(trace, 'render', () => null)
        ).rejects.toThrow()
    })

    it('重复执行同一阶段时抛错', async () => {
        const trace = createRenderTrace('ch3')
        await runRenderStage(trace, 'parse', () => null)
        await expect(
            runRenderStage(trace, 'parse', () => null)
        ).rejects.toThrow()
    })

    it('阶段异常时仍记录耗时并重新抛出', async () => {
        const trace = createRenderTrace('ch4')
        await expect(
            runRenderStage(trace, 'parse', () => { throw new Error('parse fail') })
        ).rejects.toThrow('parse fail')
        // stageTimings 应记录了 parse（即使失败）
        expect((trace as RenderTraceState).stageTimings['parse']).toBeDefined()
    })

    it('缺少阶段时 finalize 抛错', async () => {
        const trace = createRenderTrace('ch5')
        await runRenderStage(trace, 'parse', () => null)
        expect(() => finalizeRenderTrace(trace)).toThrow()
    })

    it('formatRenderTrace 产生包含阶段名的字符串', async () => {
        const trace = createRenderTrace('ch6')
        await runRenderStage(trace, 'parse', () => null)
        await runRenderStage(trace, 'measure', () => null)
        await runRenderStage(trace, 'paginate', () => null)
        await runRenderStage(trace, 'render', () => null)
        await runRenderStage(trace, 'hydrate', () => null)
        const snap = finalizeRenderTrace(trace)
        const formatted = formatRenderTrace(snap)
        expect(formatted).toContain('parse')
        expect(formatted).toContain('hydrate')
        expect(formatted).toContain('ch6')
    })
})
