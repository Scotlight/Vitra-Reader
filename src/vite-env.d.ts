/// <reference types="vite/client" />

declare module 'mammoth' {
    interface MammothResult {
        value: string;
        messages: ReadonlyArray<{ type: string; message: string }>;
    }
    interface MammothInput {
        arrayBuffer: ArrayBuffer;
    }
    export function convertToHtml(input: MammothInput): Promise<MammothResult>;
}

declare module 'djvu.js' {
    const mod: unknown;
    export default mod;
}

interface ImportedEpubFile {
    name: string
    path: string
    size: number
}

interface ElectronProcessMetricMemory {
    workingSetSize: number
    peakWorkingSetSize: number
    privateBytes: number
}

interface ElectronProcessMetric {
    pid: number
    type: string
    memory: ElectronProcessMetricMemory | null
}

interface ElectronMainProcessMemory {
    private: number
    residentSet: number
    shared: number
}

interface Window {
    electronAPI: {
        openEpub: () => Promise<ImportedEpubFile[]>
        readFile: (path: string) => Promise<Uint8Array>
        listSystemFonts: () => Promise<string[]>
        getProcessMemoryInfo: () => Promise<{
            success: boolean
            timestamp: number
            mainMemory?: ElectronMainProcessMemory
            processMetrics?: ElectronProcessMetric[]
            error?: string
        }>
        getAutoStartOnLogin: () => Promise<{ supported: boolean; enabled: boolean }>
        setAutoStartOnLogin: (enabled: boolean) => Promise<{ supported: boolean; enabled: boolean }>
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
