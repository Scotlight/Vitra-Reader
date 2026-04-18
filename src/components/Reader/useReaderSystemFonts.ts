import { useEffect, useState } from 'react'

const DEFAULT_SYSTEM_FONTS = Object.freeze(['系统默认', '微软雅黑', '宋体', '楷体', '黑体', '仿宋'])
const ERROR_FONTS = Object.freeze(['系统默认', '微软雅黑', '宋体', '楷体'])

let cachedFonts: string[] | null = null
let cachePromise: Promise<string[]> | null = null

export function getSystemFontsOnce(): Promise<string[]> {
    if (cachedFonts) return Promise.resolve(cachedFonts)
    if (cachePromise) return cachePromise
    if (!window.electronAPI?.listSystemFonts) return Promise.resolve([...DEFAULT_SYSTEM_FONTS])

    cachePromise = window.electronAPI.listSystemFonts()
        .then((fonts) => {
            cachedFonts = !fonts?.length ? [...DEFAULT_SYSTEM_FONTS] : ['系统默认', ...fonts]
            return cachedFonts
        })
        .catch((error) => {
            console.error('Failed to load system fonts:', error)
            cachedFonts = [...ERROR_FONTS]
            return cachedFonts
        })
        .finally(() => { cachePromise = null })

    return cachePromise
}

export function useReaderSystemFonts() {
    const [systemFonts, setSystemFonts] = useState<string[]>(() => cachedFonts ?? [])
    const [loadingFonts, setLoadingFonts] = useState(!cachedFonts)

    useEffect(() => {
        if (cachedFonts) {
            setSystemFonts(cachedFonts)
            setLoadingFonts(false)
            return
        }
        setLoadingFonts(true)
        void getSystemFontsOnce().then((fonts) => {
            setSystemFonts(fonts)
            setLoadingFonts(false)
        })
    }, [])

    return { systemFonts, loadingFonts }
}
