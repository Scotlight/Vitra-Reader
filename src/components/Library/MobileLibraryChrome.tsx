import gridIcon from '@/assets/icons/grid.svg'
import highlightIcon from '@/assets/icons/highlight.svg'
import libraryIcon from '@/assets/icons/library.svg'
import searchIcon from '@/assets/icons/search.svg'
import settingsIcon from '@/assets/icons/settings.svg'
import shelfAddIcon from '@/assets/icons/shelf-add.svg'
import vitraLogo from '@/assets/icons/vitra-logo.svg'
import { MOBILE_SETTINGS_PAGE_TITLES, type MobileSettingsPage } from './settingsPanel/mobileSettings'
import styles from './LibraryView.module.css'

export type MobileLibraryDestination = 'all' | 'fav' | 'notes' | 'highlight' | 'trash' | 'stats'

interface MobileLibraryChromeProps {
    readonly activeNav: MobileLibraryDestination
    readonly isLoading: boolean
    readonly isSettingsOpen: boolean
    readonly keyword: string
    readonly mobileSettingsPage: MobileSettingsPage | null
    readonly onImport: () => void
    readonly onKeywordChange: (value: string) => void
    readonly onNavigate: (destination: MobileLibraryDestination) => void
    readonly onMobileSettingsBack: () => void
    readonly onOpenSettings: () => void
    readonly statusText: string
}

interface MobileLibraryFilter {
    destination: Exclude<MobileLibraryDestination, 'stats'>
    label: string
}

const libraryFilters: ReadonlyArray<MobileLibraryFilter> = [
    { destination: 'all', label: '全部' },
    { destination: 'fav', label: '收藏' },
    { destination: 'trash', label: '回收站' },
]

const annotationFilters: ReadonlyArray<MobileLibraryFilter> = [
    { destination: 'notes', label: '笔记' },
    { destination: 'highlight', label: '高亮' },
]

interface MobileNavButtonProps {
    readonly active: boolean
    readonly icon: string
    readonly label: string
    readonly onClick: () => void
}

function MobileNavButton({ active, icon, label, onClick }: MobileNavButtonProps) {
    return (
        <button
            type="button"
            className={`${styles.mobileNavButton} ${active ? styles.mobileNavButtonActive : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={onClick}
        >
            <img src={icon} alt="" />
            <span>{label}</span>
        </button>
    )
}

export function MobileLibraryChrome({
    activeNav,
    isLoading,
    isSettingsOpen,
    keyword,
    mobileSettingsPage,
    onImport,
    onKeywordChange,
    onNavigate,
    onMobileSettingsBack,
    onOpenSettings,
    statusText,
}: MobileLibraryChromeProps) {
    const isLibrarySection = activeNav === 'all' || activeNav === 'fav' || activeNav === 'trash'
    const isAnnotationSection = activeNav === 'notes' || activeNav === 'highlight'
    const filters = isLibrarySection ? libraryFilters : isAnnotationSection ? annotationFilters : []
    const pageTitle = isSettingsOpen
        ? mobileSettingsPage ? MOBILE_SETTINGS_PAGE_TITLES[mobileSettingsPage] : '设置'
        : activeNav === 'stats'
            ? '阅读统计'
            : isAnnotationSection
                ? '标注'
                : '我的书架'

    return (
        <div className={styles.mobileLibraryChrome} data-mobile-library-chrome="true">
            <header className={styles.mobileLibraryHeader}>
                {(!isSettingsOpen || mobileSettingsPage === null) && (
                    <div className={styles.mobileBrandRow}>
                        <div className={styles.mobileBrand}>
                            <img src={vitraLogo} alt="" />
                            <span>Vitra</span>
                        </div>
                        {!isSettingsOpen && isLibrarySection && (
                        <button
                            type="button"
                            className={styles.mobileImportButton}
                            aria-label="导入图书"
                            title="导入图书"
                            disabled={isLoading}
                            onClick={onImport}
                        >
                            <img src={shelfAddIcon} alt="" />
                            <span>{isLoading ? '导入中' : '导入'}</span>
                        </button>
                        )}
                    </div>
                )}

                <div className={`${styles.mobileTitleRow} ${mobileSettingsPage ? styles.mobileSettingsTitleRow : ''}`}>
                    {isSettingsOpen && mobileSettingsPage && (
                        <button
                            type="button"
                            className={styles.mobileSettingsBackButton}
                            aria-label="返回设置分类"
                            onClick={onMobileSettingsBack}
                        >
                            <span aria-hidden="true">←</span>
                        </button>
                    )}
                    <h1>{pageTitle}</h1>
                    {!isSettingsOpen && <span>{statusText}</span>}
                    {isSettingsOpen && mobileSettingsPage && <span className={styles.mobileSettingsTitleSpacer} aria-hidden="true" />}
                </div>

                {!isSettingsOpen && isLibrarySection && (
                    <>
                        <label className={styles.mobileSearch}>
                            <img src={searchIcon} alt="" />
                            <input
                                type="search"
                                name="mobile-library-search"
                                aria-label="搜索我的书库"
                                placeholder="搜索书名或作者"
                                value={keyword}
                                onChange={(event) => onKeywordChange(event.target.value)}
                            />
                        </label>

                    </>
                )}

                {!isSettingsOpen && filters.length > 0 && (
                    <nav className={styles.mobileFilters} aria-label={isAnnotationSection ? '标注筛选' : '书库筛选'}>
                        {filters.map(({ destination, label }) => {
                            const active = activeNav === destination
                            return (
                                <button
                                    key={destination}
                                    type="button"
                                    className={active ? styles.mobileFilterActive : ''}
                                    aria-label={`筛选${label}`}
                                    aria-pressed={active}
                                    onClick={() => onNavigate(destination)}
                                >
                                    {label}
                                </button>
                            )
                        })}
                    </nav>
                )}
            </header>

            <nav className={styles.mobileBottomNav} aria-label="移动端书库导航">
                <MobileNavButton
                    active={!isSettingsOpen && activeNav === 'all'}
                    icon={libraryIcon}
                    label="书架"
                    onClick={() => onNavigate('all')}
                />
                <MobileNavButton
                    active={!isSettingsOpen && isAnnotationSection}
                    icon={highlightIcon}
                    label="标注"
                    onClick={() => onNavigate('notes')}
                />
                <MobileNavButton
                    active={!isSettingsOpen && activeNav === 'stats'}
                    icon={gridIcon}
                    label="统计"
                    onClick={() => onNavigate('stats')}
                />
                <MobileNavButton
                    active={isSettingsOpen}
                    icon={settingsIcon}
                    label="设置"
                    onClick={onOpenSettings}
                />
            </nav>
        </div>
    )
}
