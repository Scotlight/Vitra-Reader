import { useEffect, useRef } from 'react'
import { useStableEvent } from '@/hooks/useStableEvent'
import {
    isEditableTarget,
    resolveKeyboardShortcut,
    stepWheelFontAccumulator,
} from './readerShortcutActions'

interface UseReaderShortcutsArgs {
    readonly onFontSizeDelta: (delta: number) => void
    readonly onThemeChange: (themeId: string) => void
    readonly onToggleFullscreen: () => void
}

// 阅读器内置快捷键：Ctrl+加减 / Ctrl+滚轮 调字号，F1~F4 切主题，F11 切全屏。
// 监听挂在 window 上，但 hook 只在阅读器挂载期存活，所以书库页天然不受影响。
export function useReaderShortcuts({
    onFontSizeDelta,
    onThemeChange,
    onToggleFullscreen,
}: UseReaderShortcutsArgs): void {
    // 滚轮累积量放 ref：它是跨事件的连续状态，进 state 会每个 wheel 都触发重渲染。
    const wheelAccumulatorRef = useRef(0)
    // 用 useStableEvent 拿到恒定引用的回调，监听器整个生命周期只注册一次，
    // 不会因为字号每变一格就摘挂一轮 window listener。
    const applyFontSizeDelta = useStableEvent(onFontSizeDelta)
    const applyThemeChange = useStableEvent(onThemeChange)
    const applyToggleFullscreen = useStableEvent(onToggleFullscreen)

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const action = resolveKeyboardShortcut(event)
            if (!action) return

            // 必须吃掉默认行为：F1 在 Windows 上是帮助键，Ctrl+加减在部分宿主里是页面缩放。
            event.preventDefault()

            if (action.type === 'font-size-delta') {
                applyFontSizeDelta(action.delta)
                return
            }
            if (action.type === 'theme') {
                applyThemeChange(action.themeId)
                return
            }
            applyToggleFullscreen()
        }

        const handleWheel = (event: WheelEvent) => {
            // 第一行就放行非 Ctrl 路径：滚动阅读与分页翻页的滚轮语义完全不受本 hook 影响，
            // 非 Ctrl 滚动的额外开销只有一次布尔判断。
            if (!event.ctrlKey && !event.metaKey) return
            if (isEditableTarget(event.target)) return

            event.preventDefault()
            const { delta, rest } = stepWheelFontAccumulator(wheelAccumulatorRef.current + event.deltaY)
            wheelAccumulatorRef.current = rest
            if (delta !== 0) applyFontSizeDelta(delta)
        }

        window.addEventListener('keydown', handleKeyDown)
        // passive: false 是必须的——默认 passive 的 wheel 监听里 preventDefault 无效，
        // 宿主的 Ctrl+滚轮缩放就拦不住。
        window.addEventListener('wheel', handleWheel, { passive: false })
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('wheel', handleWheel)
        }
    }, [applyFontSizeDelta, applyThemeChange, applyToggleFullscreen])
}
