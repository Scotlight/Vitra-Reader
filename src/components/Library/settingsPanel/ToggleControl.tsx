import styles from '../SettingsPanelV2.module.css'

interface ToggleControlProps {
    checked: boolean
    onChange: (checked: boolean) => void
    disabled?: boolean
    label: string
}

export function ToggleControl({ checked, onChange, disabled = false, label }: ToggleControlProps) {
    return (
        <button
            type="button"
            className={`${styles.toggleControl} ${checked ? styles.toggleControlOn : ''}`}
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
        >
            <span className={styles.toggleKnob} />
        </button>
    )
}
