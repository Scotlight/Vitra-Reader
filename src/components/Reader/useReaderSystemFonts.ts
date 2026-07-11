import { useEffect, useState } from 'react'
import { getPlatformCapabilities, listSystemFonts, pickFontFile } from '@/services/platform/platformBridge'
import {
    downloadReaderFont,
    importReaderFont,
    loadStoredReaderFonts,
    removeStoredReaderFont,
    type StoredReaderFontSummary,
} from './readerFontService'
import { READER_FONT_CATALOG } from './readerFontCatalog'

const DEFAULT_SYSTEM_FONTS = Object.freeze(['系统默认', '微软雅黑', '宋体', '楷体', '黑体', '仿宋'])
const ERROR_FONTS = Object.freeze(['系统默认', '微软雅黑', '宋体', '楷体'])
const WEB_SYSTEM_FONTS = Object.freeze(['系统默认', '系统黑体', '系统宋体', '系统等宽'])

let cachedFonts: string[] | null = null
let cachePromise: Promise<string[]> | null = null

export function getSystemFontsOnce(): Promise<string[]> {
    if (cachedFonts) return Promise.resolve(cachedFonts)
    if (cachePromise) return cachePromise

    const isDesktop = getPlatformCapabilities().isDesktop
    cachePromise = listSystemFonts()
        .then((fonts) => {
            cachedFonts = isDesktop
                ? (!fonts?.length ? [...DEFAULT_SYSTEM_FONTS] : ['系统默认', ...fonts])
                : [...WEB_SYSTEM_FONTS]
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
    const [storedFonts, setStoredFonts] = useState<StoredReaderFontSummary[]>([])
    const [fontOperationId, setFontOperationId] = useState<string | null>(null)
    const [fontError, setFontError] = useState<string | null>(null)

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

    useEffect(() => {
        void loadStoredReaderFonts()
            .then(setStoredFonts)
            .catch((error) => setFontError(error instanceof Error ? error.message : String(error)))
    }, [])

    const downloadFont = async (catalogId: string) => {
        const item = READER_FONT_CATALOG.find((font) => font.id === catalogId)
        if (!item) return
        setFontOperationId(catalogId)
        setFontError(null)
        try {
            const font = await downloadReaderFont(item)
            setStoredFonts((current) => [font, ...current.filter((entry) => entry.id !== font.id)])
        } catch (error) {
            setFontError(error instanceof Error ? error.message : String(error))
        } finally {
            setFontOperationId(null)
        }
    }

    const importFont = async () => {
        const picked = await pickFontFile()
        if (!picked) return
        setFontOperationId('import')
        setFontError(null)
        try {
            const font = await importReaderFont(picked.file)
            setStoredFonts((current) => [font, ...current])
        } catch (error) {
            setFontError(error instanceof Error ? error.message : String(error))
        } finally {
            setFontOperationId(null)
        }
    }

    const removeFont = async (fontId: string) => {
        setFontOperationId(fontId)
        setFontError(null)
        try {
            await removeStoredReaderFont(fontId)
            setStoredFonts((current) => current.filter((font) => font.id !== fontId))
        } catch (error) {
            setFontError(error instanceof Error ? error.message : String(error))
        } finally {
            setFontOperationId(null)
        }
    }

    return {
        catalog: READER_FONT_CATALOG,
        downloadFont,
        fontError,
        fontOperationId,
        importFont,
        loadingFonts,
        removeFont,
        storedFonts,
        systemFonts,
    }
}
