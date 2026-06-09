import { useSyncStore } from '@/stores/useSyncStore'
import { SelectControl, type SelectControlOption } from './SelectControl'
import { ToggleControl } from './ToggleControl'
import styles from '../SettingsPanelV2.module.css'

const SYNC_MODE_OPTIONS: SelectControlOption[] = [
    { value: 'full', label: '完整备份（文件+数据+设置）' },
    { value: 'data', label: '仅数据（进度/笔记/设置）' },
    { value: 'files', label: '仅文件（书籍实体文件）' },
]

const RESTORE_MODE_OPTIONS: SelectControlOption[] = [
    { value: 'auto', label: '自动（跟随备份包）' },
    { value: 'full', label: '强制完整恢复' },
    { value: 'data', label: '强制仅数据恢复' },
    { value: 'files', label: '强制仅文件恢复' },
]

export function SyncSettingsTab() {
    const syncStore = useSyncStore()

    return (
        <div className={styles.syncPanel}>
            <label className={styles.settingRow}>
                <span>同步模式</span>
                <SelectControl
                    label="同步模式"
                    value={syncStore.syncMode}
                    options={SYNC_MODE_OPTIONS}
                    onChange={(value) => void syncStore.setConfig({ syncMode: value as 'full' | 'data' | 'files' })}
                />
            </label>
            <label className={styles.settingRow}>
                <span>恢复模式</span>
                <SelectControl
                    label="恢复模式"
                    value={syncStore.restoreMode}
                    options={RESTORE_MODE_OPTIONS}
                    onChange={(value) => void syncStore.setConfig({ restoreMode: value as 'auto' | 'full' | 'data' | 'files' })}
                />
            </label>
            <label className={styles.settingRow}>
                <span>恢复前处理</span>
                <ToggleControl
                    label="恢复前先清空对应本地数据"
                    checked={syncStore.replaceBeforeRestore}
                    onChange={(checked) => void syncStore.setConfig({ replaceBeforeRestore: checked })}
                />
            </label>
            <label className={styles.settingRow}>
                <span>服务器地址</span>
                <input
                    className={styles.textInput}
                    type="text"
                    placeholder="示例: https://example.com/dav"
                    value={syncStore.webdavUrl}
                    onChange={(event) => void syncStore.setConfig({ webdavUrl: event.target.value })}
                />
            </label>
            <label className={styles.settingRow}>
                <span>服务器文件夹</span>
                <input
                    className={styles.textInput}
                    type="text"
                    placeholder="示例: VitraReader 或 backups/reader"
                    value={syncStore.webdavPath}
                    onChange={(event) => void syncStore.setConfig({ webdavPath: event.target.value })}
                />
            </label>
            <label className={styles.settingRow}>
                <span>用户名</span>
                <input
                    className={styles.textInput}
                    type="text"
                    value={syncStore.webdavUser}
                    onChange={(event) => void syncStore.setConfig({ webdavUser: event.target.value })}
                />
            </label>
            <label className={styles.settingRow}>
                <span>密码</span>
                <input
                    className={styles.textInput}
                    type="password"
                    value={syncStore.webdavPass}
                    onChange={(event) => void syncStore.setConfig({ webdavPass: event.target.value })}
                />
            </label>

            <div className={styles.syncActions}>
                <button className={styles.smallBtn} onClick={() => void syncStore.testConnection()} disabled={syncStore.isTesting}>
                    {syncStore.isTesting ? '测试中...' : '测试'}
                </button>
                <button className={styles.smallBtn} onClick={() => void syncStore.restoreData()} disabled={syncStore.isRestoring}>
                    {syncStore.isRestoring ? '恢复中...' : '恢复'}
                </button>
                <button className={styles.syncPrimaryBtn} onClick={() => void syncStore.syncData()} disabled={syncStore.isSyncing}>
                    {syncStore.isSyncing ? '同步中...' : '绑定并同步'}
                </button>
            </div>
            {syncStore.syncStatus && <div className={styles.syncStatus}>{syncStore.syncStatus}</div>}
            {syncStore.lastSyncTime && (
                <div className={styles.syncStatus}>
                    上次同步: {new Date(syncStore.lastSyncTime).toLocaleString()}
                </div>
            )}
        </div>
    )
}
