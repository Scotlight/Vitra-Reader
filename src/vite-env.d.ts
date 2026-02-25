/// <reference types="vite/client" />

interface ImportedEpubFile {
    name: string
    path: string
    data: ArrayBuffer | Uint8Array
}

interface Window {
    electronAPI: {
        openEpub: () => Promise<ImportedEpubFile[]>
        readFile: (path: string) => Promise<Uint8Array>
        listSystemFonts: () => Promise<string[]>
        setWindowTheme: (payload: { themeId: string; customBgColor?: string | null; customTextColor?: string | null }) => void
        openExternal: (url: string) => Promise<void>
        webdavSync: (
            method: 'upload' | 'download' | 'test' | 'head',
            config: {
                url: string
                username: string
                password: string
                data?: string
                ifMatch?: string
                ifNoneMatch?: string
            }
        ) => Promise<{
            success: boolean
            data?: string
            error?: string
            statusCode?: number
            etag?: string
            lastModified?: string
            exists?: boolean
        }>
        translateRequest: (payload: {
            url: string
            method?: 'GET' | 'POST'
            headers?: Record<string, string>
            body?: string
        }) => Promise<{ success: boolean; status?: number; data?: string; error?: string }>
    }
}
