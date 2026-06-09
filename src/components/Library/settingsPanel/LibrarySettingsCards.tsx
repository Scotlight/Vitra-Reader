import { LegacySettingsCard, SettingsCard } from './SettingsCard'
import { SettingRow } from './SettingRow'
import { TranslateSettingsTab } from './TranslateSettingsTab'
import styles from '../SettingsPanelV2.module.css'

export function LibrarySettingsCards() {
    return (
        <div className={styles.cardGrid}>
            <LegacySettingsCard title="翻译设置">
                <TranslateSettingsTab />
            </LegacySettingsCard>
            <SettingsCard title="书库选项">
                <SettingRow label="导入规则">
                    <span>沿用当前书库导入流程</span>
                </SettingRow>
                <SettingRow label="翻译缓存">
                    <span>在左侧卡片管理</span>
                </SettingRow>
            </SettingsCard>
        </div>
    )
}
