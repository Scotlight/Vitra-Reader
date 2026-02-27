const UTF8_BOM = [0xEF, 0xBB, 0xBF]
const UTF16LE_BOM = [0xFF, 0xFE]
const UTF16BE_BOM = [0xFE, 0xFF]

const PROFILE_CANDIDATES: Record<DecodeProfile, readonly string[]> = {
    txt: ['utf-8', 'gb18030', 'gbk', 'big5', 'windows-1252', 'utf-16le', 'utf-16be'],
    html: ['utf-8', 'gb18030', 'gbk', 'big5', 'windows-1252', 'windows-1251'],
    md: ['utf-8', 'gb18030', 'gbk', 'big5', 'windows-1252'],
    fb2: ['utf-8', 'windows-1251', 'gb18030', 'gbk', 'windows-1252'],
    css: ['utf-8', 'gb18030', 'gbk', 'big5', 'windows-1252', 'windows-1251', 'shift_jis', 'euc-kr'],
}

export type DecodeProfile = 'txt' | 'html' | 'md' | 'fb2' | 'css'

export interface DecodeResult {
    text: string
    encoding: string
}

export function decodeTextBuffer(data: ArrayBuffer, profile: DecodeProfile): DecodeResult {
    const bytes = new Uint8Array(data)
    const headAscii = new TextDecoder('ascii').decode(bytes.slice(0, 4096))
    const candidates = uniqueEncodings([
        detectBomEncoding(bytes),
        detectDeclaredEncoding(headAscii),
        ...PROFILE_CANDIDATES[profile],
    ])

    for (const encoding of candidates) {
        const decoded = decodeWithEncoding(bytes, encoding)
        if (decoded === null) continue
        if (encoding !== 'utf-8') {
            console.warn(`[TextDecoding] using ${encoding} for ${profile}`)
        }
        return { text: decoded, encoding }
    }

    return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8' }
}

function uniqueEncodings(raw: Array<string | null>): string[] {
    const set = new Set<string>()
    for (const item of raw) {
        if (!item) continue
        const normalized = normalizeEncoding(item)
        if (normalized) set.add(normalized)
    }
    return Array.from(set)
}

function decodeWithEncoding(bytes: Uint8Array, encoding: string): string | null {
    try {
        return new TextDecoder(encoding, { fatal: true }).decode(bytes)
    } catch {
        return null
    }
}

function detectBomEncoding(bytes: Uint8Array): string | null {
    if (matchesPrefix(bytes, UTF8_BOM)) return 'utf-8'
    if (matchesPrefix(bytes, UTF16LE_BOM)) return 'utf-16le'
    if (matchesPrefix(bytes, UTF16BE_BOM)) return 'utf-16be'
    return null
}

function detectDeclaredEncoding(headAscii: string): string | null {
    const cssMatch = headAscii.match(/@charset\s+["']([^"']+)["']/i)
    if (cssMatch?.[1]) return cssMatch[1]

    const xmlMatch = headAscii.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i)
    if (xmlMatch?.[1]) return xmlMatch[1]

    const htmlMetaMatch = headAscii.match(/<meta[^>]+charset\s*=\s*["']?\s*([a-zA-Z0-9._-]+)/i)
    if (htmlMetaMatch?.[1]) return htmlMetaMatch[1]

    const contentTypeMatch = headAscii.match(/content-type[^>]+charset\s*=\s*([a-zA-Z0-9._-]+)/i)
    if (contentTypeMatch?.[1]) return contentTypeMatch[1]

    return null
}

function normalizeEncoding(value: string): string | null {
    const key = value.trim().toLowerCase()
    if (!key) return null

    const aliasMap: Record<string, string> = {
        utf8: 'utf-8',
        'utf-16': 'utf-16le',
        gb2312: 'gbk',
        'gb_2312-80': 'gbk',
        cp936: 'gbk',
        'x-gbk': 'gbk',
        'gb18030-2000': 'gb18030',
        cp1252: 'windows-1252',
        'windows1252': 'windows-1252',
        cp1251: 'windows-1251',
        'windows1251': 'windows-1251',
        'shift-jis': 'shift_jis',
        'x-sjis': 'shift_jis',
        'ks_c_5601-1987': 'euc-kr',
    }
    return aliasMap[key] ?? key
}

function matchesPrefix(bytes: Uint8Array, prefix: number[]): boolean {
    if (bytes.length < prefix.length) return false
    for (let i = 0; i < prefix.length; i += 1) {
        if (bytes[i] !== prefix[i]) return false
    }
    return true
}
