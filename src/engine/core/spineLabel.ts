export function buildSpineFallbackLabel(href: string, index: number): string {
    const fallback = `Chapter ${index + 1}`
    if (!href) return fallback

    const [pathPart] = href.split('#', 2)
    const fileName = pathPart.split('/').pop() || ''
    const decoded = decodeUriComponentSafe(fileName)
    const withoutExtension = decoded.replace(/\.[^.]+$/, '')
    const cleaned = withoutExtension
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    return cleaned || fallback
}

function decodeUriComponentSafe(value: string): string {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}
