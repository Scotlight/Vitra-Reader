import { SettingsCard } from './SettingsCard'
import { getPlatformCapabilities } from '@/services/platform/platformBridge'
import styles from '../SettingsPanelV2.module.css'

export function AboutSettingsCards() {
    // 运行环境按是否存在 Electron bridge 动态判断：桌面壳 → Electron，纯浏览器 → Web/PWA
    const runtimeLabel = getPlatformCapabilities().isDesktop
        ? 'Electron + React'
        : 'Web/PWA + React'

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
                        <strong>{__APP_VERSION__}</strong>
                    </div>
                    <div className={styles.infoRow}>
                        <span>运行环境</span>
                        <strong>{runtimeLabel}</strong>
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
