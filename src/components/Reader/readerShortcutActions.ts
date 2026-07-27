// 阅读器内置快捷键的纯映射层：只把「事件」翻译成「动作」，不碰 store、不产生 DOM 副作用。
// 拆出来是为了让键位表能脱离 React 单测——以后加键位只需要补这里的用例，不必重跑组件测试。

// 字号上下界与 ReaderAppearanceSettings 里字号滑杆的 min/max 必须一致，
// 否则键盘能调到滑杆调不到的值，UI 上看起来就是「滑杆坏了」。
export const READER_FONT_SIZE_MIN = 12
export const READER_FONT_SIZE_MAX = 36

// F1~F4 与 ReaderAppearanceSettings 里主题按钮的排列顺序严格对应，改一处必须同步另一处。
const THEME_SHORTCUT_KEYS: readonly string[] = ['F1', 'F2', 'F3', 'F4']
export const READER_THEME_IDS: readonly string[] = ['light', 'dark', 'sepia', 'green']

// Ctrl+滚轮的累积阈值：触摸板一次惯性滑动会连发几十个小 deltaY 的 wheel 事件，
// 不做累积会在一次划动里把字号顶到边界。攒够 40 才走一格。
export const READER_WHEEL_FONT_STEP_THRESHOLD = 40

export type ReaderShortcutAction =
    | { readonly type: 'font-size-delta'; readonly delta: number }
    | { readonly type: 'theme'; readonly themeId: string }
    | { readonly type: 'toggle-fullscreen' }

// 不同键盘布局与小键盘下 Ctrl+加减 的 event.key 并不统一，已知变体全部收进来。
const FONT_INCREASE_KEYS = new Set(['=', '+', 'Add'])
const FONT_DECREASE_KEYS = new Set(['-', '_', 'Subtract'])

export function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    // isContentEditable 在部分非浏览器 DOM 实现里是 undefined，显式收敛成布尔，
    // 保证本函数的返回值契约在测试环境与浏览器里一致。
    return target.isContentEditable === true
}

export function clampReaderFontSize(value: number): number {
    // NaN 兜底给下界而不是抛错：字号是渲染链路的输入，坏值会让整屏正文塌掉。
    if (!Number.isFinite(value)) return READER_FONT_SIZE_MIN
    return Math.min(READER_FONT_SIZE_MAX, Math.max(READER_FONT_SIZE_MIN, Math.round(value)))
}

export function resolveKeyboardShortcut(event: KeyboardEvent): ReaderShortcutAction | null {
    if (isEditableTarget(event.target)) return null

    const hasCommandModifier = event.ctrlKey || event.metaKey

    // 功能键要求「裸按」：Alt+F4 关窗、Ctrl+F4 关标签都是宿主/系统的键，绝不能抢。
    if (!hasCommandModifier && !event.altKey && !event.shiftKey) {
        if (event.key === 'F11') return { type: 'toggle-fullscreen' }

        const themeIndex = THEME_SHORTCUT_KEYS.indexOf(event.key)
        if (themeIndex >= 0) {
            const themeId = READER_THEME_IDS[themeIndex]
            if (themeId) return { type: 'theme', themeId }
        }
        return null
    }

    // 字号：Ctrl/Cmd + 加减。US 布局下打出 '+' 本身就要按 Shift，
    // 所以这里容忍 shiftKey，只排除 alt（Alt 组合留给系统）。
    if (hasCommandModifier && !event.altKey) {
        if (FONT_INCREASE_KEYS.has(event.key)) return { type: 'font-size-delta', delta: 1 }
        if (FONT_DECREASE_KEYS.has(event.key)) return { type: 'font-size-delta', delta: -1 }
    }

    return null
}

// 把累积的 deltaY 换成字号增量，并返回扣掉一格之后的剩余量。
// deltaY 向上为负 → 字号变大，与「滚轮上推 = 放大」的直觉一致。
export function stepWheelFontAccumulator(accumulated: number): {
    readonly delta: number
    readonly rest: number
} {
    if (accumulated <= -READER_WHEEL_FONT_STEP_THRESHOLD) {
        return { delta: 1, rest: accumulated + READER_WHEEL_FONT_STEP_THRESHOLD }
    }
    if (accumulated >= READER_WHEEL_FONT_STEP_THRESHOLD) {
        return { delta: -1, rest: accumulated - READER_WHEEL_FONT_STEP_THRESHOLD }
    }
    return { delta: 0, rest: accumulated }
}
