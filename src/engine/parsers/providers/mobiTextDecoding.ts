const MOBI_ENCODING_CP1252 = 1252
const MOBI_ENCODING_UTF8 = 65001
const MOBI_ENCODING_MAP: Readonly<Record<number, string>> = {
    [MOBI_ENCODING_UTF8]: 'utf-8',
    [MOBI_ENCODING_CP1252]: 'windows-1252',
    936: 'gbk',
    950: 'big5',
    932: 'shift_jis',
    949: 'euc-kr',
    1200: 'utf-16le',
    1201: 'utf-16be',
    1250: 'windows-1250',
    1251: 'windows-1251',
    1253: 'windows-1253',
    1254: 'windows-1254',
    1255: 'windows-1255',
    1256: 'windows-1256',
    1257: 'windows-1257',
    1258: 'windows-1258',
    54936: 'gb18030',
}

function resolveMobiEncoding(code: number): string {
    const mapped = MOBI_ENCODING_MAP[code]
    if (mapped) return mapped
    console.warn(`[MOBI] Unknown text encoding code ${code}, fallback to utf-8`)
    return 'utf-8'
}

function decodeWithEncoding(data: Uint8Array, encoding: string): string | null {
    try {
        return new TextDecoder(encoding, { fatal: true }).decode(data)
    } catch {
        return null
    }
}

export function decodeMobiText(data: Uint8Array, encodingCode: number): string {
    const preferred = resolveMobiEncoding(encodingCode)
    const primary = decodeWithEncoding(data, preferred) ?? new TextDecoder('utf-8').decode(data)
    if (encodingCode !== MOBI_ENCODING_CP1252) return primary

    // CP1252 声明但实际可能是 UTF-8（中文 Mobi 常见）
    const utf8 = decodeWithEncoding(data, 'utf-8') ?? primary

    // 如果 CP1252 解码产生了 replacement character，直接倾向 UTF-8
    const primaryReplacements = (primary.match(/\uFFFD/g) || []).length
    if (primaryReplacements > 0 && utf8 !== primary) return utf8

    // CJK 检测范围：基本汉字 + 扩展A + 全角标点 + 兼容汉字
    const cjkPattern = /[\u3000-\u303F\u3400-\u4DBF\u4e00-\u9fff\uF900-\uFAFF]/g
    const primaryCjk = (primary.match(cjkPattern) || []).length
    const utf8Cjk = (utf8.match(cjkPattern) || []).length
    const primaryMojibake = (primary.match(/[ÃÂæçï¼]/g) || []).length
    const utf8Mojibake = (utf8.match(/[ÃÂæçï¼]/g) || []).length
    if (utf8Cjk > primaryCjk && utf8Mojibake <= primaryMojibake) return utf8
    return primary
}
