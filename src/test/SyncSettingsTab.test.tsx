import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const syncStoreMocks = vi.hoisted(() => ({
    restoreData: vi.fn(),
    setConfig: vi.fn(),
    syncData: vi.fn(),
    testConnection: vi.fn(),
}))

vi.mock('@/stores/useSyncStore', () => ({
    useSyncStore: () => ({
        webdavUrl: 'https://example.com/dav',
        webdavPath: 'VitraReader',
        webdavUser: 'reader',
        webdavPass: 'secret',
        syncMode: 'data',
        restoreMode: 'auto',
        replaceBeforeRestore: true,
        lastSyncTime: Date.UTC(2026, 0, 2, 3, 4, 5),
        remoteEtag: 'etag-1',
        isSyncing: false,
        isRestoring: false,
        isTesting: false,
        syncStatus: '已连接',
        setConfig: syncStoreMocks.setConfig,
        loadConfig: vi.fn(),
        testConnection: syncStoreMocks.testConnection,
        syncData: syncStoreMocks.syncData,
        restoreData: syncStoreMocks.restoreData,
        autoSync: vi.fn(),
    }),
}))

import { SyncSettingsTab } from '@/components/Library/settingsPanel/SyncSettingsTab'

describe('SyncSettingsTab', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it('切换同步和恢复模式时写入 sync store 配置', () => {
        const view = render(<SyncSettingsTab />)

        fireEvent.change(view.getByLabelText('同步模式'), { target: { value: 'files' } })
        expect(syncStoreMocks.setConfig).toHaveBeenCalledWith({ syncMode: 'files' })

        fireEvent.change(view.getByLabelText('恢复模式'), { target: { value: 'full' } })
        expect(syncStoreMocks.setConfig).toHaveBeenCalledWith({ restoreMode: 'full' })
    })

    it('切换恢复前处理和 WebDAV 输入项时写入对应配置', () => {
        const view = render(<SyncSettingsTab />)

        fireEvent.click(view.getByRole('switch', { name: '恢复前先清空对应本地数据' }))
        expect(syncStoreMocks.setConfig).toHaveBeenCalledWith({ replaceBeforeRestore: false })

        fireEvent.change(view.getByDisplayValue('https://example.com/dav'), {
            target: { value: 'https://backup.example.com/dav' },
        })
        expect(syncStoreMocks.setConfig).toHaveBeenCalledWith({ webdavUrl: 'https://backup.example.com/dav' })

        fireEvent.change(view.getByDisplayValue('VitraReader'), { target: { value: 'Books/Reader' } })
        expect(syncStoreMocks.setConfig).toHaveBeenCalledWith({ webdavPath: 'Books/Reader' })

        fireEvent.change(view.getByDisplayValue('reader'), { target: { value: 'alice' } })
        expect(syncStoreMocks.setConfig).toHaveBeenCalledWith({ webdavUser: 'alice' })

        fireEvent.change(view.getByDisplayValue('secret'), { target: { value: 'new-secret' } })
        expect(syncStoreMocks.setConfig).toHaveBeenCalledWith({ webdavPass: 'new-secret' })
    })

    it('触发测试、恢复和同步操作，并显示状态信息', () => {
        const view = render(<SyncSettingsTab />)

        fireEvent.click(view.getByRole('button', { name: '测试' }))
        fireEvent.click(view.getByRole('button', { name: '恢复' }))
        fireEvent.click(view.getByRole('button', { name: '绑定并同步' }))

        expect(syncStoreMocks.testConnection).toHaveBeenCalledTimes(1)
        expect(syncStoreMocks.restoreData).toHaveBeenCalledTimes(1)
        expect(syncStoreMocks.syncData).toHaveBeenCalledTimes(1)
        expect(view.getByText('已连接')).toBeTruthy()
        expect(view.getByText(/上次同步:/)).toBeTruthy()
    })
})
