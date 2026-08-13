import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReaderSettingsSection } from '@/components/Reader/ReaderSettingsSection'

describe('ReaderSettingsSection', () => {
    afterEach(() => {
        cleanup()
    })

    it('默认收起：内容不渲染，aria-expanded=false', () => {
        render(
            <ReaderSettingsSection title="版式">
                <div>缩进控件</div>
            </ReaderSettingsSection>,
        )
        const header = screen.getByRole('button', { name: /版式/ })
        expect(header.getAttribute('aria-expanded')).toBe('false')
        expect(screen.queryByText('缩进控件')).toBeNull()
    })

    it('点击展开再点击收起', () => {
        render(
            <ReaderSettingsSection title="字号与间距">
                <div>滑条们</div>
            </ReaderSettingsSection>,
        )
        const header = screen.getByRole('button', { name: /字号与间距/ })

        fireEvent.click(header)
        expect(header.getAttribute('aria-expanded')).toBe('true')
        expect(screen.getByText('滑条们')).toBeTruthy()

        fireEvent.click(header)
        expect(header.getAttribute('aria-expanded')).toBe('false')
        expect(screen.queryByText('滑条们')).toBeNull()
    })

    it('defaultOpen 分区初始即展开', () => {
        render(
            <ReaderSettingsSection title="常开区" defaultOpen>
                <div>内容</div>
            </ReaderSettingsSection>,
        )
        expect(screen.getByRole('button', { name: /常开区/ }).getAttribute('aria-expanded')).toBe('true')
        expect(screen.getByText('内容')).toBeTruthy()
    })
})
