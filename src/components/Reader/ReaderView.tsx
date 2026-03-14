import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { clampInt, clampDecimal } from '../../utils/mathUtils'
import { db, Highlight, Bookmark } from '../../services/storageService'
import { useSettingsStore, type PageTurnMode } from '../../stores/useSettingsStore'
import type { ContentProvider, TocItem, SearchResult, SpineItemInfo, BookFormat } from '../../engine/core/contentProvider'
import { VitraPipeline, VitraContentAdapter, resolveReaderRenderMode } from '../../engine'
import { ScrollReaderView, ScrollReaderHandle } from './ScrollReaderView'
import { PaginatedReaderView, PaginatedReaderHandle } from './PaginatedReaderView'
import { buildFontFamilyWithFallback } from '../../utils/fontFallback'
import styles from './ReaderView.module.css'

interface ReaderViewProps {
    bookId: string
    onBack: () => void
    jumpTarget?: { location: string; searchText?: string } | null
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const normalized = hex.trim().replace('#', '')
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null
    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16),
    }
}

function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
    const toLinear = (value: number) => {
        const channel = value / 255
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    }
    const R = toLinear(r)
    const G = toLinear(g)
    const B = toLinear(b)
    return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

function contrastRatio(a: string, b: string): number {
    const ra = hexToRgb(a)
    const rb = hexToRgb(b)
    if (!ra || !rb) return 21
    const L1 = luminance(ra)
    const L2 = luminance(rb)
    const lighter = Math.max(L1, L2)
    const darker = Math.min(L1, L2)
    return (lighter + 0.05) / (darker + 0.05)
}

function buildFallbackTocFromSpine(spineItems: SpineItemInfo[]): TocItem[] {
    return spineItems.map((item, index) => ({
        id: item.id || `spine-${index}`,
        href: item.href,
        label: labelFromSpineHref(item.href, index),
    }))
}

function labelFromSpineHref(href: string, index: number): string {
    const fallback = `Chapter ${index + 1}`
    if (!href) return fallback

    const [pathPart] = href.split('#', 2)
    const fileName = pathPart.split('/').pop() || ''
    const decoded = decodeSafe(fileName)
    const withoutExt = decoded.replace(/\.[^.]+$/, '')
    const cleaned = withoutExt
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    return cleaned || fallback
}

function decodeSafe(value: string): string {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

const SMOOTH_DEFAULTS = Object.freeze({
    stepSizePx: 120,
    animationTimeMs: 360,
    accelerationDeltaMs: 70,
    accelerationMax: 7,
    tailToHeadRatio: 3,
    easing: true,
    reverseWheelDirection: false,
})

export const ReaderView = ({ bookId, onBack, jumpTarget }: ReaderViewProps) => {
    const tocListRef = useRef<HTMLDivElement>(null)
    const providerRef = useRef<ContentProvider | null>(null)
    const progressWriteTimerRef = useRef<number | null>(null)
    const preloadedSectionsRef = useRef<Set<string>>(new Set())
    const currentProgressRef = useRef(0)

    const [isReady, setIsReady] = useState(false)
    const [bookTitleText, setBookTitleText] = useState('Reading')
    const [leftPanelOpen, setLeftPanelOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<'toc' | 'search' | 'annotations'>('toc')

    const [toc, setToc] = useState<TocItem[]>([])
    const [currentSectionHref, setCurrentSectionHref] = useState<string>('')
    const [currentProgress, setCurrentProgress] = useState(0)
    const [clockText, setClockText] = useState('')

    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<SearchResult[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [systemFonts, setSystemFonts] = useState<string[]>([])
    const [loadingFonts, setLoadingFonts] = useState(false)
    const [bookFormat, setBookFormat] = useState<BookFormat>('epub')
    const [provider, setProvider] = useState<ContentProvider | null>(null)
    const [vitraScrollParams, setVitraScrollParams] = useState({ initialSpineIndex: 0, initialScrollOffset: 0 })
    const [paginatedParams, setPaginatedParams] = useState({ initialSpineIndex: 0, initialPage: 0 })
    const scrollReaderRef = useRef<ScrollReaderHandle>(null)
    const paginatedReaderRef = useRef<PaginatedReaderHandle>(null)

    // Annotations state
    const [highlights, setHighlights] = useState<Highlight[]>([])
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
    const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)

    // Temporary color states for picker (only text color needs delay)
    const [tempTextColor, setTempTextColor] = useState<string | null>(null)
    const [textPickerDirty, setTextPickerDirty] = useState(false)
    const [bgPickerDirty, setBgPickerDirty] = useState(false)
    const [tempBgColor, setTempBgColor] = useState<string | null>(null)

    const settings = useSettingsStore()
    const modeDecision = resolveReaderRenderMode(bookFormat, settings.pageTurnMode)
    const effectivePageTurnMode = modeDecision.effectiveMode
    const isScrollMode = effectivePageTurnMode === 'scrolled-continuous'
    const resolvedReaderFontFamily = buildFontFamilyWithFallback(settings.fontFamily)
    const readerColors = (() => {
        const fallbackByTheme: Record<string, { text: string; bg: string }> = {
            light: { text: '#1a1a1a', bg: '#ffffff' },
            dark: { text: '#e0e0e0', bg: '#16213e' },
            sepia: { text: '#5b4636', bg: '#f4ecd8' },
            green: { text: '#2d4a3e', bg: '#c7edcc' },
        }
        const base = fallbackByTheme[settings.themeId] || fallbackByTheme.light
        const candidateText = settings.customTextColor || base.text
        const candidateBg = settings.customBgColor || base.bg
        // Only apply contrast safety when using theme defaults, not user-chosen colors
        const safeText = settings.customTextColor
            ? candidateText
            : (contrastRatio(candidateText, candidateBg) < 3 ? (settings.themeId === 'dark' ? '#e0e0e0' : '#1a1a1a') : candidateText)
        return {
            textColor: safeText,
            bgColor: candidateBg,
        }
    })()
    const readerStyleConfig = {
        textColor: readerColors.textColor,
        bgColor: readerColors.bgColor,
        fontSize: settings.fontSize,
        fontFamily: resolvedReaderFontFamily,
        lineHeight: settings.lineHeight,
        paragraphSpacing: settings.paragraphSpacing,
        textIndentEm: settings.paragraphIndentEnabled ? 2 : 0,
        letterSpacing: settings.letterSpacing,
        textAlign: settings.textAlign,
        pageWidth: settings.pageWidth,
        isPdfDarkMode: bookFormat === 'pdf' && settings.themeId === 'dark',
    }

    const resetSmoothSettings = () => {
        settings.updateSetting('smoothStepSizePx', SMOOTH_DEFAULTS.stepSizePx)
        settings.updateSetting('smoothAnimationTimeMs', SMOOTH_DEFAULTS.animationTimeMs)
        settings.updateSetting('smoothAccelerationDeltaMs', SMOOTH_DEFAULTS.accelerationDeltaMs)
        settings.updateSetting('smoothAccelerationMax', SMOOTH_DEFAULTS.accelerationMax)
        settings.updateSetting('smoothTailToHeadRatio', SMOOTH_DEFAULTS.tailToHeadRatio)
        settings.updateSetting('smoothAnimationEasing', SMOOTH_DEFAULTS.easing)
        settings.updateSetting('smoothReverseWheelDirection', SMOOTH_DEFAULTS.reverseWheelDirection)
    }

    const normalizeHref = (href?: string) => {
        const raw = (href || '').split('#')[0].split('?')[0].trim()
        if (!raw) return ''
        return raw
            .replace(/\\/g, '/')
            .replace(/^\.\//, '')
            .replace(/\/{2,}/g, '/')
            .replace(/\/+$/, '')
            .toLowerCase()
    }

    const getHrefTail = (normalizedHref: string) => {
        const lastSlash = normalizedHref.lastIndexOf('/')
        return lastSlash >= 0 ? normalizedHref.slice(lastSlash + 1) : normalizedHref
    }

    const isTocItemActive = (itemHref: string) => {
        const normalizedItemHref = normalizeHref(itemHref)
        const normalizedCurrentHref = normalizeHref(currentSectionHref)
        if (!normalizedItemHref || !normalizedCurrentHref) return false
        if (normalizedCurrentHref === normalizedItemHref) return true

        const itemTail = getHrefTail(normalizedItemHref)
        const currentTail = getHrefTail(normalizedCurrentHref)
        if (!itemTail || !currentTail) return false
        return itemTail === currentTail
    }

    const findCurrentChapterLabel = (items: TocItem[]): string => {
        for (const item of items) {
            if (isTocItemActive(item.href)) return item.label
            if (item.subitems && item.subitems.length > 0) {
                const nested = findCurrentChapterLabel(item.subitems)
                if (nested) return nested
            }
        }
        return ''
    }

    useEffect(() => {
        currentProgressRef.current = currentProgress
    }, [currentProgress])

    // Load system fonts on mount
    useEffect(() => {
        const loadFonts = async () => {
            if (!window.electronAPI?.listSystemFonts) return
            setLoadingFonts(true)
            try {
                const fonts = await window.electronAPI.listSystemFonts()
                if (!fonts || fonts.length === 0) {
                    setSystemFonts(['系统默认', '微软雅黑', '宋体', '楷体', '黑体', '仿宋'])
                } else {
                    setSystemFonts(['系统默认', ...fonts])
                }
            } catch (error) {
                console.error('Failed to load system fonts:', error)
                setSystemFonts(['系统默认', '微软雅黑', '宋体', '楷体'])
            } finally {
                setLoadingFonts(false)
            }
        }
        loadFonts()
    }, [])

    // Load Book
    useEffect(() => {
        let mounted = true

        const loadBook = async () => {
            // Reset state so stale UI doesn't render with a destroyed book
            setIsReady(false)
            setProvider(null)

            const bookMeta = await db.books.get(bookId)
            if (bookMeta?.title) {
                setBookTitleText(bookMeta.title)
            } else {
                setBookTitleText('Reading')
            }

            // 1. Fetch book data
            const file = await db.bookFiles.get(bookId)
            if (!file || !mounted) return

            // Load saved progress
            const progress = await db.progress.get(bookId)
            const initialCfi = progress?.location || undefined
            const initialProgress = Number(progress?.percentage || 0)
            setCurrentProgress(initialProgress)
            currentProgressRef.current = initialProgress

            // 2. Initialize VitraPipeline → VitraContentAdapter
            const bookData = file.data instanceof ArrayBuffer ? file.data.slice(0) : file.data
            const format = (bookMeta?.format || 'epub') as BookFormat
            setBookFormat(format)
            let cp: ContentProvider
            try {
                const pipeline = new VitraPipeline()
                const handle = await pipeline.open({
                    buffer: bookData as ArrayBuffer,
                    filename: `${bookMeta?.title || bookId}.${format}`,
                })
                const vitraBook = await handle.ready
                if (!mounted) { vitraBook.destroy(); return }
                cp = new VitraContentAdapter(vitraBook, bookId, bookData as ArrayBuffer)
                await cp.init()
            } catch (err) {
                if (!mounted) return
                console.error('[ReaderView] Vitra pipeline init failed:', err)
                return
            }
            if (!mounted) { cp.destroy(); return }
            providerRef.current = cp
            setProvider(cp)

            // Load TOC
            const providerToc = cp.getToc()
            if (providerToc.length > 0) {
                setToc(providerToc)
            } else {
                setToc(buildFallbackTocFromSpine(cp.getSpineItems()))
            }

            // 3. Parse initial position from saved progress (vitra:{spineIndex}:{pageOrOffset})
            //    兼容旧格式 bdise: 前缀
            let sIndex = 0
            let sOffset = 0

            if (initialCfi && (initialCfi.startsWith('vitra:') || initialCfi.startsWith('bdise:'))) {
                const parts = initialCfi.split(':')
                sIndex = parseInt(parts[1], 10) || 0
                sOffset = parseInt(parts[2], 10) || 0
            } else if (initialCfi) {
                // Try to resolve standard CFI to spine index
                const idx = cp.getSpineIndexByHref(initialCfi)
                if (idx >= 0) sIndex = idx
            }

            // 4. Set params based on mode
            const effectiveMode = resolveReaderRenderMode(format, settings.pageTurnMode).effectiveMode
            if (effectiveMode === 'scrolled-continuous') {
                setVitraScrollParams({ initialSpineIndex: sIndex, initialScrollOffset: sOffset })
            } else {
                // Paginated modes use PaginatedReaderView
                setPaginatedParams({ initialSpineIndex: sIndex, initialPage: sOffset })
            }

            if (mounted) setIsReady(true)
        }

        loadBook()

        return () => {
            mounted = false
            preloadedSectionsRef.current.clear()
            if (progressWriteTimerRef.current) {
                window.clearTimeout(progressWriteTimerRef.current)
                progressWriteTimerRef.current = null
            }
            if (providerRef.current) {
                providerRef.current.destroy()
                providerRef.current = null
            }
        }
    }, [bookId, settings.pageTurnMode])

    useEffect(() => {
        const formatClock = () => {
            const now = new Date()
            const hh = String(now.getHours()).padStart(2, '0')
            const mm = String(now.getMinutes()).padStart(2, '0')
            setClockText(`${hh}:${mm}`)
        }
        formatClock()
        const timer = window.setInterval(formatClock, 30000)
        return () => {
            window.clearInterval(timer)
        }
    }, [])

    // Load highlights and bookmarks when panel opens
    useEffect(() => {
        if (!leftPanelOpen || activeTab !== 'annotations') return
        const loadAnnotations = async () => {
            const [hl, bm] = await Promise.all([
                db.highlights.where('bookId').equals(bookId).toArray(),
                db.bookmarks.where('bookId').equals(bookId).toArray(),
            ])
            setHighlights(hl.sort((a, b) => b.createdAt - a.createdAt))
            setBookmarks(bm.sort((a, b) => b.createdAt - a.createdAt))
        }
        loadAnnotations()
    }, [leftPanelOpen, activeTab, bookId])

    // Jump to annotation location
    const jumpToAnnotation = async (location: string, searchText?: string) => {
        let spineIndex: number | null = null

        if (location.startsWith('vitra:') || location.startsWith('bdise:')) {
            spineIndex = parseInt(location.split(':')[1], 10)
        } else if (location.startsWith('epubcfi(')) {
            // epubcfi(/6/6!/4/4/28,...) — second number /6 = spine position, (pos/2 - 1) = spineIndex
            const match = location.match(/^epubcfi\(\/(\d+)\/(\d+)/)
            if (match) {
                spineIndex = Math.max(0, Math.floor(parseInt(match[2], 10) / 2) - 1)
            }
        }

        if (spineIndex === null || isNaN(spineIndex)) return

        if (isScrollMode) {
            await scrollReaderRef.current?.jumpToSpine(spineIndex, searchText)
        } else {
            await paginatedReaderRef.current?.jumpToSpine(spineIndex, searchText)
        }
        if (window.innerWidth < 768) setLeftPanelOpen(false)
    }

    // Jump to target from library page
    const jumpTargetDone = useRef(false)
    useEffect(() => {
        if (!jumpTarget || !isReady || jumpTargetDone.current) return
        jumpTargetDone.current = true
        // Small delay to ensure reader sub-component is mounted
        const timer = setTimeout(() => {
            jumpToAnnotation(jumpTarget.location, jumpTarget.searchText)
        }, 500)
        return () => clearTimeout(timer)
    }, [isReady, jumpTarget])

    // Delete highlight
    const deleteHighlight = async (id: string) => {
        await db.highlights.delete(id)
        setHighlights(prev => prev.filter(h => h.id !== id))
    }

    // Delete bookmark/note
    const deleteBookmark = async (id: string) => {
        await db.bookmarks.delete(id)
        setBookmarks(prev => prev.filter(b => b.id !== id))
    }

    const handleTocClick = async (href: string) => {
        setCurrentSectionHref(normalizeHref(href))
        if (providerRef.current) {
            const spineIndex = providerRef.current.getSpineIndexByHref(href)
            if (spineIndex >= 0) {
                if (isScrollMode) {
                    await scrollReaderRef.current?.jumpToSpine(spineIndex)
                } else {
                    await paginatedReaderRef.current?.jumpToSpine(spineIndex)
                }
            }
        }
        if (window.innerWidth < 768) setLeftPanelOpen(false)
    }

    const handleSearchWithKeyword = async (keyword: string) => {
        if (!keyword.trim() || !providerRef.current) return
        setIsSearching(true)
        setSearchResults([])
        try {
            const results = await providerRef.current.search(keyword)
            setSearchResults(results)
        } catch (e) {
            console.error('Search failed', e)
        } finally {
            setIsSearching(false)
        }
    }

    const handleSearch = async () => {
        await handleSearchWithKeyword(searchQuery)
    }

    const toggleLeftPanel = () => {
        setLeftPanelOpen((prev) => {
            const next = !prev
            if (next) setSettingsOpen(false)
            return next
        })
    }
    const toggleSettingsPanel = () => {
        setSettingsOpen((prev) => {
            const next = !prev
            if (next) setLeftPanelOpen(false)
            return next
        })
    }

    const closePanels = () => {
        setLeftPanelOpen(false)
        setSettingsOpen(false)
    }

    const handleFontChange = (fontName: string) => {
        if (fontName === '系统默认') {
            settings.updateSetting('fontFamily', 'inherit')
            return
        }

        // Map Chinese display names back to CSS font names
        const fontCSSMap: Record<string, string> = {
            '微软雅黑': 'Microsoft YaHei',
            '微软雅黑 UI': 'Microsoft YaHei UI',
            '宋体': 'SimSun',
            '黑体': 'SimHei',
            '楷体': 'KaiTi',
            '仿宋': 'FangSong',
            '新宋体': 'NSimSun',
            '微软正黑体': 'Microsoft JhengHei',
            '微软正黑体 UI': 'Microsoft JhengHei UI',
            '等线': 'DengXian',
            '仿宋_GB2312': 'FangSong_GB2312',
            '楷体_GB2312': 'KaiTi_GB2312',
        }

        const cssName = fontCSSMap[fontName] || fontName
        settings.updateSetting('fontFamily', `"${cssName}", sans-serif`)
    }

    // Get current font name for select value
    const getCurrentFontName = (): string => {
        if (settings.fontFamily === 'inherit') return '系统默认'

        // Extract font name from "FontName", sans-serif format
        const match = settings.fontFamily.match(/^"?([^",]+)"?/)
        if (!match) return '系统默认'

        const cssName = match[1].trim()

        // Map CSS names back to Chinese display names
        const displayNameMap: Record<string, string> = {
            'Microsoft YaHei': '微软雅黑',
            'Microsoft YaHei UI': '微软雅黑 UI',
            'SimSun': '宋体',
            'SimHei': '黑体',
            'KaiTi': '楷体',
            'FangSong': '仿宋',
            'NSimSun': '新宋体',
            'Microsoft JhengHei': '微软正黑体',
            'Microsoft JhengHei UI': '微软正黑体 UI',
            'DengXian': '等线',
            'FangSong_GB2312': '仿宋_GB2312',
            'KaiTi_GB2312': '楷体_GB2312',
        }

        return displayNameMap[cssName] || cssName
    }

    const renderTocItems = (items: TocItem[], level = 0): JSX.Element[] => {
        return items.flatMap((item, index) => {
            const key = `${level}-${index}-${item.href}`
            const active = isTocItemActive(item.href)
            const children = item.subitems ? renderTocItems(item.subitems, level + 1) : []
            return [
                <button
                    key={key}
                    className={`${styles.tocItem} ${active ? styles.tocItemActive : ''}`}
                    data-toc-active={active ? 'true' : 'false'}
                    onClick={() => handleTocClick(item.href)}
                    style={{ paddingLeft: `${12 + level * 14}px` }}
                >
                    <span className={styles.tocLabel} title={item.label}>{item.label}</span>
                </button>,
                ...children,
            ]
        })
    }

    const renderSearchExcerpt = (excerpt: string) => {
        const query = searchQuery.trim()
        if (!query) return excerpt
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(`(${escaped})`, 'ig')
        const parts = excerpt.split(regex)
        return parts.map((part, index) => {
            if (part.toLowerCase() === query.toLowerCase()) {
                return <mark key={`${part}-${index}`} className={styles.searchMark}>{part}</mark>
            }
            return <span key={`${part}-${index}`}>{part}</span>
        })
    }

    useEffect(() => {
        if (!leftPanelOpen || activeTab !== 'toc') return
        const timer = window.setTimeout(() => {
            const container = tocListRef.current
            if (!container) return
            const activeItem = container.querySelector('button[data-toc-active="true"]') as HTMLButtonElement | null
            if (!activeItem) return
            const containerRect = container.getBoundingClientRect()
            const itemRect = activeItem.getBoundingClientRect()
            const targetTop =
                container.scrollTop +
                (itemRect.top - containerRect.top) -
                containerRect.height / 2 +
                itemRect.height / 2
            container.scrollTo({
                top: Math.max(0, targetTop),
                behavior: 'auto',
            })
        }, 120)
        return () => {
            window.clearTimeout(timer)
        }
    }, [leftPanelOpen, activeTab, currentSectionHref, toc.length])

    const currentChapterLabel = findCurrentChapterLabel(toc)
    const headerHeight = Math.max(36, Math.min(96, Number(settings.headerHeight) || 48))
    const footerHeight = Math.max(0, Math.min(96, Number(settings.footerHeight) || 32))
    const footerEnabled = footerHeight > 0
    const progressLabel = `${Math.round(Math.max(0, Math.min(1, currentProgress)) * 100)}%`

    return (
        <div
            className={styles.readerContainer}
            style={{
                background: readerColors.bgColor,
                color: readerColors.textColor,
                ['--reader-bg-color']: readerColors.bgColor,
                ['--reader-text-color']: readerColors.textColor,
                ['--reader-font-family']: resolvedReaderFontFamily,
                ['--reader-font-size']: `${settings.fontSize}px`,
                ['--reader-line-height']: String(settings.lineHeight),
                ['--reader-letter-spacing']: `${settings.letterSpacing}px`,
                ['--reader-paragraph-spacing']: `${settings.paragraphSpacing}px`,
                ['--reader-text-align']: settings.textAlign,
            }}
        >
            {/* Top Toolbar */}
            <motion.div
                className={styles.toolbar}
                style={{ height: `${headerHeight}px` }}
                initial={{ y: -50 }}
                animate={{ y: 0 }}
            >
                <button className={styles.iconBtn} onClick={onBack}>← Back</button>
                <div className={styles.centerInfo}>
                    <span className={styles.bookTitle}>{bookTitleText}</span>
                </div>
                <div className={styles.actions}>
                    <button
                        className={`${styles.iconBtn} ${leftPanelOpen ? styles.active : ''}`}
                        onClick={toggleLeftPanel}
                    >
                        ≡ 目录/搜索
                    </button>
                    <button
                        className={`${styles.iconBtn} ${settingsOpen ? styles.active : ''}`}
                        onClick={toggleSettingsPanel}
                    >
                        ⚙ 设置
                    </button>
                </div>
            </motion.div>

            {/* Main Content Area */}
            <div className={styles.contentArea} style={{ paddingTop: `${headerHeight}px`, paddingBottom: `${footerEnabled ? footerHeight : 0}px` }}>
                {(leftPanelOpen || settingsOpen) && (
                    <div className={styles.panelBackdrop} onClick={closePanels} />
                )}
                {/* Left Toggle Panel (TOC + Search) */}
                <AnimatePresence>
                    {leftPanelOpen && (
                        <motion.div
                            className={styles.panelLeft}
                            initial={{ x: -300, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -300, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        >
                            <div className={styles.tabContainer}>
                                <button
                                    className={`${styles.tabBtn} ${activeTab === 'toc' ? styles.activeTab : ''}`}
                                    onClick={() => setActiveTab('toc')}
                                >
                                    目录
                                </button>
                                <button
                                    className={`${styles.tabBtn} ${activeTab === 'search' ? styles.activeTab : ''}`}
                                    onClick={() => setActiveTab('search')}
                                >
                                    搜索
                                </button>
                                <button
                                    className={`${styles.tabBtn} ${activeTab === 'annotations' ? styles.activeTab : ''}`}
                                    onClick={() => setActiveTab('annotations')}
                                >
                                    标注
                                </button>
                            </div>

                            {activeTab === 'toc' && (
                                <div ref={tocListRef} className={styles.tocList}>
                                    {toc.length === 0 ? <p className={styles.emptyText}>无目录信息</p> :
                                        renderTocItems(toc)
                                    }
                                </div>
                            )}

                            {activeTab === 'search' && (
                                <div className={styles.searchContainer}>
                                    <div className={styles.searchBox}>
                                        <input
                                            type="text"
                                            placeholder="输入关键词..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                        />
                                        <button onClick={handleSearch} disabled={isSearching}>
                                            {isSearching ? '...' : 'Go'}
                                        </button>
                                    </div>
                                    <div className={styles.resultList}>
                                        {searchResults.map((res, i) => (
                                            <div
                                                key={i}
                                                className={styles.resultItem}
                                                onClick={() => jumpToAnnotation(res.cfi, searchQuery.trim() || undefined)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault()
                                                        void jumpToAnnotation(res.cfi, searchQuery.trim() || undefined)
                                                    }
                                                }}
                                            >
                                                <p className={styles.excerpt}>...{renderSearchExcerpt(res.excerpt)}...</p>
                                            </div>
                                        ))}
                                        {!isSearching && searchResults.length === 0 && searchQuery && (
                                            <p className={styles.emptyText}>未找到结果</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'annotations' && (
                                <div className={styles.annotationsContainer}>
                                    {/* Highlights Section */}
                                    <div className={styles.annotationSection}>
                                        <h4 className={styles.annotationSectionTitle}>高亮 ({highlights.length})</h4>
                                        {highlights.length === 0 ? (
                                            <p className={styles.emptyText}>暂无高亮</p>
                                        ) : (
                                            <div className={styles.annotationList}>
                                                {highlights.map(h => (
                                                    <div
                                                        key={h.id}
                                                        className={styles.annotationItem}
                                                        onClick={() => jumpToAnnotation(h.cfiRange, h.text)}
                                                    >
                                                        <div
                                                            className={styles.highlightColor}
                                                            style={{ background: h.color }}
                                                        />
                                                        <div className={styles.annotationContent}>
                                                            <p className={styles.annotationText}>{h.text}</p>
                                                            <span className={styles.annotationTime}>
                                                                {new Date(h.createdAt).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                        <button
                                                            className={styles.deleteBtn}
                                                            onClick={(e) => { e.stopPropagation(); deleteHighlight(h.id); }}
                                                            title="删除"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Notes Section */}
                                    <div className={styles.annotationSection}>
                                        <h4 className={styles.annotationSectionTitle}>笔记 ({bookmarks.length})</h4>
                                        {bookmarks.length === 0 ? (
                                            <p className={styles.emptyText}>暂无笔记</p>
                                        ) : (
                                            <div className={styles.annotationList}>
                                                {bookmarks.map(b => (
                                                    <div
                                                        key={b.id}
                                                        className={styles.annotationItem}
                                                        onClick={() => jumpToAnnotation(b.location, b.title)}
                                                    >
                                                        <div className={styles.noteIcon}>📝</div>
                                                        <div className={styles.annotationContent}>
                                                            <p className={styles.annotationQuote}>"{b.title}"</p>
                                                            {b.note && (
                                                                <p
                                                                    className={`${styles.noteText} ${expandedNoteId === b.id ? styles.expanded : ''}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setExpandedNoteId(expandedNoteId === b.id ? null : b.id);
                                                                    }}
                                                                >
                                                                    {b.note}
                                                                </p>
                                                            )}
                                                            <span className={styles.annotationTime}>
                                                                {new Date(b.createdAt).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                        <button
                                                            className={styles.deleteBtn}
                                                            onClick={(e) => { e.stopPropagation(); deleteBookmark(b.id); }}
                                                            title="删除"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Center Reader */}
                <div className={styles.readerWrapper}>
                    {!isReady && (
                        <div className={styles.blockingLoadingOverlay}>
                            <div className={styles.loading}>Loading...</div>
                        </div>
                    )}

                    {/* Scroll Mode */}
                    {isScrollMode && provider && isReady && (
                        <ScrollReaderView
                            ref={scrollReaderRef}
                            provider={provider}
                            bookId={bookId}
                            initialSpineIndex={vitraScrollParams.initialSpineIndex}
                            initialScrollOffset={vitraScrollParams.initialScrollOffset}
                            smoothConfig={{
                                enabled: settings.smoothScrollEnabled,
                                stepSizePx: settings.smoothStepSizePx,
                                animationTimeMs: settings.smoothAnimationTimeMs,
                                accelerationDeltaMs: settings.smoothAccelerationDeltaMs,
                                accelerationMax: settings.smoothAccelerationMax,
                                tailToHeadRatio: settings.smoothTailToHeadRatio,
                                easing: settings.smoothAnimationEasing,
                                reverseWheelDirection: settings.smoothReverseWheelDirection,
                            }}
                            readerStyles={readerStyleConfig}
                            onProgressChange={(p) => {
                                setCurrentProgress(p)
                                currentProgressRef.current = p
                            }}
                            onChapterChange={(_label, href) => {
                                setCurrentSectionHref(normalizeHref(href))
                            }}
                            onSelectionSearch={(keyword) => {
                                setSearchQuery(keyword)
                                setActiveTab('search')
                                setLeftPanelOpen(true)
                                setSettingsOpen(false)
                                handleSearchWithKeyword(keyword)
                            }}
                        />
                    )}

                    {/* Paginated Mode (single or double) */}
                    {!isScrollMode && provider && isReady && (
                        <PaginatedReaderView
                            ref={paginatedReaderRef}
                            provider={provider}
                            bookId={bookId}
                            initialSpineIndex={paginatedParams.initialSpineIndex}
                            initialPage={paginatedParams.initialPage}
                            pageTurnMode={(effectivePageTurnMode === 'paginated-double' ? 'paginated-double' : 'paginated-single')}
                            readerStyles={readerStyleConfig}
                            onProgressChange={(p) => {
                                setCurrentProgress(p)
                                currentProgressRef.current = p
                            }}
                            onChapterChange={(_label, href) => {
                                setCurrentSectionHref(normalizeHref(href))
                            }}
                            onSelectionSearch={(keyword) => {
                                setSearchQuery(keyword)
                                setActiveTab('search')
                                setLeftPanelOpen(true)
                                setSettingsOpen(false)
                                handleSearchWithKeyword(keyword)
                            }}
                        />
                    )}
                </div>

                {footerEnabled && (
                    <div
                        className={styles.footerBar}
                        style={{
                            height: `${footerHeight}px`,
                            background: readerColors.bgColor,
                            color: readerColors.textColor,
                            borderTop: `1px solid ${settings.themeId === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
                        }}
                    >
                        <div className={styles.footerMeta}>
                            {settings.showFooterProgress && <span>{`进度 ${progressLabel}`}</span>}
                            {settings.showFooterChapter && <span>{currentChapterLabel || '章节加载中'}</span>}
                            {settings.showFooterTime && <span>{clockText}</span>}
                        </div>
                    </div>
                )}

                {/* Right Settings Panel */}
                <AnimatePresence>
                    {settingsOpen && (
                        <motion.div
                            className={styles.panelRight}
                            initial={{ x: 300, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 300, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        >
                            <div className={styles.scrollContent}> {/* Added wrapper for scroll if needed */}
                                <div className={styles.settingsHeader}>
                                    <h3>外观设置</h3>
                                    <button className={styles.resetBtn} onClick={settings.resetToDefaults}>重置</button>
                                </div>

                                <div className={styles.settingsGroup}>
                                    <label>主题模式</label>
                                    <div className={styles.themeGrid}>
                                        {['light', 'dark', 'sepia', 'green'].map(id => (
                                            <button
                                                key={id}
                                                className={`${styles.themeBtn} ${settings.themeId === id ? styles.activeTheme : ''}`}
                                                onClick={() => settings.updateSetting('themeId', id)}
                                                data-theme-preview={id}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className={styles.divider} />

                                <div className={styles.settingsGroup}>
                                    <label>文字颜色</label>
                                    <div className={styles.colorPalette}>
                                        <label className={styles.colorPickerCircle} style={tempTextColor ? { borderColor: tempTextColor } : undefined} title="自定义颜色">
                                            <input
                                                type="color"
                                                value={tempTextColor ?? settings.customTextColor ?? (settings.themeId === 'dark' ? '#e0e0e0' : '#1a1a1a')}
                                                onInput={(e) => {
                                                    setTempTextColor((e.target as HTMLInputElement).value)
                                                    setTextPickerDirty(true)
                                                }}
                                                onChange={() => {}}
                                            />
                                            {textPickerDirty ? (
                                                <span className={styles.pickerPreview} style={{ background: tempTextColor! }} />
                                            ) : (
                                                <span>+</span>
                                            )}
                                        </label>
                                        {textPickerDirty && (
                                            <button
                                                className={styles.confirmBtn}
                                                title="确认颜色"
                                                onClick={() => {
                                                    if (tempTextColor) {
                                                        settings.updateSetting('customTextColor', tempTextColor)
                                                        settings.addSavedColor('text', tempTextColor)
                                                    }
                                                    setTextPickerDirty(false)
                                                }}
                                            >✓</button>
                                        )}
                                        {textPickerDirty && (
                                            <button
                                                className={styles.cancelBtn}
                                                title="取消"
                                                onClick={() => {
                                                    setTempTextColor(settings.customTextColor)
                                                    setTextPickerDirty(false)
                                                }}
                                            >✕</button>
                                        )}
                                        <button
                                            className={`${styles.colorCircle} ${!settings.customTextColor ? styles.colorCircleActive : ''}`}
                                            title="默认"
                                            onClick={() => { settings.updateSetting('customTextColor', null); setTempTextColor(null); setTextPickerDirty(false) }}
                                        >
                                            <span className={styles.circleInner} style={{ background: settings.themeId === 'dark' ? '#e0e0e0' : '#1a1a1a' }} />
                                            {!settings.customTextColor && <span className={styles.checkMark}>✓</span>}
                                        </button>
                                        {settings.savedTextColors.map((c) => (
                                            <button
                                                key={c}
                                                className={`${styles.colorCircle} ${settings.customTextColor?.toLowerCase() === c.toLowerCase() ? styles.colorCircleActive : ''}`}
                                                title={c}
                                                onClick={() => { setTempTextColor(c); settings.updateSetting('customTextColor', c); setTextPickerDirty(false) }}
                                            >
                                                <span className={styles.circleInner} style={{ background: c }} />
                                                {settings.customTextColor?.toLowerCase() === c.toLowerCase() && <span className={styles.checkMark}>✓</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className={styles.settingsGroup}>
                                    <label>背景颜色</label>
                                    <div className={styles.colorPalette}>
                                        <label className={styles.colorPickerCircle} style={tempBgColor ? { borderColor: tempBgColor } : undefined} title="自定义颜色">
                                            <input
                                                type="color"
                                                value={tempBgColor ?? settings.customBgColor ?? '#ffffff'}
                                                onInput={(e) => {
                                                    setTempBgColor((e.target as HTMLInputElement).value)
                                                    setBgPickerDirty(true)
                                                }}
                                                onChange={() => {}}
                                            />
                                            {bgPickerDirty ? (
                                                <span className={styles.pickerPreview} style={{ background: tempBgColor! }} />
                                            ) : (
                                                <span>+</span>
                                            )}
                                        </label>
                                        {bgPickerDirty && (
                                            <button
                                                className={styles.confirmBtn}
                                                title="确认颜色"
                                                onClick={() => {
                                                    if (tempBgColor) {
                                                        settings.updateSetting('customBgColor', tempBgColor)
                                                        settings.addSavedColor('bg', tempBgColor)
                                                    }
                                                    setBgPickerDirty(false)
                                                }}
                                            >✓</button>
                                        )}
                                        {bgPickerDirty && (
                                            <button
                                                className={styles.cancelBtn}
                                                title="取消"
                                                onClick={() => {
                                                    setTempBgColor(settings.customBgColor)
                                                    setBgPickerDirty(false)
                                                }}
                                            >✕</button>
                                        )}
                                        <button
                                            className={`${styles.colorCircle} ${!settings.customBgColor ? styles.colorCircleActive : ''}`}
                                            title="默认"
                                            onClick={() => { settings.updateSetting('customBgColor', null); setTempBgColor(null); setBgPickerDirty(false) }}
                                        >
                                            <span className={styles.circleInner} style={{ background: '#ffffff' }} />
                                            {!settings.customBgColor && <span className={styles.checkMark}>✓</span>}
                                        </button>
                                        {settings.savedBgColors.map((c) => (
                                            <button
                                                key={c}
                                                className={`${styles.colorCircle} ${settings.customBgColor?.toLowerCase() === c.toLowerCase() ? styles.colorCircleActive : ''}`}
                                                title={c}
                                                onClick={() => { settings.updateSetting('customBgColor', c); setTempBgColor(null); setBgPickerDirty(false) }}
                                            >
                                                <span className={styles.circleInner} style={{ background: c }} />
                                                {settings.customBgColor?.toLowerCase() === c.toLowerCase() && <span className={styles.checkMark}>✓</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className={styles.settingsGroup}>
                                    <label>字体风格</label>
                                    {loadingFonts ? (
                                        <div className={styles.fontLoading}>加载字体列表中...</div>
                                    ) : (
                                        <select
                                            className={styles.fontSelect}
                                            value={getCurrentFontName()}
                                            onChange={(e) => handleFontChange(e.target.value)}
                                        >
                                            {systemFonts.map((fontName) => (
                                                <option
                                                    key={fontName}
                                                    value={fontName}
                                                    style={{ fontFamily: fontName === '系统默认' ? 'inherit' : fontName }}
                                                >
                                                    {fontName}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                <div className={styles.settingsGroup}>
                                    <label>字号: {settings.fontSize}px</label>
                                    <input
                                        type="range" min="12" max="36" step="1"
                                        value={settings.fontSize}
                                        onChange={(e) => settings.updateSetting('fontSize', Number(e.target.value))}
                                    />
                                </div>
                                <div className={styles.settingsGroup}>
                                    <label>行距: {settings.lineHeight.toFixed(1)}</label>
                                    <input
                                        type="range" min="1" max="3.5" step="0.1"
                                        value={settings.lineHeight}
                                        onChange={(e) => settings.updateSetting('lineHeight', Number(e.target.value))}
                                    />
                                </div>
                                <div className={styles.settingsGroup}>
                                    <label>字间距: {settings.letterSpacing}</label>
                                    <input
                                        type="range" min="0" max="20" step="1"
                                        value={settings.letterSpacing}
                                        onChange={(e) => settings.updateSetting('letterSpacing', Number(e.target.value))}
                                    />
                                </div>
                                <div className={styles.settingsGroup}>
                                    <label>段间距: {settings.paragraphSpacing}</label>
                                    <input
                                        type="range" min="0" max="120" step="1"
                                        value={settings.paragraphSpacing}
                                        onChange={(e) => settings.updateSetting('paragraphSpacing', Number(e.target.value))}
                                    />
                                </div>
                                <div className={styles.settingsGroup}>
                                    <label>正文首行缩进</label>
                                    <div className={styles.toggleRow}>
                                        <button
                                            className={`${styles.toggleBtn} ${!settings.paragraphIndentEnabled ? styles.active : ''}`}
                                            onClick={() => settings.updateSetting('paragraphIndentEnabled', false)}
                                        >
                                            关闭
                                        </button>
                                        <button
                                            className={`${styles.toggleBtn} ${settings.paragraphIndentEnabled ? styles.active : ''}`}
                                            onClick={() => settings.updateSetting('paragraphIndentEnabled', true)}
                                        >
                                            开启
                                        </button>
                                    </div>
                                </div>
                                <div className={styles.settingsGroup}>
                                    <label>页面宽度: {settings.pageWidth.toFixed(1)}</label>
                                    <input
                                        type="range" min="0.5" max="3" step="0.1"
                                        value={settings.pageWidth}
                                        onChange={(e) => settings.updateSetting('pageWidth', Number(e.target.value))}
                                    />
                                </div>
                                <div className={styles.settingsGroup}>
                                    <label>屏幕亮度: {settings.brightness.toFixed(2)}</label>
                                    <input
                                        type="range" min="0.3" max="1" step="0.05"
                                        value={settings.brightness}
                                        onChange={(e) => settings.updateSetting('brightness', Number(e.target.value))}
                                    />
                                </div>
                                <div className={styles.settingsGroup}>
                                    <label>页眉高度: {headerHeight}px</label>
                                    <input
                                        type="range" min="36" max="96" step="2"
                                        value={headerHeight}
                                        onChange={(e) => settings.updateSetting('headerHeight', Number(e.target.value))}
                                    />
                                </div>
                                <div className={styles.settingsGroup}>
                                    <label>页脚高度: {footerHeight}px</label>
                                    <input
                                        type="range" min="0" max="96" step="2"
                                        value={footerHeight}
                                        onChange={(e) => settings.updateSetting('footerHeight', Number(e.target.value))}
                                    />
                                </div>
                                <div className={styles.settingsGroup}>
                                    <label>页脚信息</label>
                                    <div className={styles.toggleRow}>
                                        <button
                                            className={`${styles.toggleBtn} ${settings.showFooterProgress ? styles.active : ''}`}
                                            onClick={() => settings.updateSetting('showFooterProgress', !settings.showFooterProgress)}
                                        >
                                            进度
                                        </button>
                                        <button
                                            className={`${styles.toggleBtn} ${settings.showFooterChapter ? styles.active : ''}`}
                                            onClick={() => settings.updateSetting('showFooterChapter', !settings.showFooterChapter)}
                                        >
                                            章节
                                        </button>
                                        <button
                                            className={`${styles.toggleBtn} ${settings.showFooterTime ? styles.active : ''}`}
                                            onClick={() => settings.updateSetting('showFooterTime', !settings.showFooterTime)}
                                        >
                                            时间
                                        </button>
                                    </div>
                                </div>
                                <div className={styles.settingsGroup}>
                                    <label>文字对齐</label>
                                    <select
                                        className={styles.fontSelect}
                                        value={settings.textAlign}
                                        onChange={(e) => settings.updateSetting('textAlign', e.target.value as typeof settings.textAlign)}
                                    >
                                        <option value="left">左对齐</option>
                                        <option value="justify">两端对齐</option>
                                        <option value="center">居中</option>
                                    </select>
                                </div>

                                <div className={styles.settingsGroup}>
                                    <label>翻页模式</label>
                                    <div className={styles.toggleRow}>
                                        <button
                                            className={`${styles.toggleBtn} ${effectivePageTurnMode === 'paginated-single' ? styles.active : ''}`}
                                            disabled={!modeDecision.availableModes.includes('paginated-single')}
                                            onClick={() => settings.updateSetting('pageTurnMode', 'paginated-single' as PageTurnMode)}
                                        >
                                            单页
                                        </button>
                                        <button
                                            className={`${styles.toggleBtn} ${effectivePageTurnMode === 'paginated-double' ? styles.active : ''}`}
                                            disabled={!modeDecision.availableModes.includes('paginated-double')}
                                            onClick={() => settings.updateSetting('pageTurnMode', 'paginated-double' as PageTurnMode)}
                                        >
                                            双页
                                        </button>
                                        <button
                                            className={`${styles.toggleBtn} ${effectivePageTurnMode === 'scrolled-continuous' ? styles.active : ''}`}
                                            disabled={!modeDecision.availableModes.includes('scrolled-continuous')}
                                            onClick={() => settings.updateSetting('pageTurnMode', 'scrolled-continuous' as PageTurnMode)}
                                        >
                                            连续滚动
                                        </button>
                                    </div>
                                    {modeDecision.forced && (
                                        <div className={styles.modeHint}>{modeDecision.reason}</div>
                                    )}
                                </div>

                                {effectivePageTurnMode === 'scrolled-continuous' && (
                                    <>
                                        <div className={styles.divider} />
                                        <div className={styles.settingsGroup}>
                                            <div className={styles.smoothHeader}>
                                                <span className={styles.smoothTitle}>平滑滚动</span>
                                                <label className={styles.smoothToggle}>
                                                    <input
                                                        type="checkbox"
                                                        checked={settings.smoothScrollEnabled}
                                                        onChange={(e) => settings.updateSetting('smoothScrollEnabled', e.target.checked)}
                                                    />
                                                    <span className={styles.smoothToggleTrack} />
                                                </label>
                                            </div>
                                        </div>
                                        <div className={styles.settingsGroup}>
                                            <label>步长: {settings.smoothStepSizePx}px</label>
                                            <input
                                                type="range" min="20" max="300" step="1"
                                                value={settings.smoothStepSizePx}
                                                disabled={!settings.smoothScrollEnabled}
                                                onChange={(e) => settings.updateSetting('smoothStepSizePx', clampInt(Number(e.target.value), 20, 300))}
                                            />
                                        </div>
                                        <div className={styles.settingsGroup}>
                                            <label>动画时长: {settings.smoothAnimationTimeMs}ms</label>
                                            <input
                                                type="range" min="120" max="1200" step="10"
                                                value={settings.smoothAnimationTimeMs}
                                                disabled={!settings.smoothScrollEnabled}
                                                onChange={(e) => settings.updateSetting('smoothAnimationTimeMs', clampInt(Number(e.target.value), 120, 1200))}
                                            />
                                        </div>
                                        <div className={styles.settingsGroup}>
                                            <label>加速间隔: {settings.smoothAccelerationDeltaMs}ms</label>
                                            <input
                                                type="range" min="10" max="400" step="5"
                                                value={settings.smoothAccelerationDeltaMs}
                                                disabled={!settings.smoothScrollEnabled}
                                                onChange={(e) => settings.updateSetting('smoothAccelerationDeltaMs', clampInt(Number(e.target.value), 10, 400))}
                                            />
                                        </div>
                                        <div className={styles.settingsGroup}>
                                            <label>加速上限: {settings.smoothAccelerationMax}x</label>
                                            <input
                                                type="range" min="1" max="12" step="0.1"
                                                value={settings.smoothAccelerationMax}
                                                disabled={!settings.smoothScrollEnabled}
                                                onChange={(e) => settings.updateSetting('smoothAccelerationMax', clampDecimal(Number(e.target.value), 1, 12, 1))}
                                            />
                                        </div>
                                        <div className={styles.settingsGroup}>
                                            <label>尾首比值: {settings.smoothTailToHeadRatio}x</label>
                                            <input
                                                type="range" min="1" max="8" step="0.1"
                                                value={settings.smoothTailToHeadRatio}
                                                disabled={!settings.smoothScrollEnabled}
                                                onChange={(e) => settings.updateSetting('smoothTailToHeadRatio', clampDecimal(Number(e.target.value), 1, 8, 1))}
                                            />
                                        </div>
                                        <div className={styles.smoothCheckList}>
                                            <label className={styles.smoothCheckItem}>
                                                <input
                                                    type="checkbox"
                                                    checked={settings.smoothAnimationEasing}
                                                    disabled={!settings.smoothScrollEnabled}
                                                    onChange={(e) => settings.updateSetting('smoothAnimationEasing', e.target.checked)}
                                                />
                                                缓动曲线
                                            </label>
                                            <label className={styles.smoothCheckItem}>
                                                <input
                                                    type="checkbox"
                                                    checked={settings.smoothReverseWheelDirection}
                                                    disabled={!settings.smoothScrollEnabled}
                                                    onChange={(e) => settings.updateSetting('smoothReverseWheelDirection', e.target.checked)}
                                                />
                                                反转滚轮方向
                                            </label>
                                        </div>
                                        <button
                                            className={styles.smallActionBtn}
                                            onClick={resetSmoothSettings}
                                            disabled={!settings.smoothScrollEnabled}
                                        >
                                            重置为推荐值
                                        </button>
                                    </>
                                )}

                                <div className={styles.divider} />

                                <div className={styles.settingsGroup}>
                                    <label>背景模糊: {settings.uiBlurStrength}px</label>
                                    <input
                                        type="range" min="0" max="40" step="1"
                                        value={settings.uiBlurStrength}
                                        onChange={(e) => settings.updateSetting('uiBlurStrength', Number(e.target.value))}
                                    />
                                </div>
                                <div className={styles.settingsGroup}>
                                    <label>面板透明: {Math.round(settings.uiOpacity * 100)}%</label>
                                    <input
                                        type="range" min="0.5" max="1" step="0.05"
                                        value={settings.uiOpacity}
                                        onChange={(e) => settings.updateSetting('uiOpacity', Number(e.target.value))}
                                    />
                                </div>

                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
