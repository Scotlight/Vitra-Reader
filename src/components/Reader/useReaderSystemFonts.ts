import { useEffect, useState } from 'react'

const DEFAULT_SYSTEM_FONTS = Object.freeze(['系统默认', '微软雅黑', '宋体', '楷体', '黑体', '仿宋'])
const ERROR_FONTS = Object.freeze(['系统默认', '微软雅黑', '宋体', '楷体'])

export function useReaderSystemFonts() {
    const [systemFonts, setSystemFonts] = useState<string[]>([])
    const [loadingFonts, setLoadingFonts] = useState(false)

    useEffect(() => {
        if (!window.electronAPI?.listSystemFonts) return
        void loadFonts(setSystemFonts, setLoadingFonts)
    }, [])

    return { systemFonts, loadingFonts }
}

async function loadFonts(
    setSystemFonts: (fonts: string[]) => void,
    setLoadingFonts: (loading: boolean) => void,
) {
    setLoadingFonts(true)
    try {
        const fonts = await window.electronAPI.listSystemFonts()
        setSystemFonts(!fonts?.length ? [...DEFAULT_SYSTEM_FONTS] : ['系统默认', ...fonts])
    } catch (error) {
        console.error('Failed to load system fonts:', error)
        setSystemFonts([...ERROR_FONTS])
    } finally {
        setLoadingFonts(false)
    }
}
