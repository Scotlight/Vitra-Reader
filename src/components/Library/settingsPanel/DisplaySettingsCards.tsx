import { FontPreviewSettingsCard } from './FontPreviewSettingsCard'
import { ReaderExperienceSettingsCard } from './ReaderExperienceSettingsCard'
import { ThemeTypographySettingsCard } from './ThemeTypographySettingsCard'
import type { SettingsFormStore } from './settingsTypes'
import styles from '../SettingsPanelV2.module.css'

interface DisplaySettingsCardsProps {
    loadingFonts: boolean
    onTempTextColorChange: (value: string | null) => void
    settings: SettingsFormStore
    systemFonts: string[]
    tempTextColor: string | null
}

export function DisplaySettingsCards({
    loadingFonts,
    onTempTextColorChange,
    settings,
    systemFonts,
    tempTextColor,
}: DisplaySettingsCardsProps) {
    // 专用网格：主题整行 + 体验/预览并排；不复用通用 cardGrid，避免牵动其他设置页
    return (
        <div className={styles.displaySettingsGrid}>
            <div className={styles.displayThemeArea}>
                <ThemeTypographySettingsCard
                    onTempTextColorChange={onTempTextColorChange}
                    settings={settings}
                    tempTextColor={tempTextColor}
                />
            </div>
            <div className={styles.displayExperienceArea}>
                <ReaderExperienceSettingsCard
                    loadingFonts={loadingFonts}
                    settings={settings}
                    systemFonts={systemFonts}
                />
            </div>
            <div className={styles.displayPreviewArea}>
                <FontPreviewSettingsCard settings={settings} />
            </div>
        </div>
    )
}
