const FONT_NAME_TO_CSS = Object.freeze({
    微软雅黑: 'Microsoft YaHei',
    '微软雅黑 UI': 'Microsoft YaHei UI',
    宋体: 'SimSun',
    黑体: 'SimHei',
    楷体: 'KaiTi',
    仿宋: 'FangSong',
    新宋体: 'NSimSun',
    微软正黑体: 'Microsoft JhengHei',
    '微软正黑体 UI': 'Microsoft JhengHei UI',
    等线: 'DengXian',
    仿宋_GB2312: 'FangSong_GB2312',
    楷体_GB2312: 'KaiTi_GB2312',
} as const)

const CSS_NAME_TO_DISPLAY = Object.freeze(
    Object.fromEntries(Object.entries(FONT_NAME_TO_CSS).map(([display, css]) => [css, display]))
)

export function toReaderFontFamily(fontName: string): string {
    if (fontName === '系统默认') return 'inherit'
    const cssName = FONT_NAME_TO_CSS[fontName as keyof typeof FONT_NAME_TO_CSS] || fontName
    return `"${cssName}", sans-serif`
}

export function toReaderFontDisplayName(fontFamily: string): string {
    if (fontFamily === 'inherit') return '系统默认'
    const match = fontFamily.match(/^"?([^",]+)"?/)
    if (!match) return '系统默认'
    const cssName = match[1].trim()
    return CSS_NAME_TO_DISPLAY[cssName as keyof typeof CSS_NAME_TO_DISPLAY] || cssName
}
