import type { BookFormat } from './contentProvider'
import type { PageTurnMode } from '../../stores/useSettingsStore'

type ReaderRenderProfile = 'reflowable' | 'fixed-layout' | 'scroll-only'

const REFLOWABLE_MODES: readonly PageTurnMode[] = ['paginated-single', 'paginated-double', 'scrolled-continuous']
const FIXED_LAYOUT_MODES: readonly PageTurnMode[] = ['paginated-single']
const SCROLL_ONLY_MODES: readonly PageTurnMode[] = ['scrolled-continuous']
const SCROLL_ONLY_FORMATS = new Set<string>(['pdf'])
const FIXED_LAYOUT_FORMATS = new Set<string>(['djvu', 'cbz', 'cbt', 'cbr', 'cb7'])

export interface ReaderRenderModeDecision {
    requestedMode: PageTurnMode
    effectiveMode: PageTurnMode
    availableModes: readonly PageTurnMode[]
    profile: ReaderRenderProfile
    forced: boolean
    reason: string
}

function resolveRenderProfile(format: BookFormat | string): ReaderRenderProfile {
    const f = format.toLowerCase()
    if (SCROLL_ONLY_FORMATS.has(f)) return 'scroll-only'
    if (FIXED_LAYOUT_FORMATS.has(f)) return 'fixed-layout'
    return 'reflowable'
}

function resolveAvailableModes(profile: ReaderRenderProfile): readonly PageTurnMode[] {
    if (profile === 'scroll-only') return SCROLL_ONLY_MODES
    if (profile === 'fixed-layout') return FIXED_LAYOUT_MODES
    return REFLOWABLE_MODES
}

function pickEffectiveMode(availableModes: readonly PageTurnMode[], requestedMode: PageTurnMode): PageTurnMode {
    if (availableModes.includes(requestedMode)) return requestedMode
    return availableModes[0]
}

function buildReason(profile: ReaderRenderProfile, forced: boolean): string {
    if (!forced) return '当前格式支持当前阅读模式'
    if (profile === 'scroll-only') return '当前 PDF 渲染仅支持连续滚动'
    if (profile === 'fixed-layout') return '当前格式为固定布局，仅支持单页渲染'
    return '当前格式模式受限，已切换为兼容渲染模式'
}

export function resolveReaderRenderMode(format: BookFormat | string, requestedMode: PageTurnMode): ReaderRenderModeDecision {
    const profile = resolveRenderProfile(format)
    const availableModes = resolveAvailableModes(profile)
    const effectiveMode = pickEffectiveMode(availableModes, requestedMode)
    const forced = effectiveMode !== requestedMode
    return {
        requestedMode,
        effectiveMode,
        availableModes,
        profile,
        forced,
        reason: buildReason(profile, forced),
    }
}
