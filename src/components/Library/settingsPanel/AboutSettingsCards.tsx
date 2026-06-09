import { SettingsCard } from './SettingsCard'
import styles from '../SettingsPanelV2.module.css'

const APP_VERSION = '0.1.0'

export function AboutSettingsCards() {
    return (
        <div className={styles.cardGrid}>
            <SettingsCard title="版本信息">
                <div className={styles.infoList}>
                    <div className={styles.infoRow}>
                        <span>应用名称</span>
                        <strong>Vitra Reader</strong>
                    </div>
                    <div className={styles.infoRow}>
                        <span>版本号</span>
                        <strong>{APP_VERSION}</strong>
                    </div>
                    <div className={styles.infoRow}>
                        <span>运行环境</span>
                        <strong>Electron + React</strong>
                    </div>
                </div>
            </SettingsCard>
            <SettingsCard title="开源信息">
                <div className={styles.infoList}>
                    <div className={styles.infoRow}>
                        <span>协议</span>
                        <strong>AGPL-3.0-only</strong>
                    </div>
                    <div className={styles.infoRow}>
                        <span>渲染架构</span>
                        <strong>Vitra Vectorized Virtual Rendering</strong>
                    </div>
                </div>
            </SettingsCard>
        </div>
    )
}
