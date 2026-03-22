interface RgbColor {
    readonly r: number
    readonly g: number
    readonly b: number
}

export function contrastRatio(a: string, b: string): number {
    const left = hexToRgb(a)
    const right = hexToRgb(b)
    if (!left || !right) return 21
    const lighter = Math.max(luminance(left), luminance(right))
    const darker = Math.min(luminance(left), luminance(right))
    return (lighter + 0.05) / (darker + 0.05)
}

function hexToRgb(hex: string): RgbColor | null {
    const normalized = hex.trim().replace('#', '')
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null
    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16),
    }
}

function luminance({ r, g, b }: RgbColor): number {
    const linear = [r, g, b].map(toLinear)
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function toLinear(value: number): number {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}
