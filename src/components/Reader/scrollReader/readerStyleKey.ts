import type { ReaderStyleConfig } from '../ShadowRenderer';

export function buildReaderStyleKey(readerStyles: ReaderStyleConfig): string {
    return [
        `fontSize=${readerStyles.fontSize}`,
        `pageWidth=${readerStyles.pageWidth}`,
        `lineHeight=${readerStyles.lineHeight}`,
        `paragraphSpacing=${readerStyles.paragraphSpacing}`,
        `textIndentEm=${readerStyles.textIndentEm}`,
        `letterSpacing=${readerStyles.letterSpacing}`,
        `textAlign=${readerStyles.textAlign}`,
        `fontFamily=${encodeURIComponent(readerStyles.fontFamily)}`,
        `textColor=${readerStyles.textColor}`,
        `bgColor=${readerStyles.bgColor}`,
        `isPdfDarkMode=${readerStyles.isPdfDarkMode ? '1' : '0'}`,
    ].join('|');
}
