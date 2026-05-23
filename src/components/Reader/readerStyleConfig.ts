import type { BookFormat } from '@/engine/core/contentProvider'
import type { ReaderStyleConfig } from './ShadowRenderer'
import type { ReaderColors } from './readerColors'

interface ReaderStyleSettings {
    fontSize: number
    letterSpacing: number
    lineHeight: number
    pageWidth: number
    paragraphIndentEnabled: boolean
    paragraphSpacing: number
    textAlign: ReaderStyleConfig['textAlign']
    themeId: string
}

export function buildReaderStyleConfig(
    settings: ReaderStyleSettings,
    readerColors: ReaderColors,
    resolvedReaderFontFamily: string,
    bookFormat: BookFormat | null,
): ReaderStyleConfig {
    return {
        textColor: readerColors.textColor,
        bgColor: readerColors.bgColor,
        fontSize: settings.fontSize,
        fontFamily: resolvedReaderFontFamily,
        lineHeight: settings.lineHeight,
        paragraphSpacing: settings.paragraphSpacing,
        textIndentEm: settings.paragraphIndentEnabled ? 2 : 0,
        letterSpacing: settings.letterSpacing,
        textAlign: settings.textAlign,
        pageWidth: settings.pageWidth,
        isPdfDarkMode: bookFormat === 'pdf' && settings.themeId === 'dark',
    }
}
