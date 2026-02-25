const DEFAULT_FONT_FALLBACK_STACK = [
    '"Segoe UI"',
    '"Microsoft YaHei"',
    '"PingFang SC"',
    '"Hiragino Sans GB"',
    '"Noto Sans CJK SC"',
    '"Noto Sans SC"',
    '"Source Han Sans SC"',
    '"WenQuanYi Micro Hei"',
    '"Arial Unicode MS"',
    '"Segoe UI Emoji"',
    '"Apple Color Emoji"',
    '"Noto Color Emoji"',
    'sans-serif',
]

function normalizeToken(token: string): string {
    return token.trim().replace(/^['"]|['"]$/g, '')
}

function splitFontFamily(fontFamily: string): string[] {
    return fontFamily
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean)
}

export function buildFontFamilyWithFallback(fontFamily: string): string {
    const primaryTokens = splitFontFamily(fontFamily)
    const normalizedPrimary = primaryTokens
        .map((token) => normalizeToken(token).toLowerCase())
        .filter(Boolean)

    const result: string[] = []
    const normalizedResult = new Set<string>()
    const pushUnique = (token: string) => {
        const normalized = normalizeToken(token).toLowerCase()
        if (!normalized || normalizedResult.has(normalized)) {
            return
        }
        result.push(token)
        normalizedResult.add(normalized)
    }

    if (primaryTokens.length > 0) {
        primaryTokens.forEach((token) => pushUnique(token))
    } else {
        pushUnique('system-ui')
    }

    DEFAULT_FONT_FALLBACK_STACK.forEach((token) => {
        const normalized = normalizeToken(token).toLowerCase()
        if (normalizedPrimary.includes(normalized) && normalizedResult.has(normalized)) return
        pushUnique(token)
    })
    return result.join(', ')
}
