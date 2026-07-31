import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const syncState = vi.hoisted(() => ({
    lastSyncTime: Date.UTC(2026, 0, 2, 3, 4, 5),
    remoteEtag: 'etag-1' as string | null,
    syncMode: 'data' as 'full' | 'data' | 'files',
    webdavPath: 'VitraReader',
    webdavUrl: 'https://example.com/dav',
}))

vi.mock('@/stores/useSyncStore', () => ({
    useSyncStore: () => syncState,
}))

vi.mock('@/components/Library/settingsPanel/SyncSettingsTab', () => ({
    SyncSettingsTab: () => <div>同步配置</div>,
}))

import { DataSettingsCards } from '@/components/Library/settingsPanel/DataSettingsCards'

describe('DataSettingsCards', () => {
    afterEach(() => {
        cleanup()
        syncState.lastSyncTime = Date.UTC(2026, 0, 2, 3, 4, 5)
        syncState.remoteEtag = 'etag-1'
        syncState.syncMode = 'data'
        syncState.webdavPath = 'VitraReader'
        syncState.webdavUrl = 'https://example.com/dav'
    })

    it('显示本地记录的真实同步状态', () => {
        const view = render(<DataSettingsCards />)

        expect(view.getByText('已配置 · VitraReader')).toBeInTheDocument()
        expect(view.getByText('仅数据（进度、笔记和设置）')).toBeInTheDocument()
        expect(view.getByText('已记录，可检测同步冲突')).toBeInTheDocument()
        expect(view.getByText(new Date(syncState.lastSyncTime).toLocaleString())).toBeInTheDocument()
    })

    it('未绑定且从未同步时显示空状态', () => {
        syncState.webdavUrl = ''
        syncState.lastSyncTime = 0
        syncState.remoteEtag = null
        const view = render(<DataSettingsCards />)

        expect(view.getByText('未绑定 WebDAV')).toBeInTheDocument()
        expect(view.getByText('尚未同步')).toBeInTheDocument()
        expect(view.getByText('尚未记录')).toBeInTheDocument()
    })
})

