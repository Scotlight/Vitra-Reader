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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        webdavSync: (method: 'upload' | 'download' | 'test', config: any) => Promise<{ success: boolean; data?: string; error?: string }>
    }
}
