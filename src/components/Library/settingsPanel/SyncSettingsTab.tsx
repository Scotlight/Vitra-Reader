import { useSyncStore } from '../../../stores/useSyncStore'
import styles from '../LibraryView.module.css'

export function SyncSettingsTab() {
    const syncStore = useSyncStore()

    return (
        <div className={styles.syncPanel}>
            <label className={styles.settingRow}>
                <span>同步模式</span>
                <select
                    value={syncStore.syncMode}
                    onChange={(event) => void syncStore.setConfig({ syncMode: event.target.value as 'full' | 'data' | 'files' })}
                >
                    <option value="full">完整备份（文件+数据+设置）</option>
                    <option value="data">仅数据（进度/笔记/设置）</option>
                    <option value="files">仅文件（书籍实体文件）</option>
                </select>
            </label>
            <label className={styles.settingRow}>
                <span>恢复模式</span>
                <select
                    value={syncStore.restoreMode}
                    onChange={(event) => void syncStore.setConfig({ restoreMode: event.target.value as 'auto' | 'full' | 'data' | 'files' })}
                >
                    <option value="auto">自动（跟随备份包）</option>
                    <option value="full">强制完整恢复</option>
                    <option value="data">强制仅数据恢复</option>
                    <option value="files">强制仅文件恢复</option>
                </select>
            </label>
            <label className={styles.settingRow}>
                <span>恢复前处理</span>
                <label className={styles.checkboxRow}>
                    <input
                        type="checkbox"
                        checked={syncStore.replaceBeforeRestore}
                        onChange={(event) => void syncStore.setConfig({ replaceBeforeRestore: event.target.checked })}
                    />
                    先清空对应本地数据
                </label>
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
