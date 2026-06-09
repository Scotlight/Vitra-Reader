import chevronDownIcon from '@/assets/icons/chevron-down.svg'
import styles from '../SettingsPanelV2.module.css'

export interface SelectControlOption {
    value: string
    label: string
}

interface SelectControlProps {
    value: string
    options: SelectControlOption[]
    onChange: (value: string) => void
    label: string
}

export function SelectControl({ value, options, onChange, label }: SelectControlProps) {
    return (
        <span className={styles.selectControl}>
            <select
                aria-label={label}
                value={value}
                onChange={(event) => onChange(event.target.value)}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            <img src={chevronDownIcon} alt="" className={styles.selectChevron} />
        </span>
    )
}
