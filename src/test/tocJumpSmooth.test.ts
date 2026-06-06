import { describe, expect, it } from 'vitest'
import { shouldSmoothJump } from '@/components/Reader/scrollReader/tocJumpMountedChapter'

describe('shouldSmoothJump', () => {
    it('enables smooth jump for nearby targets without search text', () => {
        expect(shouldSmoothJump(100, 400, 200, false)).toBe(true)
    })

    it('disables smooth jump for distant targets', () => {
        expect(shouldSmoothJump(0, 601, 200, false)).toBe(false)
    })

    it('disables smooth jump when search text is present', () => {
        expect(shouldSmoothJump(100, 300, 200, true)).toBe(false)
    })

    it('includes the exact three viewport height boundary', () => {
        expect(shouldSmoothJump(0, 600, 200, false)).toBe(true)
    })
})
