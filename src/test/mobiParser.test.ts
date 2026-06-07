import { describe, expect, it } from 'vitest'
import { parseMobiBuffer } from '@/engine/parsers/providers/mobiParser'

describe('mobiParser', () => {
    it('拒绝空 PDB records', () => {
        expect(() => parseMobiBuffer(new ArrayBuffer(0))).toThrow('MOBI parse failed: no PDB records')
    })
})
