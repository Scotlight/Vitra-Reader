const MOBI_ENCODING_CP1252 = 1252
const MOBI_ENCODING_UTF8 = 65001
const HTML_TAG_PATTERN = /<\/?[a-zA-Z][^>]{0,120}>/g
const CJK_PATTERN = /[\u3000-\u303F\u3400-\u4DBF\u4e00-\u9fff\uF900-\uFAFF]/g
const MOJIBAKE_PATTERN = /[ÃÂæçï¼]/g
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

interface DecodeQuality {
    replacements: number
    mojibake: number
    htmlTags: number
    cjk: number
}

function evaluateDecodeQuality(text: string): DecodeQuality {
    return {
        replacements: (text.match(/\uFFFD/g) || []).length,
        mojibake: (text.match(MOJIBAKE_PATTERN) || []).length,
        htmlTags: (text.match(HTML_TAG_PATTERN) || []).length,
        cjk: (text.match(CJK_PATTERN) || []).length,
    }
}

function isBetterDecode(next: DecodeQuality, current: DecodeQuality): boolean {
    if (next.replacements !== current.replacements) return next.replacements < current.replacements
    if (next.mojibake !== current.mojibake) return next.mojibake < current.mojibake
    if (next.htmlTags !== current.htmlTags) return next.htmlTags > current.htmlTags
    if (next.cjk !== current.cjk) return next.cjk > current.cjk
    return false
}

function needsRecoveryProbe(quality: DecodeQuality): boolean {
    if (quality.replacements > 0) return true
    if (quality.mojibake > 12) return true
    return quality.htmlTags < 3
}

function recoverByCandidateEncodings(data: Uint8Array, primary: string, encodingCode: number): string {
    const candidates = new Set<string>(['utf-8', 'gb18030', 'gbk', 'big5', 'windows-1252'])
    const preferred = resolveMobiEncoding(encodingCode)
    candidates.delete(preferred)

    let bestText = primary
    let bestQuality = evaluateDecodeQuality(primary)
    for (const encoding of candidates) {
        const decoded = decodeWithEncoding(data, encoding)
        if (!decoded) continue
        const quality = evaluateDecodeQuality(decoded)
        if (isBetterDecode(quality, bestQuality)) {
            bestText = decoded
            bestQuality = quality
        }
    }
    return bestText
}

export function decodeMobiText(data: Uint8Array, encodingCode: number): string {
    const preferred = resolveMobiEncoding(encodingCode)
    const utf8Loose = new TextDecoder('utf-8').decode(data)
    const primary = decodeWithEncoding(data, preferred) ?? utf8Loose
    const primaryQuality = evaluateDecodeQuality(primary)

    if (encodingCode !== MOBI_ENCODING_CP1252) {
        if (needsRecoveryProbe(primaryQuality)) {
            return recoverByCandidateEncodings(data, primary, encodingCode)
        }
        return primary
    }

    // CP1252 声明但实际可能是 UTF-8（中文 Mobi 常见）
    const utf8 = decodeWithEncoding(data, 'utf-8') ?? utf8Loose

    // 如果 CP1252 解码产生了 replacement character，直接倾向 UTF-8
    const primaryReplacements = (primary.match(/\uFFFD/g) || []).length
    if (primaryReplacements > 0 && utf8 !== primary) return utf8

    // CJK 检测范围：基本汉字 + 扩展A + 全角标点 + 兼容汉字
    const primaryCjk = (primary.match(CJK_PATTERN) || []).length
    const utf8Cjk = (utf8.match(CJK_PATTERN) || []).length
    const primaryMojibake = (primary.match(MOJIBAKE_PATTERN) || []).length
    const utf8Mojibake = (utf8.match(MOJIBAKE_PATTERN) || []).length
    if (utf8Cjk > primaryCjk * 2 && utf8Mojibake <= primaryMojibake) {
        return needsRecoveryProbe(evaluateDecodeQuality(utf8))
            ? recoverByCandidateEncodings(data, utf8, encodingCode)
            : utf8
    }
    return needsRecoveryProbe(primaryQuality)
        ? recoverByCandidateEncodings(data, primary, encodingCode)
        : primary
}
