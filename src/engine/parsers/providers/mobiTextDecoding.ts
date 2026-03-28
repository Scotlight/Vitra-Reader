const MOBI_ENCODING_CP1252 = 1252
const MOBI_ENCODING_UTF8 = 65001
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
    cjk: number
}

function evaluateDecodeQuality(text: string): DecodeQuality {
    return {
        replacements: (text.match(/\uFFFD/g) || []).length,
        mojibake: (text.match(MOJIBAKE_PATTERN) || []).length,
        cjk: (text.match(CJK_PATTERN) || []).length,
    }
}

function chooseBetterQuality(
    leftText: string,
    rightText: string,
): string {
    const left = evaluateDecodeQuality(leftText)
    const right = evaluateDecodeQuality(rightText)
    if (left.replacements !== right.replacements) return left.replacements < right.replacements ? leftText : rightText
    if (left.mojibake !== right.mojibake) return left.mojibake < right.mojibake ? leftText : rightText
    if (left.cjk !== right.cjk) return left.cjk > right.cjk ? leftText : rightText
    return leftText
}

function tryRecoverDeclaredNonCp1252(
    data: Uint8Array,
    primary: string,
    preferredEncoding: string,
): string {
    const primaryQuality = evaluateDecodeQuality(primary)
    const shouldProbe =
        primaryQuality.replacements > 0
        || primaryQuality.mojibake >= 16
        || (primaryQuality.cjk <= 4 && primaryQuality.mojibake >= 8)
    if (!shouldProbe) return primary

    const candidates = ['gb18030', 'gbk', 'big5', 'windows-1252', 'utf-8']
        .filter((encoding) => encoding !== preferredEncoding)
        .map((encoding) => decodeWithEncoding(data, encoding))
        .filter((text): text is string => Boolean(text))
    if (candidates.length === 0) return primary

    let best = primary
    for (const candidate of candidates) {
        best = chooseBetterQuality(best, candidate)
    }

    const bestQuality = evaluateDecodeQuality(best)
    const clearlyBetter =
        bestQuality.replacements + 2 <= primaryQuality.replacements
        || (
            bestQuality.replacements <= primaryQuality.replacements
            && bestQuality.mojibake + 6 <= primaryQuality.mojibake
            && bestQuality.cjk >= primaryQuality.cjk + 12
        )

    return clearlyBetter ? best : primary
}

export function decodeMobiText(data: Uint8Array, encodingCode: number): string {
    const preferred = resolveMobiEncoding(encodingCode)
    const utf8Loose = new TextDecoder('utf-8').decode(data)
    const primary = decodeWithEncoding(data, preferred) ?? utf8Loose
    if (encodingCode !== MOBI_ENCODING_CP1252) {
        return tryRecoverDeclaredNonCp1252(data, primary, preferred)
    }

    // CP1252 声明但实际可能是 UTF-8（中文 Mobi 常见）
    const utf8 = decodeWithEncoding(data, 'utf-8') ?? utf8Loose
    const gb18030 = decodeWithEncoding(data, 'gb18030')
    const gbk = decodeWithEncoding(data, 'gbk')
    const gbCandidate = gb18030 && gbk
        ? chooseBetterQuality(gb18030, gbk)
        : (gb18030 ?? gbk)

    const primaryQuality = evaluateDecodeQuality(primary)
    const utf8Quality = evaluateDecodeQuality(utf8)
    const gbQuality = gbCandidate ? evaluateDecodeQuality(gbCandidate) : null

    // 如果 CP1252 解码产生了 replacement character，直接倾向 UTF-8
    if (primaryQuality.replacements > 0 && utf8 !== primary) return utf8

    // CJK 检测范围：基本汉字 + 扩展A + 全角标点 + 兼容汉字
    if (utf8Quality.cjk > primaryQuality.cjk * 2
        && utf8Quality.mojibake <= primaryQuality.mojibake
        && utf8Quality.replacements <= primaryQuality.replacements) {
        return utf8
    }

    if (gbCandidate && gbQuality) {
        const gbCjkRescue =
            primaryQuality.cjk === 0
            && utf8Quality.replacements > 0
            && gbQuality.cjk >= 2
            && gbQuality.replacements <= utf8Quality.replacements

        if (gbCjkRescue) return gbCandidate

        const gbClearlyBetter =
            gbQuality.replacements <= Math.min(primaryQuality.replacements, utf8Quality.replacements)
            && gbQuality.mojibake <= Math.min(primaryQuality.mojibake, utf8Quality.mojibake)
            && gbQuality.cjk >= Math.max(primaryQuality.cjk, utf8Quality.cjk) + 8

        if (gbClearlyBetter) return gbCandidate
    }

    return primary
}
