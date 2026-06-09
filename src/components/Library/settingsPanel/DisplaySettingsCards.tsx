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
    return (
        <div className={styles.cardGrid}>
            <ThemeTypographySettingsCard
                onTempTextColorChange={onTempTextColorChange}
                settings={settings}
                tempTextColor={tempTextColor}
            />
            <ReaderExperienceSettingsCard
                loadingFonts={loadingFonts}
                settings={settings}
                systemFonts={systemFonts}
            />
        </div>
    )
}
