import { useState } from 'react'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { AboutSettingsCards } from './settingsPanel/AboutSettingsCards'
import { DataSettingsCards } from './settingsPanel/DataSettingsCards'
import { DisplaySettingsCards } from './settingsPanel/DisplaySettingsCards'
import { GeneralSettingsCards } from './settingsPanel/GeneralSettingsCards'
import { LibrarySettingsCards } from './settingsPanel/LibrarySettingsCards'
import { SettingsPanelShell, type SettingsRail } from './settingsPanel/SettingsPanelShell'

interface SettingsPanelProps {
    systemFonts: string[]
    loadingFonts: boolean
    onClose: () => void
}

export const SettingsPanel = ({ systemFonts, loadingFonts, onClose }: SettingsPanelProps) => {
    const settings = useSettingsStore()
    const [activeRail, setActiveRail] = useState<SettingsRail>('general')
    const [tempTextColor, setTempTextColor] = useState<string | null>(null)

    const resetSettings = () => {
        settings.resetToDefaults()
        setTempTextColor(null)
    }

    const renderContent = () => {
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
        if (activeRail === 'library') return <LibrarySettingsCards />
        if (activeRail === 'data') return <DataSettingsCards />
        if (activeRail === 'about') return <AboutSettingsCards />
        return <GeneralSettingsCards onClose={onClose} onReset={resetSettings} settings={settings} />
    }

    return (
        <SettingsPanelShell
            activeRail={activeRail}
            onClose={onClose}
            onRailChange={setActiveRail}
            onReset={resetSettings}
        >
            {renderContent()}
        </SettingsPanelShell>
    )
}
