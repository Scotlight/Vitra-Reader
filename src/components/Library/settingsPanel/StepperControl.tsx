import styles from '../SettingsPanelV2.module.css'

interface StepperControlProps {
    value: number
    min: number
    max: number
    step: number
    onChange: (value: number) => void
    label: string
    unit?: string
    decimals?: number
}

function inferDecimals(step: number): number {
    const [, fraction = ''] = String(step).split('.')
    return fraction.length
}

function clamp(value: number, min: number, max: number, decimals: number): number {
    const bounded = Math.min(max, Math.max(min, value))
    return Number(bounded.toFixed(decimals))
}

export function StepperControl({
    value,
    min,
    max,
    step,
    onChange,
    label,
    unit = '',
    decimals = inferDecimals(step),
}: StepperControlProps) {
    const updateValue = (direction: -1 | 1) => {
        onChange(clamp(value + step * direction, min, max, decimals))
    }

    return (
        <span className={styles.stepperControl} aria-label={label}>
            <button
                type="button"
                className={styles.stepperButton}
                disabled={value <= min}
                onClick={() => updateValue(-1)}
                aria-label={`${label}减少`}
            >
                -
            </button>
            <span className={styles.stepperValue}>{`${value.toFixed(decimals)}${unit}`}</span>
            <button
                type="button"
                className={styles.stepperButton}
                disabled={value >= max}
                onClick={() => updateValue(1)}
                aria-label={`${label}增加`}
            >
                +
            </button>
        </span>
    )
}
