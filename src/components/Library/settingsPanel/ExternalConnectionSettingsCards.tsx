import { LegacySettingsCard, SettingsCard } from './SettingsCard'
import { SettingRow } from './SettingRow'
import { TranslateSettingsTab } from './TranslateSettingsTab'
import styles from '../SettingsPanelV2.module.css'

export function ExternalConnectionSettingsCards() {
    return (
        <div className={styles.singleCardGrid}>
            <LegacySettingsCard title="翻译服务">
                <TranslateSettingsTab />
            </LegacySettingsCard>
            <SettingsCard title="连接说明">
                <SettingRow label="服务类型">
                    <span>外部翻译 API / 本地 Ollama / DeepLX 兼容服务</span>
                </SettingRow>
                <SettingRow label="缓存策略">
                    <span>翻译缓存和过期时间在上方配置中管理</span>
                </SettingRow>
            </SettingsCard>
        </div>
    )
}
