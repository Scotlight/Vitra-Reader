import type { ReactNode } from 'react'
import styles from '../SettingsPanelV2.module.css'

interface SettingsCardProps {
    title: string
    children: ReactNode
}

export function SettingsCard({ title, children }: SettingsCardProps) {
    return (
        <section className={styles.settingsCard}>
            <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{title}</h2>
            </div>
            <div className={styles.cardBody}>{children}</div>
        </section>
    )
}

export function LegacySettingsCard({ title, children }: SettingsCardProps) {
    return (
        <SettingsCard title={title}>
            <div className={styles.legacyPanel}>{children}</div>
        </SettingsCard>
    )
}
