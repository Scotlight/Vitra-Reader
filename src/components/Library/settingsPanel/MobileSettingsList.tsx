import type { ReactNode } from 'react'
import styles from './MobileSettingsList.module.css'

/**
 * 移动端设置子页面骨架（Readest/iOS 风格）
 *
 * 与桌面端 SettingsCard/SettingRow 的区别：
 * - 桌面端：卡片有标题、有边框、有 padding，SettingRow 是 label 左 / control 右两列
 * - 移动端：boxed list，一组圆角卡片内每行 56px 等高，label 左 / control end-aligned
 *
 * 为什么不复用桌面端组件：桌面端 `<SettingsCard title>` 自带 h2 标题，
 * 搬到移动端会跟 SubPageHeader 的页面标题重复（已经出现"字体"×3 的问题）。
 * 移动端组件没有标题概念，由 MobileSettingsGroup 提供组标题。
 */

interface MobileSettingsGroupProps {
    /** 组标题（如 "字体" / "字号与间距"）。小字号、浅灰色、字间距拉开 */
    label?: string
    children: ReactNode
}

export function MobileSettingsGroup({ label, children }: MobileSettingsGroupProps) {
    return (
        <section className={styles.group}>
            {label && <h3 className={styles.groupLabel}>{label}</h3>}
            <div className={styles.groupCard}>{children}</div>
        </section>
    )
}

interface MobileSettingsRowProps {
    /** 行主标签（左） */
    label: string
    /** 可选副标签（下方小字） */
    hint?: string
    /** 右侧控件 */
    children: ReactNode
}

export function MobileSettingsRow({ label, hint, children }: MobileSettingsRowProps) {
    return (
        <div className={styles.row}>
            <div className={styles.rowLabelGroup}>
                <span className={styles.rowLabel}>{label}</span>
                {hint && <span className={styles.rowHint}>{hint}</span>}
            </div>
            <div className={styles.rowControl}>{children}</div>
        </div>
    )
}

/** Stepper 行：[-] value [+]，全部触控 ≥ 40px */
interface MobileStepperRowProps {
    label: string
    value: number
    min: number
    max: number
    step: number
    onChange: (value: number) => void
    unit?: string
    decimals?: number
    hint?: string
}

function clamp(v: number, min: number, max: number, decimals: number) {
    return Number(Math.min(max, Math.max(min, v)).toFixed(decimals))
}

export function MobileStepperRow({
    label,
    value,
    min,
    max,
    step,
    onChange,
    unit = '',
    decimals,
    hint,
}: MobileStepperRowProps) {
    const actualDecimals = decimals ?? (String(step).split('.')[1]?.length ?? 0)
    const update = (dir: -1 | 1) => onChange(clamp(value + step * dir, min, max, actualDecimals))

    return (
        <MobileSettingsRow label={label} hint={hint}>
            <div className={styles.stepper} role="group" aria-label={label}>
                <button
                    type="button"
                    className={styles.stepperButton}
                    disabled={value <= min}
                    onClick={() => update(-1)}
                    aria-label={`${label}减少`}
                >
                    −
                </button>
                <span className={styles.stepperValue}>
                    {value.toFixed(actualDecimals)}{unit}
                </span>
                <button
                    type="button"
                    className={styles.stepperButton}
                    disabled={value >= max}
                    onClick={() => update(1)}
                    aria-label={`${label}增加`}
                >
                    +
                </button>
            </div>
        </MobileSettingsRow>
    )
}

/** Select 行：label 在左，值 + chevron 在右，整行可点 */
interface MobileSelectRowProps {
    label: string
    value: string
    options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>
    onChange: (value: string) => void
    hint?: string
}

export function MobileSelectRow({ label, value, options, onChange, hint }: MobileSelectRowProps) {
    const displayValue = options.find((o) => o.value === value)?.label ?? value
    return (
        <MobileSettingsRow label={label} hint={hint}>
            <label className={styles.selectWrapper}>
                <span className={styles.selectValue}>{displayValue}</span>
                <svg className={styles.selectChevron} viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <select
                    className={styles.selectNative}
                    aria-label={label}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                >
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
                    ))}
                </select>
            </label>
        </MobileSettingsRow>
    )
}

/** Toggle 行：右侧 iOS 风格开关 */
interface MobileToggleRowProps {
    label: string
    checked: boolean
    onChange: (checked: boolean) => void
    hint?: string
}

export function MobileToggleRow({ label, checked, onChange, hint }: MobileToggleRowProps) {
    return (
        <MobileSettingsRow label={label} hint={hint}>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
                onClick={() => onChange(!checked)}
            >
                <span className={styles.toggleThumb} />
            </button>
        </MobileSettingsRow>
    )
}

/** Color 行：左侧 label，中间色板，右侧重置 */
interface MobileColorRowProps {
    label: string
    value: string
    onChange: (value: string) => void
    onReset: () => void
    hint?: string
}

export function MobileColorRow({ label, value, onChange, onReset, hint }: MobileColorRowProps) {
    return (
        <MobileSettingsRow label={label} hint={hint}>
            <div className={styles.colorControl}>
                <label className={styles.colorSwatch} style={{ background: value }} aria-label={`${label}选择颜色`}>
                    <input
                        type="color"
                        className={styles.colorNative}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                    />
                </label>
                <span className={styles.colorValue}>{value.toUpperCase()}</span>
                <button type="button" className={styles.colorReset} onClick={onReset}>
                    重置
                </button>
            </div>
        </MobileSettingsRow>
    )
}
