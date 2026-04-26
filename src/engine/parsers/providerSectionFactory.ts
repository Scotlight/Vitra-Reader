import type {
    ContentProvider,
    SpineItemInfo,
} from '../core/contentProvider'
import { upsertChapterIndex } from '../cache/searchIndexCache'
import type {
    VitraBookFormat,
    VitraBookSection,
} from '../types/vitraBook'
import { cleanChapterHtmlForFormat } from '../render/chapterHtmlCleanup'

export interface ProviderSectionFactoryResult {
    readonly sections: readonly VitraBookSection[]
    readonly releaseAll: () => void
}

interface ProviderSectionCaches {
    readonly html: Map<number, string>
    readonly size: Map<number, number>
    readonly styles: Map<number, readonly string[]>
}

interface ProviderSectionFactoryInput {
    readonly spineItems: readonly SpineItemInfo[]
    readonly provider: ContentProvider
    readonly bookId: string
    readonly format: VitraBookFormat
}

export function createProviderSections(
    input: ProviderSectionFactoryInput,
): ProviderSectionFactoryResult {
    const caches: ProviderSectionCaches = {
        html: new Map(),
        size: new Map(),
        styles: new Map(),
    }

    const releaseSection = (spineIndex: number): void => {
        caches.html.delete(spineIndex)
        caches.size.delete(spineIndex)
        caches.styles.delete(spineIndex)
        input.provider.unloadChapter(spineIndex)
    }

    const sections = input.spineItems.map((spine) => createProviderSection({
        spine,
        input,
        caches,
        releaseSection,
    }))

    return {
        sections,
        releaseAll: () => {
            Array.from(caches.html.keys()).forEach((spineIndex) => releaseSection(spineIndex))
        },
    }
}

interface CreateProviderSectionInput {
    readonly spine: SpineItemInfo
    readonly input: ProviderSectionFactoryInput
    readonly caches: ProviderSectionCaches
    readonly releaseSection: (spineIndex: number) => void
}

function createProviderSection({
    spine,
    input,
    caches,
    releaseSection,
}: CreateProviderSectionInput): VitraBookSection {
    return {
        id: spine.id || spine.index,
        href: spine.href,
        linear: spine.linear,
        get size() {
            return caches.size.get(spine.index) ?? 0
        },
        load: () => loadProviderSection(spine, input, caches),
        unload: () => releaseSection(spine.index),
        get styles() {
            return caches.styles.get(spine.index) ?? []
        },
    }
}

async function loadProviderSection(
    spine: SpineItemInfo,
    input: ProviderSectionFactoryInput,
    caches: ProviderSectionCaches,
): Promise<string> {
    const cached = caches.html.get(spine.index)
    if (cached) return cached

    const rawHtml = await input.provider.extractChapterHtml(spine.index)
    const html = cleanChapterHtmlForFormat(rawHtml, input.format)
    caches.html.set(spine.index, html)
    caches.size.set(spine.index, new Blob([html]).size)

    if (!caches.styles.has(spine.index)) {
        const styles = await input.provider.extractChapterStyles(spine.index)
        caches.styles.set(spine.index, styles)
    }

    upsertChapterIndex(input.bookId, spine.index, html)
    return html
}
