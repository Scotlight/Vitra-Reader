import { contrastRatio } from './readerTheme'

interface ReaderColorInput {
    customBgColor?: string | null
    customTextColor?: string | null
    themeId: string
}

export interface ReaderColors {
    bgColor: string
    textColor: string
}

const FALLBACK_BY_THEME: Record<string, ReaderColors> = {
    light: { textColor: '#1a1a1a', bgColor: '#ffffff' },
    dark: { textColor: '#e0e0e0', bgColor: '#16213e' },
    sepia: { textColor: '#5b4636', bgColor: '#f4ecd8' },
    green: { textColor: '#2d4a3e', bgColor: '#c7edcc' },
}

export function resolveReaderColors({
    customBgColor,
    customTextColor,
    themeId,
}: ReaderColorInput): ReaderColors {
    const base = FALLBACK_BY_THEME[themeId] || FALLBACK_BY_THEME.light
    const candidateText = customTextColor || base.textColor
    const bgColor = customBgColor || base.bgColor
    const textColor = customTextColor
        ? candidateText
        : (contrastRatio(candidateText, bgColor) < 3 ? (themeId === 'dark' ? '#e0e0e0' : '#1a1a1a') : candidateText)

    return { textColor, bgColor }
}
