import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AboutSettingsCards } from '@/components/Library/settingsPanel/AboutSettingsCards'

function installElectronApi(api: Partial<Window['electronAPI']> | undefined): void {
    Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: api,
    })
}

describe('AboutSettingsCards', () => {
    afterEach(() => {
        cleanup()
        installElectronApi(undefined)
    })

    it('显示构建版本和 Web/PWA 运行环境', () => {
        const view = render(<AboutSettingsCards />)

        expect(view.getByText('0.2.0')).toBeInTheDocument()
        expect(view.getByText('Web/PWA + React')).toBeInTheDocument()
    })

    it('存在 Electron bridge 时显示桌面运行环境', () => {
        installElectronApi({ openEpub: async () => [] })
        const view = render(<AboutSettingsCards />)

        expect(view.getByText('Electron + React')).toBeInTheDocument()
    })
})

