import styles from '../SettingsPanelV2.module.css'

interface SettingsPanelIconProps {
    src: string
}

export function SettingsPanelIcon({ src }: SettingsPanelIconProps) {
    return <img src={src} alt="" className={styles.navIcon} />
}
