import { SettingsCard } from './SettingsCard'
import { SettingRow } from './SettingRow'
import { StepperControl } from './StepperControl'
import type { SettingsFormStore } from './settingsTypes'
import styles from '../SettingsPanelV2.module.css'

const THEME_SWATCHES = [
    { id: 'light', color: '#ffffff', label: '浅色' },
    { id: 'dark', color: '#1a1a2e', label: '深色' },
    { id: 'sepia', color: '#f4ecd8', label: '护眼' },
    { id: 'green', color: '#c7edcc', label: '绿色' },
]

interface ThemeTypographySettingsCardProps {
    onTempTextColorChange: (value: string | null) => void
    settings: SettingsFormStore
    tempTextColor: string | null
}

export function ThemeTypographySettingsCard({
    onTempTextColorChange,
    settings,
    tempTextColor,
}: ThemeTypographySettingsCardProps) {
    return (
        <SettingsCard title="主题与排版">
            <SettingRow label="主题">
                <div className={styles.themeSwatches}>
                    {THEME_SWATCHES.map((theme) => (
                        <button
                            key={theme.id}
                            type="button"
                            className={`${styles.themeButton} ${settings.themeId === theme.id ? styles.themeButtonActive : ''}`}
                            style={{ background: theme.color }}
                            title={theme.label}
                            aria-label={theme.label}
                            onClick={() => settings.updateSetting('themeId', theme.id)}
                        />
                    ))}
                </div>
            </SettingRow>
            <SettingRow label="字号">
                <StepperControl
                    label="字号"
                    min={13}
                    max={40}
                    step={1}
                    value={settings.fontSize}
                    unit="px"
                    onChange={(value) => settings.updateSetting('fontSize', value)}
                />
            </SettingRow>
            <SettingRow label="行距">
                <StepperControl
                    label="行距"
                    min={1}
                    max={3.5}
                    step={0.1}
                    value={settings.lineHeight}
                    decimals={1}
                    onChange={(value) => settings.updateSetting('lineHeight', value)}
                />
            </SettingRow>
            <SettingRow label="字距">
                <StepperControl
                    label="字距"
                    min={0}
                    max={20}
                    step={1}
                    value={settings.letterSpacing}
                    unit="px"
                    onChange={(value) => settings.updateSetting('letterSpacing', value)}
                />
            </SettingRow>
            <SettingRow label="段距">
                <StepperControl
                    label="段距"
                    min={0}
                    max={100}
                    step={1}
                    value={settings.paragraphSpacing}
                    unit="px"
                    onChange={(value) => settings.updateSetting('paragraphSpacing', value)}
                />
            </SettingRow>
            <SettingRow label="背景色">
                <input
                    className={styles.colorInput}
                    type="color"
                    value={settings.customBgColor ?? '#ffffff'}
                    onChange={(event) => settings.updateSetting('customBgColor', event.target.value)}
                    aria-label="背景色"
                />
                <button
                    type="button"
                    className={styles.miniButton}
                    onClick={() => settings.updateSetting('customBgColor', null)}
                >
                    重置
                </button>
            </SettingRow>
            <SettingRow label="文字色">
                <input
                    className={styles.colorInput}
                    type="color"
                    value={tempTextColor ?? settings.customTextColor ?? '#1a1a1a'}
                    onChange={(event) => onTempTextColorChange(event.target.value)}
                    onBlur={(event) => {
                        settings.updateSetting('customTextColor', event.target.value)
                        onTempTextColorChange(null)
                    }}
                    onMouseUp={(event) => {
                        const target = event.target as HTMLInputElement
                        settings.updateSetting('customTextColor', target.value)
                        onTempTextColorChange(null)
                    }}
                    aria-label="文字色"
                />
                <button
                    type="button"
                    className={styles.miniButton}
                    onClick={() => {
                        settings.updateSetting('customTextColor', null)
                        onTempTextColorChange(null)
                    }}
                >
                    重置
                </button>
            </SettingRow>
        </SettingsCard>
    )
}
