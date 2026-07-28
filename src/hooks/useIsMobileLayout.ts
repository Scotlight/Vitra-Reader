import { useEffect, useState } from 'react'

// 与 LibraryView.module.css 的移动端断点保持一致：760px 以下由 MobileLibraryChrome 接管书库布局。
// 在 JS 侧用同款查询做「挂载开关」而不是 CSS 隐藏——首页与 BookGrid 是二选一的内容，
// CSS 隐藏会让两棵树同时挂载，白白触发 LazyCoverImage 的封面加载与虚拟滚动测量。
const MOBILE_LAYOUT_QUERY = '(max-width: 760px)'

function matchMobileLayout(): boolean {
    // SSR / 测试环境可能无 matchMedia，缺省按桌面布局处理。
    return window.matchMedia?.(MOBILE_LAYOUT_QUERY).matches ?? false
}

/** 当前是否处于移动端书库布局（与 CSS 断点同源）。窗口尺寸跨过断点时实时更新。 */
export function useIsMobileLayout(): boolean {
    const [isMobile, setIsMobile] = useState(matchMobileLayout)

    useEffect(() => {
        const query = window.matchMedia?.(MOBILE_LAYOUT_QUERY)
        if (!query) return
        const sync = () => setIsMobile(query.matches)
        // 挂载后再同步一次，避免首帧 state 与真实媒体状态因 SSR 缺省而错位。
        sync()
        query.addEventListener('change', sync)
        return () => query.removeEventListener('change', sync)
    }, [])

    return isMobile
}
