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

interface ScrollSmoothSettings {
    smoothAccelerationDeltaMs: number
    smoothAccelerationMax: number
    smoothAnimationEasing: boolean
    smoothAnimationTimeMs: number
    smoothReverseWheelDirection: boolean
    smoothScrollEnabled: boolean
    smoothStepSizePx: number
    smoothTailToHeadRatio: number
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

export function buildScrollSmoothConfig(settings: ScrollSmoothSettings) {
    return {
        enabled: settings.smoothScrollEnabled,
        stepSizePx: settings.smoothStepSizePx,
        animationTimeMs: settings.smoothAnimationTimeMs,
        accelerationDeltaMs: settings.smoothAccelerationDeltaMs,
        accelerationMax: settings.smoothAccelerationMax,
        tailToHeadRatio: settings.smoothTailToHeadRatio,
        easing: settings.smoothAnimationEasing,
        reverseWheelDirection: settings.smoothReverseWheelDirection,
    }
}
