import homeIcon from '@/assets/icons/home.svg'
import libraryIcon from '@/assets/icons/library.svg'
import noteIcon from '@/assets/icons/note.svg'
import searchIcon from '@/assets/icons/search.svg'
import settingsIcon from '@/assets/icons/settings.svg'
import shelfAddIcon from '@/assets/icons/shelf-add.svg'
import timeIcon from '@/assets/icons/time.svg'
import vitraLogo from '@/assets/icons/vitra-logo.svg'
import { MOBILE_SETTINGS_PAGE_TITLES, type MobileSettingsPage } from './settingsPanel/mobileSettings'
import styles from './LibraryView.module.css'

export type MobileLibraryDestination = 'all' | 'fav' | 'notes' | 'highlight' | 'trash' | 'stats'

/**
 * 移动端一级 tab（设计原型 1a 的 5 分区）。与 `LibraryActiveNav` 是两层概念：
 * tab 是移动端独有的导航叠加层，由 LibraryView 负责映射到 activeNav / showSettings，
 * 不往桌面共用的派生链里加值。
 */
export type MobileLibraryTab = 'home' | 'shelf' | 'time' | 'notes' | 'settings'

interface MobileLibraryChromeProps {
    readonly activeNav: MobileLibraryDestination
    readonly isLoading: boolean
    readonly isSettingsOpen: boolean
    readonly keyword: string
    readonly mobileSettingsPage: MobileSettingsPage | null
    readonly mobileTab: MobileLibraryTab
    readonly onHomeSearch: () => void
    readonly onImport: () => void
    readonly onKeywordChange: (value: string) => void
    readonly onNavigate: (destination: MobileLibraryDestination) => void
    readonly onMobileSettingsBack: () => void
    readonly onTabChange: (tab: MobileLibraryTab) => void
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

interface MobileTabSpec {
    readonly tab: MobileLibraryTab
    readonly icon: string
    readonly label: string
}

const mobileTabs: ReadonlyArray<MobileTabSpec> = [
    { tab: 'home', icon: homeIcon, label: '首页' },
    { tab: 'shelf', icon: libraryIcon, label: '书架' },
    { tab: 'time', icon: timeIcon, label: '阅读时间' },
    { tab: 'notes', icon: noteIcon, label: '笔记' },
    { tab: 'settings', icon: settingsIcon, label: '设置' },
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
    mobileTab,
    onHomeSearch,
    onImport,
    onKeywordChange,
    onNavigate,
    onMobileSettingsBack,
    onTabChange,
    statusText,
}: MobileLibraryChromeProps) {
    const isHomeTab = !isSettingsOpen && mobileTab === 'home'
    const isLibrarySection = activeNav === 'all' || activeNav === 'fav' || activeNav === 'trash'
    const isAnnotationSection = activeNav === 'notes' || activeNav === 'highlight'
    const filters = isLibrarySection ? libraryFilters : isAnnotationSection ? annotationFilters : []
    const pageTitle = isSettingsOpen
        ? mobileSettingsPage ? MOBILE_SETTINGS_PAGE_TITLES[mobileSettingsPage] : '设置'
        : activeNav === 'stats'
            ? '阅读时间'
            : isAnnotationSection
                ? '标注'
                : '我的书架'

    // 设置也能从桌面侧栏打开（此时 mobileTab 可能没跟上），所以设置 tab 的高亮以
    // isSettingsOpen 为准，其余 tab 在设置打开时一律不高亮，避免出现双高亮。
    const isTabActive = (tab: MobileLibraryTab) =>
        tab === 'settings' ? isSettingsOpen : !isSettingsOpen && mobileTab === tab

    return (
        <div className={styles.mobileLibraryChrome} data-mobile-library-chrome="true">
            <header className={styles.mobileLibraryHeader}>
                {isHomeTab ? (
                    // 首页头照原型 1a：大标题 + 右侧搜索圆钮 / 导入胶囊，不带品牌行与筛选
                    <div className={styles.mobileHomeHeaderRow}>
                        <h1 className={styles.mobileHomeTitle}>首页</h1>
                        <div className={styles.mobileHomeActions}>
                            <button
                                type="button"
                                className={styles.mobileHomeSearchButton}
                                aria-label="搜索书库"
                                onClick={onHomeSearch}
                            >
                                <img src={searchIcon} alt="" />
                            </button>
                            <button
                                type="button"
                                className={styles.mobileHomeImportButton}
                                aria-label="导入图书"
                                disabled={isLoading}
                                onClick={onImport}
                            >
                                {isLoading ? '导入中' : '＋ 导入'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
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
                    </>
                )}
            </header>

            <nav className={styles.mobileBottomNav} aria-label="移动端书库导航">
                {mobileTabs.map(({ tab, icon, label }) => (
                    <MobileNavButton
                        key={tab}
                        active={isTabActive(tab)}
                        icon={icon}
                        label={label}
                        onClick={() => onTabChange(tab)}
                    />
                ))}
            </nav>
        </div>
    )
}
