import { describe, expect, it } from 'vitest'
import { HORIZONTAL_WINDOW_ATTR } from '@/components/Reader/paginatedReader/paginatedHorizontalWindowing'
import { shouldSkipPaginatedBlankCandidate } from '@/components/Reader/paginatedReader/paginatedBlankDetection'

describe('paginatedBlankDetection', () => {
    it('页窗隐藏元素不应被空白页检测跳过', () => {
        const element = document.createElement('p')
        element.setAttribute(HORIZONTAL_WINDOW_ATTR, 'hidden')

        expect(shouldSkipPaginatedBlankCandidate(element, {
            display: 'block',
            visibility: 'hidden',
            opacity: '1',
        })).toBe(false)
    })

    it('真实隐藏元素仍会被空白页检测跳过', () => {
        const element = document.createElement('p')

        expect(shouldSkipPaginatedBlankCandidate(element, {
            display: 'block',
            visibility: 'hidden',
            opacity: '1',
        })).toBe(true)
    })
})
