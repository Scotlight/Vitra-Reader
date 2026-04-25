import { motion } from 'framer-motion'
import searchIcon from '@/assets/icons/search.svg'
import sortIcon from '@/assets/icons/sort.svg'
import refreshIcon from '@/assets/icons/refresh.svg'
import themeIcon from '@/assets/icons/theme.svg'
import chevronDownIcon from '@/assets/icons/chevron-down.svg'
import styles from '../LibraryView.module.css'

interface LibraryTopbarProps {
    keyword: string
    sortModeLabel: string
    isLoading: boolean
    onKeywordChange: (value: string) => void
    onNextSortMode: () => void
    onRefresh: () => void
    onToggleTheme: () => void
    onImport: () => void
}

function Icon({ src, className }: { src: string; className?: string }) {
    return <img className={className} src={src} alt="" />
}

export function LibraryTopbar({
    keyword,
    sortModeLabel,
    isLoading,
    onKeywordChange,
    onNextSortMode,
    onRefresh,
    onToggleTheme,
    onImport,
}: LibraryTopbarProps) {
    return (
        <header className={styles.topbar}>
            <div className={styles.searchWrap}>
                <input
                    className={styles.searchInput}
                    type="search"
                    name="library-search"
                    aria-label="搜索我的书库"
                    placeholder="搜索我的书库"
                    value={keyword}
                    onChange={(event) => onKeywordChange(event.target.value)}
                />
                <Icon className={styles.searchIcon} src={searchIcon} />
            </div>

            <div className={styles.actions}>
                <button className={styles.iconBtn} title={`排序：${sortModeLabel}`} onClick={onNextSortMode}>
                    <Icon className={styles.actionIcon} src={sortIcon} />
                    <span>{sortModeLabel}</span>
                </button>
                <button className={styles.iconBtn} title="刷新" onClick={onRefresh}>
                    <Icon className={styles.actionIcon} src={refreshIcon} />
                </button>
                <button className={styles.iconBtn} title="主题切换" onClick={onToggleTheme}>
                    <Icon className={styles.actionIcon} src={themeIcon} />
                </button>
                <motion.button
                    className={styles.importBtn}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={onImport}
                    disabled={isLoading}
                >
                    {isLoading ? '导入中...' : '导入图书'}
                    <Icon className={styles.importArrow} src={chevronDownIcon} />
                </motion.button>
            </div>
        </header>
    )
}
