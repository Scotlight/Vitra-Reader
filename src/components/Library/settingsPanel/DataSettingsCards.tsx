import { LegacySettingsCard, SettingsCard } from './SettingsCard'
import { SettingRow } from './SettingRow'
import { SyncSettingsTab } from './SyncSettingsTab'
import { useSyncStore, type SyncMode } from '@/stores/useSyncStore'
import styles from '../SettingsPanelV2.module.css'

const SYNC_MODE_LABELS: Record<SyncMode, string> = {
    full: '完整备份（文件、数据和设置）',
    data: '仅数据（进度、笔记和设置）',
    files: '仅书籍文件',
}

export function DataSettingsCards() {
    const syncStore = useSyncStore()
    // 绑定状态、同步内容、上次同步、远端 etag 全部来自 sync store 真实值，
    // 不写占位文案——未绑定/未同步时降级为对应的空状态提示。
    const bindingLabel = syncStore.webdavUrl
        ? `已配置 · ${syncStore.webdavPath || 'VitraReader'}`
        : '未绑定 WebDAV'
    const lastSyncLabel = syncStore.lastSyncTime
        ? new Date(syncStore.lastSyncTime).toLocaleString()
        : '尚未同步'

    return (
        <div className={styles.singleCardGrid}>
            <LegacySettingsCard title="同步和备份">
                <SyncSettingsTab />
            </LegacySettingsCard>
            <SettingsCard title="备份状态">
                <SettingRow label="绑定状态">
                    <span>{bindingLabel}</span>
                </SettingRow>
                <SettingRow label="同步内容">
                    <span>{SYNC_MODE_LABELS[syncStore.syncMode]}</span>
                </SettingRow>
                <SettingRow label="上次同步">
                    <span>{lastSyncLabel}</span>
                </SettingRow>
                <SettingRow label="远端版本">
                    <span>{syncStore.remoteEtag ? '已记录，可检测同步冲突' : '尚未记录'}</span>
                </SettingRow>
            </SettingsCard>
        </div>
    )
}
