import { useCallback } from 'react'
import { pickBookFiles } from '@/services/platform/platformBridge'

interface UseLibraryImportOptions {
    readonly importBook: (
        book: { name: string; path: string; data: ArrayBuffer | Uint8Array },
        options?: { skipRefresh?: boolean },
    ) => Promise<void>
    readonly loadBooks: () => Promise<void>
    readonly showInfoDialog: (message: string) => void
}

export function useLibraryImport({
    importBook,
    loadBooks,
    showInfoDialog,
}: UseLibraryImportOptions) {
    return useCallback(async () => {
        try {
            const files = await pickBookFiles()
            if (!files.length) return

            let failed = 0
            for (const file of files) {
                try {
                    const binary = await file.data()
                    await importBook({
                        name: file.name,
                        path: file.path,
                        data: binary,
                    }, { skipRefresh: true })
                } catch (error) {
                    failed += 1
                    console.error(`Failed to import book: ${file.name}`, error)
                }
            }

            await loadBooks()

            if (failed > 0) {
                showInfoDialog(`导入完成：成功 ${files.length - failed} 本，失败 ${failed} 本。请查看控制台错误日志。`)
            }
        } catch (error) {
            console.error('Import flow failed:', error)
            showInfoDialog('导入失败：未能读取本地文件。请重试。')
        }
    }, [importBook, loadBooks, showInfoDialog])
}
