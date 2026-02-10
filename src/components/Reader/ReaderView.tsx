import { useEffect, useRef, useState } from 'react'
import ePub, { Book, Rendition } from 'epubjs'
import { motion, AnimatePresence } from 'framer-motion'
import { db } from '../../services/storageService'
import { useSettingsStore } from '../../stores/useSettingsStore'
import noteActionIcon from '../../assets/icons/reader-note.svg'
import highlightActionIcon from '../../assets/icons/reader-highlight.svg'
import copyActionIcon from '../../assets/icons/reader-copy.svg'
import searchActionIcon from '../../assets/icons/reader-search.svg'
import webSearchActionIcon from '../../assets/icons/reader-web-search.svg'
import speakActionIcon from '../../assets/icons/reader-speak.svg'
import translateActionIcon from '../../assets/icons/reader-translate.svg'
import styles from './ReaderView.module.css'

interface ReaderViewProps {
    bookId: string
    onBack: () => void
}

interface TocItem {
    id: string
    href: string
    label: string
    subitems?: TocItem[]
}

interface SearchResult {
    cfi: string
    excerpt: string
}

interface SelectionMenuState {
    visible: boolean
    x: number
    y: number
    text: string
    cfiRange: string
}

type HighlightPreset = {
    key: string
    color: string
}

const HIGHLIGHT_PRESETS: HighlightPreset[] = [
    { key: 'cream', color: 'rgba(255, 243, 205, 0.55)' },
    { key: 'mint', color: 'rgba(209, 250, 229, 0.55)' },
    { key: 'sky', color: 'rgba(219, 234, 254, 0.55)' },
]

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

export const ReaderView = ({ bookId, onBack }: ReaderViewProps) => {
    const viewerRef = useRef<HTMLDivElement>(null)
    const bookRef = useRef<Book | null>(null)
    const renditionRef = useRef<Rendition | null>(null)
    const progressWriteTimerRef = useRef<number | null>(null)
    const renderLockRef = useRef(false)
    const renderUnlockTimerRef = useRef<number | null>(null)
    const displayQueueRef = useRef<Promise<void>>(Promise.resolve())

    const [isReady, setIsReady] = useState(false)
    const [bookTitleText, setBookTitleText] = useState('Reading')
    const [leftPanelOpen, setLeftPanelOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<'toc' | 'search'>('toc')

    const [toc, setToc] = useState<TocItem[]>([])
    const [currentCfi, setCurrentCfi] = useState<string>('')
    const [currentSectionHref, setCurrentSectionHref] = useState<string>('')

    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<SearchResult[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [systemFonts, setSystemFonts] = useState<string[]>([])
    const [loadingFonts, setLoadingFonts] = useState(false)
    const [renderLocked, setRenderLocked] = useState(false)

    // Temporary color states for picker (only text color needs delay)
    const [tempTextColor, setTempTextColor] = useState<string | null>(null)

    const [selectionMenu, setSelectionMenu] = useState<SelectionMenuState>({ visible: false, x: 0, y: 0, text: '', cfiRange: '' })
    const [activeSearchHitCfi, setActiveSearchHitCfi] = useState<string | null>(null)

    const settings = useSettingsStore()

    const normalizeHref = (href?: string) => (href || '').split('#')[0].split('?')[0]
    const setRenderLock = (locked: boolean) => {
        renderLockRef.current = locked
        setRenderLocked(locked)
    }

    const queueDisplay = (target?: string) => {
        const run = async () => {
            const rendition = renditionRef.current
            if (!rendition) return
            setRenderLock(true)
            try {
                await rendition.display(target)
            } catch (error) {
                console.warn('Queue display failed:', error)
            } finally {
                if (renderUnlockTimerRef.current) {
                    window.clearTimeout(renderUnlockTimerRef.current)
                }
                renderUnlockTimerRef.current = window.setTimeout(() => {
                    setRenderLock(false)
                    renderUnlockTimerRef.current = null
                }, 80)
            }
        }
        displayQueueRef.current = displayQueueRef.current.then(run, run)
        return displayQueueRef.current
    }

    const isTocItemActive = (itemHref: string) => {
        const normalizedItemHref = normalizeHref(itemHref)
        if (!normalizedItemHref || !currentSectionHref) return false
        return currentSectionHref === normalizedItemHref || currentSectionHref.startsWith(normalizedItemHref)
    }

    const resolveReaderColors = () => {
        const fallbackByTheme: Record<string, { text: string; bg: string }> = {
            light: { text: '#1a1a1a', bg: '#ffffff' },
            dark: { text: '#e0e0e0', bg: '#16213e' },
            sepia: { text: '#5b4636', bg: '#f4ecd8' },
            green: { text: '#2d4a3e', bg: '#c7edcc' },
        }
        const base = fallbackByTheme[settings.themeId] || fallbackByTheme.light
        const candidateText = settings.customTextColor || base.text
        const candidateBg = settings.customBgColor || base.bg
        const ratio = contrastRatio(candidateText, candidateBg)
        const safeText = ratio < 3 ? (settings.themeId === 'dark' ? '#e0e0e0' : '#1a1a1a') : candidateText
        return {
            textColor: safeText,
            bgColor: candidateBg,
        }
    }

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

    const injectContentStyle = (contents: any, cssText: string) => {
        if (!contents) return
        try {
            if (typeof contents.addStylesheet === 'function') {
                const dataUrl = `data:text/css;charset=utf-8,${encodeURIComponent(cssText)}`
                contents.addStylesheet(dataUrl)
                return
            }
            const doc = contents.document as Document | undefined
            if (!doc?.head) return
            let styleEl = doc.getElementById('vitra-content-style') as HTMLStyleElement | null
            if (!styleEl) {
                styleEl = doc.createElement('style')
                styleEl.id = 'vitra-content-style'
                doc.head.appendChild(styleEl)
            }
            styleEl.textContent = cssText
        } catch (error) {
            console.warn('Inject content style failed:', error)
        }
    }

    // Load Book
    useEffect(() => {
        let mounted = true
        let keyDownHandler: ((e: KeyboardEvent) => void) | null = null
        let wheelGuardHandler: ((e: WheelEvent) => void) | null = null

        const loadBook = async () => {
            const bookMeta = await db.books.get(bookId)
            if (bookMeta?.title) {
                setBookTitleText(bookMeta.title)
            } else {
                setBookTitleText('Reading')
            }

            // 1. Fetch book data
            const file = await db.bookFiles.get(bookId)
            if (!file || !mounted || !viewerRef.current) return

            // Corrected: use db.progress instead of db.readingProgress
            const progress = await db.progress.get(bookId)
            const initialCfi = progress?.location || undefined

            // 2. Initialize Book
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const book = ePub(file.data as any)
            bookRef.current = book

            // 3. Render configuration for 3 page-turn modes (按 epub_reader_dev_doc.md)
            const isContinuous = settings.pageTurnMode === 'scrolled-continuous'
            const isScrolled = settings.pageTurnMode === 'scrolled'
            const manager = isContinuous ? 'continuous' : 'default'
            const flow = isContinuous ? 'scrolled' : isScrolled ? 'scrolled-doc' : 'paginated'
            setRenderLock(isContinuous)
            const rendition = book.renderTo(viewerRef.current, {
                width: '100%',
                height: '100vh',
                manager,
                flow,
                spread: settings.pageTurnMode === 'paginated' ? 'none' : 'auto',
                snap: false,
                minSpreadWidth: 0,
                allowScriptedContent: false,
            })
            renditionRef.current = rendition

            console.log('Rendition created:', {
                mode: settings.pageTurnMode,
                manager,
                flow
            })
            rendition.on('rendered', () => {
                if (!mounted) return
                setRenderLock(false)
                if (renderUnlockTimerRef.current) {
                    window.clearTimeout(renderUnlockTimerRef.current)
                    renderUnlockTimerRef.current = null
                }
            })

            // 4. Register Hook - 使用 addStyle 注入 CSS（按文档推荐）
            rendition.hooks.content.register((contents: any) => {
                const { textColor, bgColor } = resolveReaderColors()
                injectContentStyle(contents, `
                    body, html {
                        margin: 0 !important;
                        padding: 0 !important;
                        background: ${bgColor} !important;
                        color: ${textColor} !important;
                    }
                    p, div, section, article {
                        margin-top: 0 !important;
                        margin-bottom: 0 !important;
                        color: ${textColor} !important;
                    }
                    h1, h2, h3, h4, h5, h6 {
                        margin-top: 1em !important;
                        margin-bottom: 0.5em !important;
                        color: ${textColor} !important;
                    }
                    hr, .break, [style*="page-break"] {
                        display: none !important;
                    }
                    .vitra-search-hit {
                        background: rgba(255, 209, 102, 0.45) !important;
                        border-radius: 2px !important;
                    }
                `)

                try {
                    const doc = contents.document as Document | undefined
                    const win = contents.window as Window | undefined
                    if (!doc || !win) return
                    const root = doc.documentElement as HTMLElement
                    if (root.dataset.vitraContextmenuBound === '1') return
                    root.dataset.vitraContextmenuBound = '1'

                    doc.addEventListener('contextmenu', (event) => {
                        const selection = win.getSelection()
                        const text = selection?.toString().trim() || ''
                        if (!text) return

                        event.preventDefault()
                        event.stopPropagation()

                        const range = selection?.rangeCount ? selection.getRangeAt(0) : null
                        let cfiRange = currentCfi
                        if (range && typeof contents.cfiFromRange === 'function') {
                            try {
                                cfiRange = contents.cfiFromRange(range) || currentCfi
                            } catch {
                                cfiRange = currentCfi
                            }
                        }

                        const iframe = viewerRef.current?.querySelector('iframe')
                        const iframeRect = iframe?.getBoundingClientRect()
                        const x = (iframeRect?.left || 0) + event.clientX
                        const y = (iframeRect?.top || 0) + event.clientY

                        setSelectionMenu({
                            visible: true,
                            x,
                            y,
                            text,
                            cfiRange,
                        })
                    })
                } catch (error) {
                    console.warn('Bind context menu failed:', error)
                }
            })

            // 在首次 display 前先应用主题样式，减少章节切换/回滚时的闪烁
            updateRenditionStyles(rendition)

            // 5. Display
            await queueDisplay(initialCfi)

            // 6. Load TOC & Highlights
            const nav = await book.loaded.navigation
            setToc(nav.toc as TocItem[])

            const highlights = await db.highlights.where('bookId').equals(bookId).toArray()
            highlights.forEach(h => {
                rendition.annotations.add(
                    'highlight',
                    h.cfiRange,
                    {},
                    (e: any) => {
                        console.log('Highlight clicked', e)
                    },
                    'vitra-user-highlight',
                    { fill: h.color, 'fill-opacity': '0.55' }
                )
            })

            // 7. Event Listeners + 智能预加载（按文档推荐）
            rendition.on('relocated', (location: any) => {
                if (!mounted) return
                setCurrentCfi(location.start.cfi)
                const hrefFromLocation = normalizeHref(location?.start?.href)
                if (hrefFromLocation) {
                    setCurrentSectionHref(hrefFromLocation)
                }

                setSelectionMenu(prev => ({ ...prev, visible: false }))
                if (settings.pageTurnMode === 'scrolled-continuous') {
                    setRenderLock(true)
                    if (renderUnlockTimerRef.current) {
                        window.clearTimeout(renderUnlockTimerRef.current)
                    }
                    renderUnlockTimerRef.current = window.setTimeout(() => {
                        setRenderLock(false)
                        renderUnlockTimerRef.current = null
                    }, 180)
                }

                if (progressWriteTimerRef.current) {
                    window.clearTimeout(progressWriteTimerRef.current)
                }
                progressWriteTimerRef.current = window.setTimeout(() => {
                    db.progress.put({
                        bookId,
                        location: location.start.cfi,
                        percentage: location.start.percentage || 0,
                        currentChapter: '',
                        updatedAt: Date.now()
                    }).catch((error) => {
                        console.warn('Persist reading progress failed:', error)
                    })
                }, 120)

            })

            // Keyboard navigation
            keyDownHandler = (e: KeyboardEvent) => {
                if (!mounted || !renditionRef.current) return
                if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                    e.preventDefault()
                    renditionRef.current.prev()
                } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                    e.preventDefault()
                    renditionRef.current.next()
                }
            }
            document.addEventListener('keydown', keyDownHandler)
            const viewerEl = viewerRef.current
            if (viewerEl) {
                wheelGuardHandler = (event: WheelEvent) => {
                    if (!mounted) return
                    if (settings.pageTurnMode !== 'scrolled-continuous') return
                    if (!renderLockRef.current) return
                    event.preventDefault()
                    event.stopPropagation()
                }
                viewerEl.addEventListener('wheel', wheelGuardHandler, { passive: false, capture: true })
            }

            // Selection Handler
            rendition.on('selected', (cfiRange: string, contents: any) => {
                if (!mounted) return
                const range = contents.range(cfiRange)
                const text = range.toString()

                if (text) {
                    const rect = range.getBoundingClientRect()
                    const iframe = viewerRef.current?.querySelector('iframe')
                    const iframeRect = iframe?.getBoundingClientRect()

                    const x = (iframeRect?.left || 0) + rect.left + (rect.width / 2)
                    const y = (iframeRect?.top || 0) + rect.top - 10

                    setSelectionMenu({
                        visible: true,
                        x,
                        y,
                        text,
                        cfiRange
                    })
                }
            })

            // Click outside to clear selection
            rendition.on('click', () => {
                setSelectionMenu(prev => ({ ...prev, visible: false }))
            })

            if (mounted) setIsReady(true)
        }

        loadBook()

        return () => {
            mounted = false
            if (progressWriteTimerRef.current) {
                window.clearTimeout(progressWriteTimerRef.current)
                progressWriteTimerRef.current = null
            }
            if (renderUnlockTimerRef.current) {
                window.clearTimeout(renderUnlockTimerRef.current)
                renderUnlockTimerRef.current = null
            }
            if (wheelGuardHandler && viewerRef.current) {
                viewerRef.current.removeEventListener('wheel', wheelGuardHandler, true)
            }
            if (keyDownHandler) {
                document.removeEventListener('keydown', keyDownHandler)
            }
            if (renditionRef.current) {
                try {
                    renditionRef.current.destroy()
                } catch (error) {
                    console.warn('Rendition destroy failed:', error)
                }
                renditionRef.current = null
            }
            if (bookRef.current) {
                bookRef.current.destroy()
                bookRef.current = null
            }
            setRenderLock(false)
        }
    }, [bookId, settings.pageTurnMode])

    useEffect(() => {
        return () => {
            if (activeSearchHitCfi) {
                renditionRef.current?.annotations.remove(activeSearchHitCfi, 'highlight')
            }
        }
    }, [activeSearchHitCfi])

    // React to settings changes
    useEffect(() => {
        if (renditionRef.current) {
            updateRenditionStyles(renditionRef.current)
            if (settings.pageTurnMode === 'scrolled-continuous') {
                renditionRef.current.flow('scrolled')
            } else if (settings.pageTurnMode === 'scrolled') {
                renditionRef.current.flow('scrolled-doc')
            } else {
                renditionRef.current.flow('paginated')
                // Only re-display for paginated mode
                void queueDisplay(currentCfi)
            }
        }
    }, [settings.fontSize, settings.fontFamily, settings.lineHeight, settings.letterSpacing, settings.paragraphSpacing, settings.pageWidth, settings.textAlign])

    // Separate effect for colors to avoid re-display and improve performance
    useEffect(() => {
        if (renditionRef.current) {
            updateRenditionStyles(renditionRef.current)
        }
    }, [settings.customTextColor, settings.customBgColor])

    const updateRenditionStyles = (rendition: Rendition) => {
        const { textColor, bgColor: readerBackground } = resolveReaderColors()
        const maxWidthPercent = Math.round((Math.max(0.5, Math.min(3, settings.pageWidth)) / 3) * 100)
        const alignStyle =
            settings.textAlign === 'justify'
                ? {
                    'text-align': 'justify',
                    'text-justify': 'inter-ideograph',
                    'word-break': 'normal',
                }
                : settings.textAlign === 'center'
                    ? {
                        'text-align': 'center',
                    }
                    : {
                        'text-align': 'left',
                    }

        rendition.themes.default({
            'p': {
                'font-family': settings.fontFamily,
                'font-size': `${settings.fontSize}px`,
                'line-height': settings.lineHeight,
                'letter-spacing': `${settings.letterSpacing}px`,
                'margin-bottom': `${settings.paragraphSpacing}px`,
                ...alignStyle,
                'color': `${textColor} !important`,
            },
            'body': {
                'color': `${textColor} !important`,
                'font-family': settings.fontFamily,
                'background': `${readerBackground} !important`,
                'letter-spacing': `${settings.letterSpacing}px`,
                'max-width': `${maxWidthPercent}%`,
                'margin': '0 auto',
                ...alignStyle,
            },
            'div, span, li, a, h1, h2, h3, h4, h5, h6': {
                'color': `${textColor} !important`,
                'font-family': settings.fontFamily,
                ...alignStyle,
            },
        })
        rendition.themes.font(settings.fontFamily)
        rendition.themes.fontSize(`${settings.fontSize}px`)
        rendition.themes.override('line-height', String(settings.lineHeight))
        rendition.themes.override('letter-spacing', `${settings.letterSpacing}px`)
        rendition.themes.override('color', textColor)
        rendition.themes.override('text-align', settings.textAlign)
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(selectionMenu.text)
        setSelectionMenu(prev => ({ ...prev, visible: false }))
    }

    const handleHighlight = async (color = HIGHLIGHT_PRESETS[0].color) => {
        const { cfiRange, text } = selectionMenu

        await db.highlights.add({
            id: crypto.randomUUID(),
            bookId,
            cfiRange,
            color,
            text,
            createdAt: Date.now()
        })

        renditionRef.current?.annotations.add(
            'highlight',
            cfiRange,
            {},
            undefined,
            'vitra-user-highlight',
            { fill: color, 'fill-opacity': '0.55' }
        )
        setSelectionMenu(prev => ({ ...prev, visible: false }))

        const selection = window.getSelection()
        selection?.removeAllRanges()
    }

    const handleAddNote = async () => {
        await db.bookmarks.add({
            id: crypto.randomUUID(),
            bookId,
            location: currentCfi || selectionMenu.cfiRange,
            title: selectionMenu.text.slice(0, 40),
            createdAt: Date.now(),
        })
        setSelectionMenu(prev => ({ ...prev, visible: false }))
    }

    const handleFullTextSearch = async () => {
        const keyword = selectionMenu.text.trim()
        if (!keyword) return
        setSearchQuery(keyword)
        setActiveTab('search')
        setLeftPanelOpen(true)
        setSettingsOpen(false)
        setSelectionMenu(prev => ({ ...prev, visible: false }))
        await handleSearchWithKeyword(keyword)
    }

    const handleOnlineSearch = () => {
        const q = encodeURIComponent(selectionMenu.text.trim())
        if (!q) return
        window.electronAPI.openExternal(`https://www.google.com/search?q=${q}`)
        setSelectionMenu(prev => ({ ...prev, visible: false }))
    }

    const handleReadAloud = () => {
        const text = selectionMenu.text.trim()
        if (!text) return
        window.speechSynthesis.cancel()
        const utter = new SpeechSynthesisUtterance(text)
        utter.lang = 'zh-CN'
        utter.rate = 1
        window.speechSynthesis.speak(utter)
        setSelectionMenu(prev => ({ ...prev, visible: false }))
    }

    const handleTranslate = () => {
        const url = `https://translate.google.com/?sl=auto&tl=zh-CN&text=${encodeURIComponent(selectionMenu.text)}`
        window.electronAPI.openExternal(url)
        setSelectionMenu(prev => ({ ...prev, visible: false }))
    }

    const handleTocClick = (href: string) => {
        void queueDisplay(href)
        if (window.innerWidth < 768) setLeftPanelOpen(false)
    }

    const handleSearchWithKeyword = async (keyword: string) => {
        if (!keyword.trim() || !bookRef.current) return
        setIsSearching(true)
        setSearchResults([])
        try {
            const results = await Promise.all(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (bookRef.current.spine as any).spineItems.map((item: any) =>
                    item.load(bookRef.current!.load.bind(bookRef.current))
                        .then(item.find.bind(item, keyword))
                        .finally(item.unload.bind(item, bookRef.current!.load.bind(bookRef.current)))
                )
            )
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const flat: SearchResult[] = [].concat(...results as any)
            setSearchResults(flat)
        } catch (e) {
            console.error('Search failed', e)
        } finally {
            setIsSearching(false)
        }
    }

    const handleSearch = async () => {
        await handleSearchWithKeyword(searchQuery)
    }

    const handleResultClick = (cfi: string) => {
        const rendition = renditionRef.current
        if (!rendition) return
        if (activeSearchHitCfi) {
            rendition.annotations.remove(activeSearchHitCfi, 'highlight')
        }
        queueDisplay(cfi).then(() => {
            rendition.annotations.add(
                'highlight',
                cfi,
                {},
                undefined,
                'vitra-search-hit',
                { 'fill': '#ffd166', 'fill-opacity': '0.35' }
            )
            setActiveSearchHitCfi(cfi)
        }).catch((error) => {
            console.error('Jump to search result failed:', error)
        })
    }

    const prevPage = () => renditionRef.current?.prev()
    const nextPage = () => renditionRef.current?.next()
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
            const children = item.subitems ? renderTocItems(item.subitems, level + 1) : []
            return [
                <button
                    key={key}
                    className={`${styles.tocItem} ${isTocItemActive(item.href) ? styles.tocItemActive : ''}`}
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

    return (
        <div className={styles.readerContainer}>
            {/* Top Toolbar */}
            <motion.div
                className={styles.toolbar}
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

            {/* Selection Context Menu */}
            <AnimatePresence>
                {selectionMenu.visible && (
                    <motion.div
                        className={styles.selectionMenu}
                        style={{ top: selectionMenu.y, left: selectionMenu.x }}
                        initial={{ opacity: 0, scale: 0.8, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                    >
                        <button className={styles.menuIconBtn} onClick={handleAddNote} title="笔记">
                            <img className={styles.menuActionIcon} src={noteActionIcon} alt="" />
                        </button>
                        <button className={styles.menuIconBtn} onClick={() => handleHighlight(HIGHLIGHT_PRESETS[0].color)} title="高亮">
                            <img className={styles.menuActionIcon} src={highlightActionIcon} alt="" />
                        </button>
                        <button className={styles.menuIconBtn} onClick={handleCopy} title="复制">
                            <img className={styles.menuActionIcon} src={copyActionIcon} alt="" />
                        </button>
                        <button className={styles.menuIconBtn} onClick={handleFullTextSearch} title="全文搜索">
                            <img className={styles.menuActionIcon} src={searchActionIcon} alt="" />
                        </button>
                        <button className={styles.menuIconBtn} onClick={handleOnlineSearch} title="在线搜索">
                            <img className={styles.menuActionIcon} src={webSearchActionIcon} alt="" />
                        </button>
                        <button className={styles.menuIconBtn} onClick={handleReadAloud} title="朗读">
                            <img className={styles.menuActionIcon} src={speakActionIcon} alt="" />
                        </button>
                        <div className={styles.menuDivider} />
                        <button className={styles.menuIconBtn} onClick={handleTranslate} title="翻译">
                            <img className={styles.menuActionIcon} src={translateActionIcon} alt="" />
                        </button>
                        <div className={styles.highlightSwatches}>
                            {HIGHLIGHT_PRESETS.map((preset) => (
                                <button
                                    key={preset.key}
                                    className={styles.swatchBtn}
                                    style={{ background: preset.color }}
                                    onClick={() => handleHighlight(preset.color)}
                                    title="高亮颜色"
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content Area */}
            <div className={styles.contentArea}>
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
                            </div>

                            {activeTab === 'toc' ? (
                                <div className={styles.tocList}>
                                    {toc.length === 0 ? <p className={styles.emptyText}>无目录信息</p> :
                                        renderTocItems(toc)
                                    }
                                </div>
                            ) : (
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
                                                className={`${styles.resultItem} ${activeSearchHitCfi === res.cfi ? styles.resultItemActive : ''}`}
                                                onClick={() => handleResultClick(res.cfi)}
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
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Center Reader */}
                <div className={styles.readerWrapper}>
                    {!isReady && <div className={styles.loading}>Loading...</div>}
                    {settings.pageTurnMode === 'scrolled-continuous' && renderLocked && (
                        <div className={styles.renderLockOverlay} title="章节渲染中，请稍候" />
                    )}

                    <div
                        className={styles.epubViewer}
                        ref={viewerRef}
                        style={{ filter: `brightness(${Math.min(1, Math.max(0.3, Number(settings.brightness) || 1))})` }}
                    />

                    {!leftPanelOpen && !settingsOpen && settings.pageTurnMode === 'paginated' && (
                        <>
                            <div className={styles.prevZone} onClick={prevPage} title="Previous" />
                            <div className={styles.nextZone} onClick={nextPage} title="Next" />
                        </>
                    )}
                </div>

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

                                <div className={styles.settingsGroup}>
                                    <label>文字颜色</label>
                                    <div className={styles.colorRow}>
                                        <input
                                            type="color"
                                            value={tempTextColor ?? settings.customTextColor ?? (settings.themeId === 'dark' ? '#e0e0e0' : '#1a1a1a')}
                                            onChange={(e) => setTempTextColor(e.target.value)}
                                            onMouseUp={(e) => {
                                                const target = e.target as HTMLInputElement
                                                settings.updateSetting('customTextColor', target.value)
                                                setTempTextColor(null)
                                            }}
                                        />
                                        <button className={styles.smallActionBtn} onClick={() => {
                                            settings.updateSetting('customTextColor', null)
                                            setTempTextColor(null)
                                        }}>默认</button>
                                    </div>
                                </div>

                                <div className={styles.settingsGroup}>
                                    <label>背景颜色</label>
                                    <div className={styles.colorRow}>
                                        <input
                                            type="color"
                                            value={settings.customBgColor ?? '#ffffff'}
                                            onChange={(e) => settings.updateSetting('customBgColor', e.target.value)}
                                        />
                                        <button className={styles.smallActionBtn} onClick={() => {
                                            settings.updateSetting('customBgColor', null)
                                        }}>默认</button>
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
                                            className={`${styles.toggleBtn} ${settings.pageTurnMode === 'paginated' ? styles.active : ''}`}
                                            onClick={() => settings.updateSetting('pageTurnMode', 'paginated')}
                                        >
                                            分页
                                        </button>
                                        <button
                                            className={`${styles.toggleBtn} ${settings.pageTurnMode === 'scrolled' ? styles.active : ''}`}
                                            onClick={() => settings.updateSetting('pageTurnMode', 'scrolled')}
                                        >
                                            滚动
                                        </button>
                                        <button
                                            className={`${styles.toggleBtn} ${settings.pageTurnMode === 'scrolled-continuous' ? styles.active : ''}`}
                                            onClick={() => settings.updateSetting('pageTurnMode', 'scrolled-continuous')}
                                        >
                                            连续滚动
                                        </button>
                                    </div>
                                </div>

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
