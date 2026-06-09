import { useMemo } from 'react'
import type { BookFormat } from '@/engine/core/contentProvider'
import type { ReaderSettings } from '@/stores/useSettingsStore'
import { buildFontFamilyWithFallback } from '@/utils/fontFallback'
import { resolveReaderColors } from './readerColors'
import { buildReaderStyleConfig } from './readerStyleConfig'

type ReaderAppearanceSettings = Pick<
    ReaderSettings,
    | 'customBgColor'
    | 'customTextColor'
    | 'fontFamily'
    | 'fontSize'
    | 'letterSpacing'
    | 'lineHeight'
    | 'pageWidth'
    | 'paragraphIndentEnabled'
    | 'paragraphSpacing'
    | 'textAlign'
    | 'themeId'
>

export function useReaderAppearance(settings: ReaderAppearanceSettings, bookFormat: BookFormat) {
    const resolvedReaderFontFamily = buildFontFamilyWithFallback(settings.fontFamily)
    const readerColors = useMemo(() => resolveReaderColors({
        customBgColor: settings.customBgColor,
        customTextColor: settings.customTextColor,
        themeId: settings.themeId,
    }), [settings.customBgColor, settings.customTextColor, settings.themeId])
    const readerStyleConfig = useMemo(() => buildReaderStyleConfig(
        {
            fontSize: settings.fontSize,
            letterSpacing: settings.letterSpacing,
            lineHeight: settings.lineHeight,
            pageWidth: settings.pageWidth,
            paragraphIndentEnabled: settings.paragraphIndentEnabled,
            paragraphSpacing: settings.paragraphSpacing,
            textAlign: settings.textAlign,
            themeId: settings.themeId,
        },
        readerColors,
        resolvedReaderFontFamily,
        bookFormat,
    ), [
        bookFormat,
        readerColors,
        resolvedReaderFontFamily,
        settings.fontSize,
        settings.lineHeight,
        settings.paragraphSpacing,
        settings.paragraphIndentEnabled,
        settings.letterSpacing,
        settings.textAlign,
        settings.pageWidth,
        settings.themeId,
    ])

    return {
        readerColors,
        readerStyleConfig,
        resolvedReaderFontFamily,
    }
}
