import { describe, it, expect } from 'vitest'
import { clampNumber as clampNum, clampInt as clampI, clampDecimal as clampD } from '@/utils/mathUtils'

// mathUtils 直接测
describe('clampNumber', () => {
    it('值在范围内原样返回', () => { expect(clampNum(5, 0, 10)).toBe(5) })
    it('低于下限夹到下限', () => { expect(clampNum(-1, 0, 10)).toBe(0) })
    it('高于上限夹到上限', () => { expect(clampNum(20, 0, 10)).toBe(10) })
    it('等于边界值原样返回', () => { expect(clampNum(0, 0, 10)).toBe(0); expect(clampNum(10, 0, 10)).toBe(10) })
})

describe('clampInt', () => {
    it('四舍五入后夹紧', () => { expect(clampI(4.6, 0, 10)).toBe(5) })
    it('非有限数返回 min', () => { expect(clampI(NaN, 0, 10)).toBe(0); expect(clampI(Infinity, 0, 10)).toBe(0) })
    it('负无穷返回 min', () => { expect(clampI(-Infinity, 0, 10)).toBe(0) })
})

describe('clampDecimal', () => {
    it('保留指定小数位', () => { expect(clampD(3.14159, 0, 10, 2)).toBe(3.14) })
    it('非有限数返回 min', () => { expect(clampD(NaN, 0, 10, 2)).toBe(0) })
    it('超上限夹到上限', () => { expect(clampD(15.5, 0, 10, 1)).toBe(10) })
})

