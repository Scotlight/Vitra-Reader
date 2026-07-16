import { create } from 'zustand'
import { BOOK_SHELF_LABEL, db, type BookMeta } from '@/services/storageService'
import { stripBookExtension, type BookFormat } from '@/engine/core/contentProvider'
import { detectFormat as detectEngineFormat } from '@/engine/core/formatDetector'
import { parseBookMetadata } from '@/engine/core/contentProviderFactory'
import type { EngineBookFormat } from '@/engine/types/book'

type BinaryPayload = ArrayBuffer | Uint8Array
type ImportedFile = { name: string; path: string; data: BinaryPayload }

const ENGINE_FORMAT_TO_BOOK_FORMAT: Record<EngineBookFormat, BookFormat> = {
    EPUB: 'epub',
    MOBI: 'mobi',
    AZW3: 'azw3',
    AZW: 'azw',
    PDF: 'pdf',
    DJVU: 'djvu',
    TXT: 'txt',
    FB2: 'fb2',
    DOCX: 'docx',
    MD: 'md',
    HTML: 'html',
    HTM: 'html',
    XML: 'xml',
    XHTML: 'html',
    MHTML: 'html',
    CBZ: 'cbz',
    CBT: 'cbt',
    CBR: 'cbr',
    CB7: 'cb7',
}

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

async function detectBookFormat(data: ArrayBuffer, filename: string): Promise<BookFormat> {
    const engineFormat = await detectEngineFormat(data, filename)
    return ENGINE_FORMAT_TO_BOOK_FORMAT[engineFormat]
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
    books: [],
    isLoading: false,

    loadBooks: async () => {
        set({ isLoading: true })
        const books = await db.books.orderBy('lastReadAt').reverse().toArray()
        // 剥离 cover/originalCover 字段，避免把所有封面 Base64 加载到内存
        // BookGrid 会在渲染时按需读取 cover
        const booksWithoutCovers = books.map(({ cover: _c, originalCover: _oc, ...rest }) => rest as typeof rest & { cover?: string; originalCover?: string })
        set({ books: booksWithoutCovers, isLoading: false })
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
            const format = await detectBookFormat(fileData, file.name)
            const parsed = await parseBookMetadata(format, fileData, file.name)
            const metaRecord = parsed as Record<string, unknown>
            const title = parsed.title || stripBookExtension(file.name)
            const author = parsed.author || '未知作者'
            const description = typeof metaRecord.description === 'string' ? metaRecord.description : ''
            const cover = typeof metaRecord.cover === 'string' ? metaRecord.cover : ''

            // 新导入默认 to_read；标签与元数据时间戳同写入时刻，后续编辑再独立推进。
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
                publisher: typeof metaRecord.publisher === 'string' ? metaRecord.publisher : undefined,
                language: typeof metaRecord.language === 'string' ? metaRecord.language : undefined,
                format,
                fileSize: fileData.byteLength,
                addedAt: now,
                lastReadAt: now,
                shelfLabel: BOOK_SHELF_LABEL.TO_READ,
                shelfLabelUpdatedAt: now,
                metadataUpdatedAt: now,
            }
        } catch (e) {
            console.error('Failed to parse book:', e)
            const format = await detectBookFormat(fileData, file.name)
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
                shelfLabel: BOOK_SHELF_LABEL.TO_READ,
                shelfLabelUpdatedAt: now,
                metadataUpdatedAt: now,
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
