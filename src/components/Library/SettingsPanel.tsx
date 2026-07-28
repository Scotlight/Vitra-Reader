import { useState } from 'react'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { AboutSettingsCards } from './settingsPanel/AboutSettingsCards'
import { DataSettingsCards } from './settingsPanel/DataSettingsCards'
import { DisplaySettingsCards } from './settingsPanel/DisplaySettingsCards'
import { ExternalConnectionSettingsCards } from './settingsPanel/ExternalConnectionSettingsCards'
import { GeneralSettingsCards } from './settingsPanel/GeneralSettingsCards'
import { MobileReaderSettingsSubpage } from './settingsPanel/MobileReaderSettingsSubpage'
import type { MobileSettingsPage } from './settingsPanel/mobileSettings'
import { SettingsPanelShell, type SettingsRail } from './settingsPanel/SettingsPanelShell'
import { ReadingStatsPanel } from './ReadingStatsPanel'

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
        // 字体/排版/主题/阅读方式 4 个子页面走移动端专用骨架（Readest/iOS 风格 boxed list）
        // 桌面端组件（ReaderExperienceSettingsCard 等）保留给桌面，不再被移动端复用
        if (mobilePage === 'readingMode' || mobilePage === 'font' || mobilePage === 'typography' || mobilePage === 'theme') {
            return (
                <MobileReaderSettingsSubpage
                    page={mobilePage}
                    settings={settings}
                    systemFonts={systemFonts}
                    loadingFonts={loadingFonts}
                    tempTextColor={tempTextColor}
                    onTempTextColorChange={setTempTextColor}
                />
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
