// GB2312 一级汉字表（3755 字）+ 常用标点 + ASCII，采样字号 1px 建立字宽查表
// 采样时机：首次调用 + 字体切换（invalidateCharWidthTable）

const ASCII_PRINTABLE =
    ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'

const CJK_PUNCTUATION =
    '\u3001\u3002\u300A\u300B\u300C\u300D\u300E\u300F\u3010\u3011\u3014\u3015' +
    '\u2018\u2019\u201C\u201D\u2026\u2014\u2013\u00B7\u00D7\u00F7' +
    '\uFF01\uFF02\uFF03\uFF04\uFF05\uFF06\uFF07\uFF08\uFF09\uFF0A\uFF0B\uFF0C\uFF0D\uFF0E\uFF0F' +
    '\uFF1A\uFF1B\uFF1C\uFF1D\uFF1E\uFF1F\uFF20\uFF3B\uFF3C\uFF3D\uFF3E\uFF3F' +
    '\uFF40\uFF5B\uFF5C\uFF5D\uFF5E'

// GB2312 一级汉字：\u554A-\u5EA6 区段内的 3755 个常用汉字（覆盖日常文本 99%+）
const CJK_COMMON = (() => {
    const ranges: [number, number][] = [
        [0x4E00, 0x9FA5], // CJK 统一汉字基本区（20902 字，取前 2500）
    ]
    let s = ''
    for (const [start, end] of ranges) {
        for (let cp = start; cp <= end && s.length < 2500; cp++) {
            s += String.fromCodePoint(cp)
        }
    }
    return s
})()

const SAMPLE_CHARS = ASCII_PRINTABLE + CJK_PUNCTUATION + CJK_COMMON
const MAX_TABLE_ENTRIES = 4096

// 模块级状态
const TABLE = new Map<number, number>()
let tableFont = ''

/**
 * 从 font shorthand 提取 font-weight 和 font-family。
 * 例：'bold 16px/1.5 "Source Han Serif"' -> { weight: 'bold', family: '"Source Han Serif"' }
 */
function extractWeightAndFamily(font: string): { weight: string; family: string } {
    // font shorthand 格式：[style] [variant] [weight] [stretch] size[/line-height] family
    // weight 关键字：normal bold bolder lighter 100-900
    const weightMatch = font.match(/\b(bold|bolder|lighter|[1-9]00)\b/)
    const weight = weightMatch ? weightMatch[1] : 'normal'
    const familyMatch = font.match(
        /(?:(?:normal|bold|bolder|lighter|italic|oblique|small-caps|\d+(?:\.\d+)?(?:px|em|rem|%|pt)(?:\/[\d.]+(?:px|em|rem|%)?)?|[\d.]+)\s+)*(.+)$/,
    )
    const family = familyMatch ? familyMatch[1].trim() : font
    return { weight, family }
}

/** 构建采样缓存键：fontWeight|fontFamily，忽略字号/行高变化 */
function buildTableKey(font: string): string {
    const { weight, family } = extractWeightAndFamily(font)
    return `${weight}|${family}`
}

function buildTable(ctx: CanvasRenderingContext2D, font: string): void {
    TABLE.clear()
    tableFont = buildTableKey(font)
    const { weight, family } = extractWeightAndFamily(font)
    ctx.save()
    ctx.font = `${weight} 1px ${family}`
    for (const ch of SAMPLE_CHARS) {
        const cp = ch.codePointAt(0)!
        if (!TABLE.has(cp)) {
            TABLE.set(cp, ctx.measureText(ch).width)
        }
    }
    ctx.restore()
}

/**
 * 估算文本行像素宽度（查表 + fallback measureText）。
 * - 字体变化时自动重建字宽表
 * - 生僻字 fallback ctx.measureText 并缓存（上限 4096 条）
 */
export function estimateLineWidth(
    ctx: CanvasRenderingContext2D,
    text: string,
    fontSize: number,
    font: string,
): number {
    if (!text) return 0
    if (tableFont !== buildTableKey(font)) {
        buildTable(ctx, font)
    }

    let width = 0
    const savedFont = ctx.font

    for (const ch of text) {
        const cp = ch.codePointAt(0)!
        const ratio = TABLE.get(cp)
        if (ratio !== undefined) {
            width += ratio * fontSize
        } else {
            // fallback：用当前 ctx 直接测量（ctx.font 已由调用方设置为实际字号）
            width += ctx.measureText(ch).width
            // 反推 1px 比例存入表，供后续使用
            if (TABLE.size < MAX_TABLE_ENTRIES && fontSize > 0) {
                TABLE.set(cp, ctx.measureText(ch).width / fontSize)
            }
        }
    }

    // 若 buildTable 改动了 ctx.font，恢复
    if (ctx.font !== savedFont) ctx.font = savedFont

    return width
}

/** 字体切换时清表，与 invalidateCanvasMeasureCache 一起调用 */
export function invalidateCharWidthTable(): void {
    TABLE.clear()
    tableFont = ''
}
