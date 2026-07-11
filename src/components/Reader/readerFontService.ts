import { db } from '@/services/storageService'
import { requestPersistentStorage } from '@/services/platform/platformBridge'
import type { ReaderFontCatalogItem, ReaderFontCategory } from './readerFontCatalog'

const FONT_INDEX_KEY = 'readerFonts:index:v1'
const FONT_DATA_KEY_PREFIX = 'readerFonts:data:v1:'
const FONT_FILE_EXTENSIONS = ['.otf', '.ttf', '.woff', '.woff2'] as const

export interface StoredReaderFontSummary {
    readonly id: string
    readonly displayName: string
    readonly family: string
    readonly category: ReaderFontCategory
    readonly format: string
    readonly sizeBytes: number
    readonly source: 'catalog' | 'import'
    readonly catalogId?: string
    readonly installedAt: number
}

interface StoredReaderFont extends StoredReaderFontSummary {
    readonly data: ArrayBuffer
}

const registeredFontFaces = new Map<string, FontFace>()

function dataKey(fontId: string): string {
    return `${FONT_DATA_KEY_PREFIX}${fontId}`
}

function fontFallback(category: ReaderFontCategory): string {
    if (category === 'serif' || category === 'handwriting') return 'ui-serif, "Songti SC", serif'
    return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
}

export function toStoredReaderFontFamily(font: Pick<StoredReaderFontSummary, 'family' | 'category'>): string {
    return `"${font.family.replaceAll('"', '')}", ${fontFallback(font.category)}`
}

function isSupportedFontFileName(fileName: string): boolean {
    const normalized = fileName.toLowerCase()
    return FONT_FILE_EXTENSIONS.some((extension) => normalized.endsWith(extension))
}

function hasFontMagic(data: ArrayBuffer): boolean {
    if (data.byteLength < 4) return false
    const bytes = new Uint8Array(data, 0, 4)
    const tag = String.fromCharCode(...bytes)
    return tag === 'OTTO'
        || tag === 'wOFF'
        || tag === 'wOF2'
        || tag === 'ttcf'
        || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)
}

async function assertStorageCapacity(sizeBytes: number): Promise<void> {
    if (!navigator.storage?.estimate) return
    try {
        const estimate = await navigator.storage.estimate()
        if (estimate.quota === undefined || estimate.usage === undefined) return
        if (estimate.quota - estimate.usage < sizeBytes) {
            throw new Error('设备可用存储空间不足，无法保存该字体')
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes('存储空间不足')) throw error
    }
}

async function calculateSha256(data: ArrayBuffer): Promise<string | null> {
    if (!crypto.subtle) return null
    const digest = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function readFontIndex(): Promise<StoredReaderFontSummary[]> {
    const row = await db.settings.get(FONT_INDEX_KEY)
    if (!Array.isArray(row?.value)) return []
    return row.value.filter((font): font is StoredReaderFontSummary => (
        !!font
        && typeof font === 'object'
        && typeof (font as StoredReaderFontSummary).id === 'string'
        && typeof (font as StoredReaderFontSummary).family === 'string'
    ))
}

async function saveStoredFont(font: StoredReaderFont): Promise<StoredReaderFontSummary> {
    const { data, ...summary } = font
    await db.transaction('rw', db.settings, async () => {
        const current = await readFontIndex()
        const next = [summary, ...current.filter((item) => item.id !== summary.id)]
        await db.settings.put({ key: dataKey(summary.id), value: font })
        await db.settings.put({ key: FONT_INDEX_KEY, value: next })
    })
    await registerStoredReaderFont(font)
    return summary
}

export async function registerStoredReaderFont(font: StoredReaderFont): Promise<void> {
    if (typeof FontFace === 'undefined' || !document.fonts) return
    const previous = registeredFontFaces.get(font.id)
    if (previous) document.fonts.delete(previous)
    const face = new FontFace(font.family, font.data.slice(0), { style: 'normal', weight: '400' })
    await face.load()
    document.fonts.add(face)
    registeredFontFaces.set(font.id, face)
}

export async function loadStoredReaderFonts(): Promise<StoredReaderFontSummary[]> {
    const index = await readFontIndex()
    const loaded: StoredReaderFontSummary[] = []
    for (const summary of index) {
        const row = await db.settings.get(dataKey(summary.id))
        const font = row?.value as StoredReaderFont | undefined
        if (!font?.data || !hasFontMagic(font.data)) continue
        try {
            await registerStoredReaderFont(font)
            loaded.push(summary)
        } catch (error) {
            console.warn(`[ReaderFont] 无法恢复字体 ${summary.displayName}`, error)
        }
    }
    return loaded
}

export async function downloadReaderFont(item: ReaderFontCatalogItem): Promise<StoredReaderFontSummary> {
    await assertStorageCapacity(item.sizeBytes)
    const response = await fetch(item.url)
    if (!response.ok) throw new Error(`字体下载失败：HTTP ${response.status}`)
    const data = await response.arrayBuffer()
    if (data.byteLength !== item.sizeBytes) throw new Error('字体文件长度与清单不一致')
    if (!hasFontMagic(data)) throw new Error('下载内容不是有效字体文件')
    if (item.sha256) {
        const digest = await calculateSha256(data)
        if (digest && digest !== item.sha256.toLowerCase()) throw new Error('字体完整性校验失败')
    }
    void requestPersistentStorage()
    return saveStoredFont({
        id: `catalog-${item.id}`,
        displayName: item.displayName,
        family: item.family,
        category: item.category,
        format: item.format,
        sizeBytes: data.byteLength,
        source: 'catalog',
        catalogId: item.id,
        installedAt: Date.now(),
        data,
    })
}

export async function importReaderFont(file: File): Promise<StoredReaderFontSummary> {
    if (!isSupportedFontFileName(file.name)) throw new Error('仅支持 TTF、OTF、WOFF 和 WOFF2 字体')
    await assertStorageCapacity(file.size)
    const data = await file.arrayBuffer()
    if (!hasFontMagic(data)) throw new Error('所选文件不是有效字体文件')
    const baseName = file.name.replace(/\.(otf|ttf|woff2?)$/i, '').trim() || '自定义字体'
    const id = `import-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
    void requestPersistentStorage()
    return saveStoredFont({
        id,
        displayName: baseName,
        family: `Vitra User Font ${id}`,
        category: 'serif',
        format: file.name.split('.').pop()?.toLowerCase() ?? 'font',
        sizeBytes: data.byteLength,
        source: 'import',
        installedAt: Date.now(),
        data,
    })
}

export async function removeStoredReaderFont(fontId: string): Promise<void> {
    await db.transaction('rw', db.settings, async () => {
        const current = await readFontIndex()
        await db.settings.delete(dataKey(fontId))
        await db.settings.put({ key: FONT_INDEX_KEY, value: current.filter((font) => font.id !== fontId) })
    })
    const face = registeredFontFaces.get(fontId)
    if (face && document.fonts) document.fonts.delete(face)
    registeredFontFaces.delete(fontId)
}
