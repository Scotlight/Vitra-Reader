import { create } from 'zustand'
import { db, type BookMeta } from '../services/storageService'
import { detectFormat, stripBookExtension } from '../services/contentProvider'
import { parseBookMetadata } from '../services/contentProviderFactory'

type BinaryPayload = ArrayBuffer | Uint8Array
type ImportedFile = { name: string; path: string; data: BinaryPayload }

interface LibraryStore {
    books: BookMeta[]
    isLoading: boolean
    loadBooks: () => Promise<void>
    importBook: (file: ImportedFile, options?: { skipRefresh?: boolean }) => Promise<void>
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

    importBook: async (file, options) => {
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
            const format = detectFormat(file.name)
            const parsed = await parseBookMetadata(format, fileData, file.name)
            const title = parsed.title || stripBookExtension(file.name)
            const author = parsed.author || '未知作者'
            const description = (parsed as any).description || ''
            const cover = (parsed as any).cover || ''

            meta = {
                id,
                title,
                author,
                description,
                cover,
                originalTitle: title,
                originalAuthor: author,
                originalDescription: description,
                originalCover: cover,
                publisher: (parsed as any).publisher,
                language: (parsed as any).language,
                format,
                fileSize: fileData.byteLength,
                addedAt: now,
                lastReadAt: now,
            }
        } catch (e) {
            console.error('Failed to parse book:', e)
            const format = detectFormat(file.name)
            meta = {
                id,
                title: stripBookExtension(file.name),
                author: '解析失败',
                description: '',
                cover: '',
                originalTitle: stripBookExtension(file.name),
                originalAuthor: '解析失败',
                originalDescription: '',
                originalCover: '',
                format,
                fileSize: fileData.byteLength,
                addedAt: now,
                lastReadAt: now,
            }
        }

        await db.books.put(meta)

        // 3. Refresh list (can be deferred in batch import)
        if (!options?.skipRefresh) {
            await get().loadBooks()
        }
    },

    removeBook: async (id) => {
        await db.books.delete(id)
        await db.bookFiles.delete(id)
        await db.progress.delete(id)
        await db.bookmarks.where('bookId').equals(id).delete()
        await db.highlights.where('bookId').equals(id).delete()
        await get().loadBooks()
    },
}))
