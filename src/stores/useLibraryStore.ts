import { create } from 'zustand'
import { db, type BookMeta } from '../services/storageService'

type BinaryPayload = ArrayBuffer | Uint8Array
type ImportedFile = { name: string; path: string; data: BinaryPayload }

interface LibraryStore {
    books: BookMeta[]
    isLoading: boolean
    loadBooks: () => Promise<void>
    importBook: (file: ImportedFile) => Promise<void>
    removeBook: (id: string) => Promise<void>
}

function toArrayBuffer(data: BinaryPayload): ArrayBuffer {
    if (data instanceof ArrayBuffer) return data
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
    books: [],
    isLoading: false,

    loadBooks: async () => {
        set({ isLoading: true })
        const books = await db.books.orderBy('lastReadAt').reverse().toArray()
        set({ books, isLoading: false })
    },

    importBook: async (file) => {
        const fileData = toArrayBuffer(file.data)
        const id = crypto.randomUUID()
        const now = Date.now()

        // 1. Store the file binary
        try {
            await db.bookFiles.put({ id, data: fileData })
        } catch (e) {
            console.error('Failed to store book file:', e)
            throw e
        }

        // 2. Parse metadata
        let meta: BookMeta
        try {
            // Lazy load the parser to avoid circular deps if any
            const { parseEpub } = await import('../services/epubService')
            const parsed = await parseEpub(fileData)

            meta = {
                id,
                title: parsed.title || file.name.replace(/\.epub$/i, ''),
                author: parsed.author || '未知作者',
                cover: parsed.cover,
                publisher: parsed.publisher,
                language: parsed.language,
                fileSize: fileData.byteLength,
                addedAt: now,
                lastReadAt: now,
            }
        } catch (e) {
            console.error('Failed to parse EPUB:', e)
            // Fallback metadata
            meta = {
                id,
                title: file.name.replace(/\.epub$/i, ''),
                author: '解析失败',
                fileSize: fileData.byteLength,
                addedAt: now,
                lastReadAt: now,
            }
        }

        await db.books.put(meta)

        // 3. Refresh list
        await get().loadBooks()
    },

    removeBook: async (id) => {
        await db.books.delete(id)
        await db.bookFiles.delete(id)
        await db.progress.delete(id)
        await db.bookmarks.where('bookId').equals(id).delete()
        await get().loadBooks()
    },
}))
