// Placeholder: Theme service will manage CSS variable updates at runtime
// This file will contain applyTheme(), applyCustomColor(), and preset management

export const BG_PRESETS = [
    '#FFFFFF', '#1E1E1E', '#EAD8B1', '#C7E9C0',
    '#2C5364', '#7FD8BE', '#9B7246', '#87CEEB',
]

export const TEXT_PRESETS = [
    '#000000', '#FFFFFF', '#5D4037', '#2D4A3E',
    '#003366', '#E0F7FA', '#8D6E63', '#40E0D0',
]

export function applyCustomColor(bgColor: string, textColor: string): void {
    const root = document.documentElement
    root.style.setProperty('--reader-bg', bgColor)
    root.style.setProperty('--reader-text', textColor)
}

export function applyThemeById(themeId: string): void {
    document.documentElement.setAttribute('data-theme', themeId)
}

export function applyUIAppearance(blur: number, opacity: number, roundness: number): void {
    const root = document.documentElement
    root.style.setProperty('--ui-blur', `${blur}px`)
    root.style.setProperty('--ui-opacity', String(opacity))
    root.style.setProperty('--ui-roundness', `${roundness}px`)
}
