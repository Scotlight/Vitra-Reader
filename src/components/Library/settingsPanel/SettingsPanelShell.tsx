import type { ReactNode } from 'react'
import libraryIcon from '@/assets/icons/library.svg'
import settingsIcon from '@/assets/icons/settings.svg'
import themeIcon from '@/assets/icons/theme.svg'
import gridIcon from '@/assets/icons/grid.svg'
import trashIcon from '@/assets/icons/trash.svg'
import refreshIcon from '@/assets/icons/refresh.svg'
import listIcon from '@/assets/icons/list.svg'
import noteIcon from '@/assets/icons/note.svg'
import readerTranslateIcon from '@/assets/icons/reader-translate.svg'
import vitraLogo from '@/assets/icons/vitra-logo.svg'
import styles from '../SettingsPanelV2.module.css'
import { SettingsPanelIcon } from './SettingsPanelIcon'
import { MOBILE_SETTINGS_PAGE_TITLES, type MobileSettingsPage } from './mobileSettings'

export type SettingsRail = 'general' | 'display' | 'externalConnection' | 'data' | 'about'

const RAIL_ITEMS: Array<{ id: SettingsRail; label: string; icon: string }> = [
    { id: 'general', label: '通用', icon: settingsIcon },
    { id: 'display', label: '显示', icon: themeIcon },
    { id: 'externalConnection', label: '外部连接', icon: libraryIcon },
    { id: 'data', label: '数据', icon: refreshIcon },
    { id: 'about', label: '关于', icon: gridIcon },
]

const RAIL_TITLES: Record<SettingsRail, { title: string; hint: string }> = {
    general: { title: '通用设置', hint: '控制主界面外观和基础交互。' },
    display: { title: '显示设置', hint: '调整主题、排版和阅读体验。' },
    externalConnection: { title: '外部连接', hint: '配置翻译 Provider、外部 API 和缓存策略。' },
    data: { title: '数据设置', hint: '管理同步、备份和恢复。' },
    about: { title: '关于 Vitra', hint: '查看版本、协议和项目状态。' },
}

interface MobileSettingsGroup {
    label: string
    items: ReadonlyArray<{ id: MobileSettingsPage; icon: string }>
}

const MOBILE_SETTINGS_GROUPS: ReadonlyArray<MobileSettingsGroup> = [
    {
        label: '阅读',
        items: [
            { id: 'readingMode', icon: listIcon },
            { id: 'font', icon: libraryIcon },
            { id: 'typography', icon: noteIcon },
            { id: 'theme', icon: themeIcon },
        ],
    },
    {
        label: '应用',
        items: [
            { id: 'appearance', icon: settingsIcon },
            { id: 'stats', icon: gridIcon },
        ],
    },
    {
        label: '服务',
        items: [
            { id: 'translateService', icon: readerTranslateIcon },
            { id: 'translateCache', icon: refreshIcon },
        ],
    },
    {
        label: '数据',
        items: [{ id: 'data', icon: libraryIcon }],
    },
    {
        label: '其他',
        items: [{ id: 'about', icon: vitraLogo }],
    },
]

interface SettingsPanelShellProps {
    activeRail: SettingsRail
    children: ReactNode
    mobilePage: MobileSettingsPage | null
    onClose: () => void
    onMobilePageChange: (page: MobileSettingsPage | null) => void
    onRailChange: (rail: SettingsRail) => void
    onReset: () => void
}

export function SettingsPanelShell({
    activeRail,
    children,
    mobilePage,
    onClose,
    onMobilePageChange,
    onRailChange,
    onReset,
}: SettingsPanelShellProps) {
    const activeRailMeta = RAIL_TITLES[activeRail]

    return (
        <div className={styles.embeddedShell}>
            <aside className={styles.settingsRail}>
                <h1 className={styles.railTitle}>设置</h1>
                <nav className={styles.railMenu} aria-label="桌面设置分类">
                    {RAIL_ITEMS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={`${styles.railItem} ${activeRail === item.id ? styles.railItemActive : ''}`}
                            onClick={() => onRailChange(item.id)}
                        >
                            <SettingsPanelIcon src={item.icon} />
                            {item.label}
                        </button>
                    ))}
                </nav>
            </aside>

            {mobilePage === null && (
                <section className={styles.mobileSettingsHome} aria-label="设置分类首页">
                    <nav className={styles.mobileSettingsGroups} aria-label="设置分类">
                        {MOBILE_SETTINGS_GROUPS.map((group) => (
                            <section key={group.label} className={styles.mobileSettingsGroup}>
                                <h2 className={styles.mobileSettingsGroupTitle}>{group.label}</h2>
                                <div className={styles.mobileSettingsMenu}>
                                    {group.items.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            className={styles.mobileSettingsItem}
                                            onClick={() => onMobilePageChange(item.id)}
                                        >
                                            <img className={styles.mobileSettingsItemIcon} src={item.icon} alt="" />
                                            <span>{MOBILE_SETTINGS_PAGE_TITLES[item.id]}</span>
                                            <span className={styles.mobileSettingsChevron} aria-hidden="true">›</span>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </nav>
                </section>
            )}

            <main className={`${styles.content} ${mobilePage === null ? styles.mobileContentHidden : ''}`}>
                <div className={styles.contentHeader}>
                    <div>
                        <h1 className={styles.pageTitle}>{activeRailMeta.title}</h1>
                        <p className={styles.pageHint}>{activeRailMeta.hint}</p>
                    </div>
                </div>
                <div className={styles.contentScroll}>{children}</div>
                <div className={styles.bottomRow}>
                    <button type="button" className={styles.resetButton} onClick={onReset}>
                        <SettingsPanelIcon src={trashIcon} />
                        重置默认
                    </button>
                    <div className={styles.bottomActions}>
                        <button type="button" className={styles.applyButton} onClick={onClose}>
                            完成
                        </button>
                    </div>
                </div>
            </main>
        </div>
    )
}
