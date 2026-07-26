import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const settingsMocks = vi.hoisted(() => ({
    state: {
        themeId: 'light',
        customBgColor: null as string | null,
        customTextColor: null as string | null,
        fontFamily: 'Segoe UI',
        uiMaterial: 'acrylic' as 'default' | 'mica' | 'acrylic',
        uiBlurStrength: 30,
        uiOpacity: 0.6,
        uiRoundness: 16,
        uiAnimation: true,
        loadPersistedSettings: vi.fn(async () => undefined),
    },
}))

vi.mock('@/stores/useSettingsStore', () => {
    const useSettingsStore = Object.assign(
        (selector?: (state: typeof settingsMocks.state) => unknown) => {
            if (typeof selector === 'function') return selector(settingsMocks.state)
            return settingsMocks.state
        },
        {
            getState: () => settingsMocks.state,
        },
    )
    return { useSettingsStore }
})

vi.mock('@/stores/useSyncStore', () => {
    const state = {
        loadConfig: vi.fn(async () => undefined),
        autoSync: vi.fn(async () => undefined),
    }
    const useSyncStore = (selector?: (s: typeof state) => unknown) => {
        if (typeof selector === 'function') return selector(state)
        return state
    }
    return { useSyncStore }
})

vi.mock('@/components/Library/LibraryView', () => ({
    LibraryView: () => <div>书库占位</div>,
}))

import App from '@/App'

describe('App UI material surface', () => {
    afterEach(() => {
        cleanup()
        settingsMocks.state.uiMaterial = 'acrylic'
        settingsMocks.state.uiBlurStrength = 30
    })

    it('根容器输出 data-ui-material 并注入外观 CSS 变量', () => {
        const { container } = render(<App />)
        const root = container.firstElementChild as HTMLElement

        expect(root.getAttribute('data-ui-material')).toBe('acrylic')
        expect(root.style.getPropertyValue('--ui-opacity')).toBe('0.6')
        expect(root.style.getPropertyValue('--ui-blur')).toBe('30px')
        expect(root.style.getPropertyValue('--ui-mica-blur')).toBe('14px')
        expect(root.style.getPropertyValue('--ui-roundness')).toBe('16px')
    })

    it('材质为 mica 时 mica 模糊约为 uiBlurStrength 的 45%', () => {
        settingsMocks.state.uiMaterial = 'mica'
        settingsMocks.state.uiBlurStrength = 20
        const { container } = render(<App />)
        const root = container.firstElementChild as HTMLElement

        expect(root.getAttribute('data-ui-material')).toBe('mica')
        expect(root.style.getPropertyValue('--ui-mica-blur')).toBe('9px')
    })
})
