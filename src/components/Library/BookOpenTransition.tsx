import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import styles from './BookOpenTransition.module.css'

/**
 * 共享元素过渡 —— 通过 CustomEvent 与 Library/Reader 解耦
 *
 * 事件契约：
 * - 'book:open'    detail: { bookId, cover, cardRect: {top,left,width,height} }  卡片点击时触发
 * - 'book:close'   detail: { bookId, cardRect }                                   返回书架时触发
 * - 'reader:ready' detail: { bookId }                                              ReaderView isReady=true 时触发
 *
 * 状态机：
 *   idle → entering(卡片→全屏) → holding(全屏保持, 等 reader:ready) → exiting(淡出) → idle
 *   idle → returning(全屏→卡片) → idle
 *
 * 仅手机端（max-width 850px portrait）启用；桌面端 eventlistener 仍然监听但不渲染，
 * 这样调用方不需要做平台判断。
 *
 * 实现要点：用 framer-motion 动画 width/height/top/left 比 transform 更接近 iOS 的
 * "卡片展开"感（边框圆角也能同步收拢），代价是 layout 重排，但单次动画 < 500ms 可接受。
 */

interface CardRect {
    top: number
    left: number
    width: number
    height: number
}

interface OpenDetail {
    bookId: string
    cover: string
    cardRect: CardRect
}

interface CloseDetail {
    bookId: string
    cardRect: CardRect
}

type Phase = 'idle' | 'entering' | 'holding' | 'exiting' | 'returning'

// 动画时长约定：跟全局 --ui-transition-speed 对齐，避免跟系统动画打架
const ENTER_MS = 380
const EXIT_MS = 280
const RETURN_MS = 360
const MIN_HOLD_MS = 200 // 加载太快时，至少停 200ms 让用户感知到"翻开了"

// iOS 标准缓动
const EASE_OUT: [number, number, number, number] = [0.32, 0.72, 0, 1]

export function BookOpenTransition() {
    const [phase, setPhase] = useState<Phase>('idle')
    const [activeBook, setActiveBook] = useState<OpenDetail | null>(null)
    const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
    // ready 用 state 而非 ref：holding → exiting 的 useEffect 需要 ready 变化触发重跑
    const [readerReady, setReaderReady] = useState(false)
    const [isMobile, setIsMobile] = useState(() => checkIsMobile())

    useEffect(() => {
        // 与 checkIsMobile 一致：缺 matchMedia 的环境不订阅，保持初始非移动端判定
        if (typeof window.matchMedia !== 'function') return
        const mq = window.matchMedia('(max-width: 850px) and (orientation: portrait)')
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
        mq.addEventListener('change', handler)
        setIsMobile(mq.matches)
        return () => mq.removeEventListener('change', handler)
    }, [])

    useEffect(() => {
        const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    useEffect(() => {
        if (!isMobile) return

        const handleOpen = (event: Event) => {
            const detail = (event as CustomEvent<OpenDetail>).detail
            if (!detail?.cover || !detail.cardRect) return
            setActiveBook(detail)
            setReaderReady(false)
            setPhase('entering')
        }

        const handleReady = (event: Event) => {
            const detail = (event as CustomEvent<{ bookId: string }>).detail
            if (!detail?.bookId) return
            setReaderReady(true)
        }

        const handleClose = (event: Event) => {
            const detail = (event as CustomEvent<CloseDetail>).detail
            if (!detail?.bookId) return
            // 已有过渡在进行才接管；否则忽略（防止打开过程中点返回导致状态错乱）
            setActiveBook((current) => {
                if (!current || current.bookId !== detail.bookId) return current
                setPhase('returning')
                return current
            })
        }

        window.addEventListener('book:open', handleOpen)
        window.addEventListener('reader:ready', handleReady)
        window.addEventListener('book:close', handleClose)
        return () => {
            window.removeEventListener('book:open', handleOpen)
            window.removeEventListener('reader:ready', handleReady)
            window.removeEventListener('book:close', handleClose)
        }
    }, [isMobile])

    // entering 完成 → holding；holding 等到 ready → exiting；exiting 完成 → idle
    useEffect(() => {
        if (phase === 'entering') {
            const t = window.setTimeout(() => setPhase('holding'), ENTER_MS)
            return () => window.clearTimeout(t)
        }
        if (phase === 'holding') {
            if (!readerReady) return
            // 保证最小停留时间，避免一闪而过
            const t = window.setTimeout(() => setPhase('exiting'), MIN_HOLD_MS)
            return () => window.clearTimeout(t)
        }
        if (phase === 'exiting') {
            const t = window.setTimeout(() => {
                setPhase('idle')
                setActiveBook(null)
                setReaderReady(false)
            }, EXIT_MS)
            return () => window.clearTimeout(t)
        }
        if (phase === 'returning') {
            const t = window.setTimeout(() => {
                setPhase('idle')
                setActiveBook(null)
                setReaderReady(false)
            }, RETURN_MS)
            return () => window.clearTimeout(t)
        }
    }, [phase, readerReady])

    if (!isMobile || phase === 'idle' || !activeBook) return null

    const { top, left, width, height } = activeBook.cardRect

    // 打开动画：从卡片位置 → 全屏
    const openInitial = { top, left, width, height, borderRadius: 8, opacity: 1 }
    const openFullscreen = { top: 0, left: 0, width: viewport.w, height: viewport.h, borderRadius: 0, opacity: 1 }
    const openFadeOut = { ...openFullscreen, opacity: 0 }

    // 返回动画：从全屏 → 卡片位置
    const returnInitial = { ...openFullscreen, opacity: 1 }
    const returnTarget = { top, left, width, height, borderRadius: 8, opacity: 1 }

    const isOpening = phase === 'entering' || phase === 'holding' || phase === 'exiting'

    return (
        <div className={styles.overlay} data-book-open-transition={phase} aria-hidden="true">
            <AnimatePresence>
                {isOpening && (
                    <motion.div
                        key={`cover-open-${activeBook.bookId}`}
                        className={styles.cover}
                        initial={openInitial}
                        animate={
                            phase === 'entering' || phase === 'holding'
                                ? openFullscreen
                                : openFadeOut
                        }
                        transition={{
                            duration: phase === 'exiting' ? EXIT_MS / 1000 : ENTER_MS / 1000,
                            ease: EASE_OUT,
                        }}
                    >
                        <img src={activeBook.cover} alt="" draggable={false} />
                    </motion.div>
                )}
                {phase === 'returning' && (
                    <motion.div
                        key={`cover-return-${activeBook.bookId}`}
                        className={styles.cover}
                        initial={returnInitial}
                        animate={returnTarget}
                        transition={{ duration: RETURN_MS / 1000, ease: EASE_OUT }}
                    >
                        <img src={activeBook.cover} alt="" draggable={false} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function checkIsMobile(): boolean {
    if (typeof window === 'undefined') return false
    // jsdom 与部分老 WebView 没有 matchMedia，缺省时按非移动端处理而非抛错
    if (typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(max-width: 850px) and (orientation: portrait)').matches
}

/** 供 BookGridCard 调用：上报点击事件和卡片位置 */
export function emitBookOpen(detail: OpenDetail) {
    window.dispatchEvent(new CustomEvent<OpenDetail>('book:open', { detail }))
}

/** 供 ReaderView onBack 调用：上报返回事件 */
export function emitBookClose(detail: CloseDetail) {
    window.dispatchEvent(new CustomEvent<CloseDetail>('book:close', { detail }))
}

/** 供 ReaderView useEffect 在 isReady=true 时调用 */
export function emitReaderReady(bookId: string) {
    window.dispatchEvent(new CustomEvent('reader:ready', { detail: { bookId } }))
}
