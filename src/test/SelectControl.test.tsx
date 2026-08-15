import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { SelectControl } from '@/components/Library/settingsPanel/SelectControl'

const OPTIONS = [
    { value: 'default', label: '默认' },
    { value: 'mica', label: 'Mica' },
    { value: 'acrylic', label: 'Acrylic' },
]

function renderSelect(overrides: Partial<Parameters<typeof SelectControl>[0]> = {}) {
    const props: Parameters<typeof SelectControl>[0] = {
        label: '材质',
        value: 'mica',
        options: OPTIONS,
        onChange: vi.fn(),
        ...overrides,
    }
    return { props, view: render(<SelectControl {...props} />) }
}

describe('SelectControl 自绘下拉', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it('初始不渲染菜单，触发器显示当前值', () => {
        const { view } = renderSelect()
        expect(view.queryByRole('listbox')).toBeNull()
        expect(screen.getByRole('button', { name: '材质' })).toHaveTextContent('Mica')
    })

    it('点触发器开菜单，选中项带 aria-selected', () => {
        const { view } = renderSelect()
        fireEvent.click(screen.getByRole('button', { name: '材质' }))
        const menu = view.getByRole('listbox', { name: '材质' })
        const options = within(menu).getAllByRole('option')
        expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    })

    it('点选项文本触发 onChange 并收起菜单', () => {
        const { props, view } = renderSelect()
        fireEvent.click(screen.getByRole('button', { name: '材质' }))
        // 点文本（在内部 button 里）；直接 fireEvent.click(li) 不会冒泡到子 button
        fireEvent.click(within(view.getByRole('listbox')).getByText('Acrylic'))
        expect(props.onChange).toHaveBeenCalledWith('acrylic')
        expect(view.queryByRole('listbox')).toBeNull()
    })

    it('点当前项不触发 onChange（幂等）', () => {
        const { props, view } = renderSelect()
        fireEvent.click(screen.getByRole('button', { name: '材质' }))
        fireEvent.click(within(view.getByRole('listbox')).getByText('Mica'))
        expect(props.onChange).not.toHaveBeenCalled()
        expect(view.queryByRole('listbox')).toBeNull()
    })

    it('Esc 与点外部都能关闭', () => {
        const { view } = renderSelect()
        const trigger = screen.getByRole('button', { name: '材质' })
        fireEvent.click(trigger)
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(view.queryByRole('listbox')).toBeNull()

        fireEvent.click(trigger)
        fireEvent.pointerDown(document.body)
        expect(view.queryByRole('listbox')).toBeNull()
    })

    it('disabled 选项置灰不可选', () => {
        const { props, view } = renderSelect({
            options: [...OPTIONS, { value: 'x', label: '禁用项', disabled: true }],
        })
        fireEvent.click(screen.getByRole('button', { name: '材质' }))
        const disabledButton = within(view.getByRole('listbox')).getByText('禁用项').closest('button') as HTMLButtonElement
        expect(disabledButton.disabled).toBe(true)
        fireEvent.click(disabledButton)
        expect(props.onChange).not.toHaveBeenCalled()
    })

    it('renderOption 自定义选项内容（字体按自身渲染）', () => {
        const { view } = renderSelect({
            renderOption: (option) => <span style={{ fontFamily: `"${option.value}"` }}>{option.label}</span>,
        })
        fireEvent.click(screen.getByRole('button', { name: '材质' }))
        const item = within(view.getByRole('listbox')).getByText('Acrylic')
        expect(item.getAttribute('style')).toContain('font-family')
    })
})
