import { buildFontFamilyWithFallback } from '@/utils/fontFallback'

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
const TEXT_INDENT_RESET_SELECTORS = [
    'img',
    'svg',
    'video',
    'audio',
    'canvas',
    'picture',
    'figure',
    'figure *',
    'figcaption',
    'table',
    'table *',
    'pre',
    'pre *',
    'code',
    'code *',
    'math',
    'math *',
    'h1',
    'h1 *',
    'h2',
    'h2 *',
    'h3',
    'h3 *',
    'h4',
    'h4 *',
    'h5',
    'h5 *',
    'h6',
    'h6 *',
    'hr',
    'br',
    'button',
    'button *',
    'input',
    'textarea',
    'select',
    'option',
    'label',
    'iframe',
    'embed',
    'object',
] as const
const PARAGRAPH_MARGIN_SELECTORS = ['p', 'div', 'section', 'article', 'blockquote', 'aside', 'figure'] as const

function buildScopedSelector(scope: string, selectors: readonly string[]): string {
    return selectors.map((selector) => `${scope} ${selector}`).join(',\n')
}

function buildIndentTargetSelector(scope: string): string {
    return `${scope},
${scope} *`
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
    const indentTargetSelector = buildIndentTargetSelector(scope)
    const indentResetSelector = buildScopedSelector(scope, TEXT_INDENT_RESET_SELECTORS)
    const paragraphMarginSelector = buildScopedSelector(scope, PARAGRAPH_MARGIN_SELECTORS)
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
${indentTargetSelector} {
  text-indent: ${indentValue};
}
${scope} p {
  margin: 0 0 var(--reader-paragraph-spacing, ${paragraphSpacingPx}px) 0;
}
${paragraphMarginSelector} {
  margin-top: 0 !important;
  margin-bottom: var(--reader-paragraph-spacing, ${paragraphSpacingPx}px) !important;
}
${indentResetSelector} {
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
