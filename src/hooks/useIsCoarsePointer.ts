import { useEffect, useState } from 'react'

// 用主指针精度区分「手机/平板」与「桌面」：触摸屏主指针为 coarse，鼠标为 fine。
// 比视口宽度更贴合「亮度遮罩只给触屏」的语义——桌面窄窗口不应误判成手机。
const COARSE_POINTER_QUERY = '(pointer: coarse)'

function matchCoarsePointer(): boolean {
    // SSR / 测试环境可能无 matchMedia，缺省按非触屏（桌面）处理。
    return window.matchMedia?.(COARSE_POINTER_QUERY).matches ?? false
}

/** 当前主指针是否为触摸（手机/平板）。指针能力变化（如外接鼠标）时会实时更新。 */
export function useIsCoarsePointer(): boolean {
    const [isCoarse, setIsCoarse] = useState(matchCoarsePointer)

    useEffect(() => {
        const query = window.matchMedia?.(COARSE_POINTER_QUERY)
        if (!query) return
        const sync = () => setIsCoarse(query.matches)
        // 挂载后再同步一次，避免首帧 state 与真实媒体状态因 SSR 缺省而错位。
        sync()
        query.addEventListener('change', sync)
        return () => query.removeEventListener('change', sync)
    }, [])

    return isCoarse
}
