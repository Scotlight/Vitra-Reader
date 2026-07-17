import { useState } from 'react'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { AboutSettingsCards } from './settingsPanel/AboutSettingsCards'
import { DataSettingsCards } from './settingsPanel/DataSettingsCards'
import { DisplaySettingsCards } from './settingsPanel/DisplaySettingsCards'
import { ExternalConnectionSettingsCards } from './settingsPanel/ExternalConnectionSettingsCards'
import { FontPreviewSettingsCard } from './settingsPanel/FontPreviewSettingsCard'
import { GeneralSettingsCards } from './settingsPanel/GeneralSettingsCards'
import { ReaderExperienceSettingsCard } from './settingsPanel/ReaderExperienceSettingsCard'
import type { MobileSettingsPage } from './settingsPanel/mobileSettings'
import { SettingsPanelShell, type SettingsRail } from './settingsPanel/SettingsPanelShell'
import { ThemeTypographySettingsCard } from './settingsPanel/ThemeTypographySettingsCard'
import { ReadingStatsPanel } from './ReadingStatsPanel'
import styles from './SettingsPanelV2.module.css'

interface SettingsPanelProps {
    systemFonts: string[]
    loadingFonts: boolean
    mobilePage: MobileSettingsPage | null
    onClose: () => void
    onMobilePageChange: (page: MobileSettingsPage | null) => void
}

export const SettingsPanel = ({
    systemFonts,
    loadingFonts,
    mobilePage,
    onClose,
    onMobilePageChange,
}: SettingsPanelProps) => {
    const settings = useSettingsStore()
    const [activeRail, setActiveRail] = useState<SettingsRail>('general')
    const [tempTextColor, setTempTextColor] = useState<string | null>(null)

    const resetSettings = () => {
        settings.resetToDefaults()
        setTempTextColor(null)
    }

    const renderDesktopContent = () => {
        if (activeRail === 'display') {
            return (
                <DisplaySettingsCards
                    loadingFonts={loadingFonts}
                    onTempTextColorChange={setTempTextColor}
                    settings={settings}
                    systemFonts={systemFonts}
                    tempTextColor={tempTextColor}
                />
            )
        }
        if (activeRail === 'externalConnection') return <ExternalConnectionSettingsCards />
        if (activeRail === 'data') return <DataSettingsCards />
        if (activeRail === 'about') return <AboutSettingsCards />
        return <GeneralSettingsCards onClose={onClose} onReset={resetSettings} settings={settings} />
    }

    const renderMobileContent = () => {
        if (mobilePage === 'readingMode' || mobilePage === 'font') {
            return (
                <div className={styles.singleCardGrid}>
                    <ReaderExperienceSettingsCard
                        loadingFonts={loadingFonts}
                        scope={mobilePage === 'font' ? 'font' : 'reading'}
                        settings={settings}
                        systemFonts={systemFonts}
                    />
                    {mobilePage === 'font' && <FontPreviewSettingsCard settings={settings} />}
                </div>
            )
        }
        if (mobilePage === 'typography' || mobilePage === 'theme') {
            return (
                <div className={styles.mobileAppearanceGrid}>
                    <ThemeTypographySettingsCard
                        onTempTextColorChange={setTempTextColor}
                        scope={mobilePage}
                        settings={settings}
                        tempTextColor={tempTextColor}
                    />
                    {mobilePage === 'typography' && <FontPreviewSettingsCard settings={settings} />}
                </div>
            )
        }
        if (mobilePage === 'appearance') {
            return <GeneralSettingsCards onClose={onClose} onReset={resetSettings} settings={settings} />
        }
        if (mobilePage === 'stats') return <ReadingStatsPanel />
        if (mobilePage === 'translateService') return <ExternalConnectionSettingsCards scope="service" />
        if (mobilePage === 'translateCache') return <ExternalConnectionSettingsCards scope="cache" />
        if (mobilePage === 'data') return <DataSettingsCards />
        if (mobilePage === 'about') return <AboutSettingsCards />
        return null
    }

    return (
        <SettingsPanelShell
            activeRail={activeRail}
            mobilePage={mobilePage}
            onClose={onClose}
            onMobilePageChange={onMobilePageChange}
            onRailChange={(rail) => {
                onMobilePageChange(null)
                setActiveRail(rail)
            }}
            onReset={resetSettings}
        >
            {mobilePage ? renderMobileContent() : renderDesktopContent()}
        </SettingsPanelShell>
    )
}
