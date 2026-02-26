import type { BookFormat } from './contentProvider'
import type { PageTurnMode } from '../stores/useSettingsStore'

type ReaderRenderProfile = 'reflowable' | 'fixed-layout'

/** 兼容旧 BookFormat 和 VitraBookFormat 的格式字符串 */
type AnyFormatString = BookFormat | string

const REFLOWABLE_MODES: readonly PageTurnMode[] = ['paginated-single', 'paginated-double', 'scrolled-continuous']
const FIXED_LAYOUT_MODES: readonly PageTurnMode[] = ['paginated-single']
const FIXED_LAYOUT_FORMATS = new Set<string>(['pdf', 'PDF', 'djvu', 'DJVU'])

export interface ReaderRenderModeDecision {
    requestedMode: PageTurnMode
    effectiveMode: PageTurnMode
    availableModes: readonly PageTurnMode[]
    profile: ReaderRenderProfile
    forced: boolean
    reason: string
}

function resolveRenderProfile(format: AnyFormatString): ReaderRenderProfile {
    if (FIXED_LAYOUT_FORMATS.has(format)) return 'fixed-layout'
    return 'reflowable'
}

function resolveAvailableModes(profile: ReaderRenderProfile): readonly PageTurnMode[] {
    if (profile === 'fixed-layout') return FIXED_LAYOUT_MODES
    return REFLOWABLE_MODES
}

function pickEffectiveMode(availableModes: readonly PageTurnMode[], requestedMode: PageTurnMode): PageTurnMode {
    if (availableModes.includes(requestedMode)) return requestedMode
    return availableModes[0]
}

function buildReason(profile: ReaderRenderProfile, forced: boolean): string {
    if (!forced) return '当前格式支持所有流式阅读模式'
    if (profile === 'fixed-layout') return '当前格式为固定布局，仅支持单页渲染'
    return '当前格式模式受限，已切换为兼容渲染模式'
}

export function resolveReaderRenderMode(format: AnyFormatString, requestedMode: PageTurnMode): ReaderRenderModeDecision {
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
