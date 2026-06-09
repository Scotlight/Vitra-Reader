import { LegacySettingsCard, SettingsCard } from './SettingsCard'
import { SettingRow } from './SettingRow'
import { SyncSettingsTab } from './SyncSettingsTab'
import styles from '../SettingsPanelV2.module.css'

export function DataSettingsCards() {
    return (
        <div className={styles.singleCardGrid}>
            <LegacySettingsCard title="同步和备份">
                <SyncSettingsTab />
            </LegacySettingsCard>
            <SettingsCard title="备份状态">
                <SettingRow label="备份策略">
                    <span>使用 WebDAV 同步配置</span>
                </SettingRow>
                <SettingRow label="恢复策略">
                    <span>在左侧卡片选择恢复模式</span>
                </SettingRow>
            </SettingsCard>
        </div>
    )
}
