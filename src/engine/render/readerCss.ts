import { buildFontFamilyWithFallback } from '../../utils/fontFallback'

export interface ReaderCssConfig {
    textColor: string
    bgColor: string
    fontSize: number
    fontFamily: string
    lineHeight: number
    paragraphSpacing: number
    letterSpacing: number
    textAlign: string
}

export interface ReaderCssOptions {
    scope: string
    applyColumns?: boolean
    columnWidthPx?: number
    columnGapPx?: number
    textIndentEm?: number
    isDark?: boolean
}

const DEFAULT_COLUMN_GAP_PX = 24
const DARK_IMAGE_FILTER = 'brightness(0.8)'
const INDENTABLE_BLOCK_TAGS = ['p', 'div', 'section', 'article', 'blockquote', 'aside', 'li'] as const
const NON_INDENTABLE_TAGS = [
    'img',
    'svg',
    'video',
    'audio',
    'canvas',
    'picture',
    'table',
    'pre',
    'code',
    'math',
    'figure',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
] as const

function buildScopedSelector(scope: string, tags: readonly string[]): string {
    return tags.map((tag) => `${scope} ${tag}`).join(',\n')
}

export function buildReaderCssTemplate(config: ReaderCssConfig, options: ReaderCssOptions): string {
    const scope = options.scope
    const resolvedFontFamily = buildFontFamilyWithFallback(config.fontFamily)
    const paragraphSpacingPx = Math.max(0, config.paragraphSpacing)
    const letterSpacingPx = Math.max(0, config.letterSpacing)
    const textIndentEm = Math.max(0, options.textIndentEm ?? 0)
    const columnGapPx = Math.max(0, Math.floor(options.columnGapPx ?? DEFAULT_COLUMN_GAP_PX))
    const columnWidthPx = Math.max(0, Math.floor(options.columnWidthPx ?? 0))
    const useColumns = Boolean(options.applyColumns && columnWidthPx > 0)
    const indentValue = textIndentEm > 0 ? `${textIndentEm}em` : '0'
    const indentableBlockSelector = buildScopedSelector(scope, INDENTABLE_BLOCK_TAGS)
    const nonIndentableSelector = buildScopedSelector(scope, NON_INDENTABLE_TAGS)
    const columnRules = useColumns ? `
${scope} {
  column-width: ${columnWidthPx}px;
  column-gap: ${columnGapPx}px;
  column-fill: auto;
}` : ''
    const darkImageRule = options.isDark ? `
${scope} img {
  filter: ${DARK_IMAGE_FILTER};
}` : ''

    return `
${scope} * { box-sizing: border-box; }
${scope} {
  margin: 0 !important;
  padding: 0 !important;
  font-family: var(--reader-font-family, ${resolvedFontFamily}) !important;
  font-size: var(--reader-font-size, ${config.fontSize}px) !important;
  line-height: var(--reader-line-height, ${config.lineHeight}) !important;
  letter-spacing: var(--reader-letter-spacing, ${letterSpacingPx}px) !important;
  text-align: var(--reader-text-align, ${config.textAlign}) !important;
  color: var(--reader-text-color, ${config.textColor}) !important;
  background: var(--reader-bg-color, ${config.bgColor}) !important;
  word-break: break-word;
  overflow-wrap: break-word;
}
${columnRules}
${indentableBlockSelector} {
  text-indent: ${indentValue};
}
${scope} p {
  margin: 0 0 var(--reader-paragraph-spacing, ${paragraphSpacingPx}px) 0;
}
${scope} div,
${scope} section,
${scope} article,
${scope} blockquote,
${scope} aside,
${scope} figure {
  margin-top: 0 !important;
  margin-bottom: var(--reader-paragraph-spacing, ${paragraphSpacingPx}px) !important;
}
${nonIndentableSelector} {
  text-indent: 0 !important;
}
${scope} h1,
${scope} h2,
${scope} h3,
${scope} h4,
${scope} h5,
${scope} h6 {
  page-break-after: avoid;
}
${scope} img,
${scope} svg {
  max-width: 100% !important;
  height: auto !important;
}
${darkImageRule}
`.trim()
}
