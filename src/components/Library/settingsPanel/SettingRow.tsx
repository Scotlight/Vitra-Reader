import type { ReactNode } from 'react'
import styles from '../SettingsPanelV2.module.css'

interface SettingRowProps {
    label: string
    children: ReactNode
}

export function SettingRow({ label, children }: SettingRowProps) {
    return (
        <div className={styles.settingRow}>
            <div className={styles.settingLabel}>{label}</div>
            <div className={styles.settingValue}>{children}</div>
        </div>
    )
}
