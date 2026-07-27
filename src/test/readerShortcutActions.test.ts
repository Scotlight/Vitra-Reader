import { describe, expect, it } from 'vitest'
import {
    READER_FONT_SIZE_MAX,
    READER_FONT_SIZE_MIN,
    READER_WHEEL_FONT_STEP_THRESHOLD,
    clampReaderFontSize,
    isEditableTarget,
    resolveKeyboardShortcut,
    stepWheelFontAccumulator,
} from '@/components/Reader/readerShortcutActions'

function keyEvent(key: string, init: KeyboardEventInit = {}, target?: EventTarget): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init })
    if (target) Object.defineProperty(event, 'target', { value: target, configurable: true })
    return event
}

describe('resolveKeyboardShortcut 字号键位', () => {
    it('Ctrl 与 =/+/Add 都映射成字号 +1', () => {
        for (const key of ['=', '+', 'Add']) {
            expect(resolveKeyboardShortcut(keyEvent(key, { ctrlKey: true })))
                .toEqual({ type: 'font-size-delta', delta: 1 })
        }
    })

    it('Ctrl 与 -/_/Subtract 都映射成字号 -1', () => {
        for (const key of ['-', '_', 'Subtract']) {
            expect(resolveKeyboardShortcut(keyEvent(key, { ctrlKey: true })))
                .toEqual({ type: 'font-size-delta', delta: -1 })
        }
    })

    it('mac 的 Cmd 与 Ctrl 等价', () => {
        expect(resolveKeyboardShortcut(keyEvent('=', { metaKey: true })))
            .toEqual({ type: 'font-size-delta', delta: 1 })
    })

    it('US 布局下 Shift+= 打出的 + 仍然认', () => {
        expect(resolveKeyboardShortcut(keyEvent('+', { ctrlKey: true, shiftKey: true })))
            .toEqual({ type: 'font-size-delta', delta: 1 })
    })

    it('不带 Ctrl 的裸 = / - 不命中，正文里打字不受影响', () => {
        expect(resolveKeyboardShortcut(keyEvent('='))).toBeNull()
        expect(resolveKeyboardShortcut(keyEvent('-'))).toBeNull()
    })

    it('带 Alt 时交还给系统', () => {
        expect(resolveKeyboardShortcut(keyEvent('=', { ctrlKey: true, altKey: true }))).toBeNull()
    })
})

describe('resolveKeyboardShortcut 功能键', () => {
    it('F1~F4 依次对应 light / dark / sepia / green', () => {
        const expected = ['light', 'dark', 'sepia', 'green']
        expected.forEach((themeId, index) => {
            expect(resolveKeyboardShortcut(keyEvent(`F${index + 1}`)))
                .toEqual({ type: 'theme', themeId })
        })
    })

    it('F11 切全屏', () => {
        expect(resolveKeyboardShortcut(keyEvent('F11'))).toEqual({ type: 'toggle-fullscreen' })
    })

    it('功能键带任何修饰键都不命中（Alt+F4 / Ctrl+F4 是系统关窗键）', () => {
        expect(resolveKeyboardShortcut(keyEvent('F4', { altKey: true }))).toBeNull()
        expect(resolveKeyboardShortcut(keyEvent('F4', { ctrlKey: true }))).toBeNull()
        expect(resolveKeyboardShortcut(keyEvent('F1', { shiftKey: true }))).toBeNull()
        expect(resolveKeyboardShortcut(keyEvent('F11', { ctrlKey: true }))).toBeNull()
    })

    it('未绑定的功能键返回 null', () => {
        expect(resolveKeyboardShortcut(keyEvent('F5'))).toBeNull()
    })
})

describe('输入框保护', () => {
    it('input / textarea / contenteditable 内一律不命中', () => {
        const input = document.createElement('input')
        const textarea = document.createElement('textarea')
        const editable = document.createElement('div')
        editable.contentEditable = 'true'
        Object.defineProperty(editable, 'isContentEditable', { value: true, configurable: true })

        for (const target of [input, textarea, editable]) {
            expect(resolveKeyboardShortcut(keyEvent('=', { ctrlKey: true }, target))).toBeNull()
            expect(resolveKeyboardShortcut(keyEvent('F1', {}, target))).toBeNull()
        }
    })

    it('普通元素不算可编辑目标', () => {
        expect(isEditableTarget(document.createElement('div'))).toBe(false)
        expect(isEditableTarget(null)).toBe(false)
    })
})

describe('clampReaderFontSize', () => {
    it('夹在 [12, 36] 之间', () => {
        expect(clampReaderFontSize(READER_FONT_SIZE_MIN - 1)).toBe(READER_FONT_SIZE_MIN)
        expect(clampReaderFontSize(READER_FONT_SIZE_MAX + 1)).toBe(READER_FONT_SIZE_MAX)
        expect(clampReaderFontSize(22)).toBe(22)
    })

    it('小数取整，NaN 兜底到下界', () => {
        expect(clampReaderFontSize(22.4)).toBe(22)
        expect(clampReaderFontSize(Number.NaN)).toBe(READER_FONT_SIZE_MIN)
    })
})

describe('stepWheelFontAccumulator', () => {
    it('未攒够阈值时不产生增量', () => {
        expect(stepWheelFontAccumulator(READER_WHEEL_FONT_STEP_THRESHOLD - 1))
            .toEqual({ delta: 0, rest: READER_WHEEL_FONT_STEP_THRESHOLD - 1 })
    })

    it('向上滚（deltaY 为负）放大字号并扣掉一格', () => {
        expect(stepWheelFontAccumulator(-READER_WHEEL_FONT_STEP_THRESHOLD)).toEqual({ delta: 1, rest: 0 })
        expect(stepWheelFontAccumulator(-READER_WHEEL_FONT_STEP_THRESHOLD - 10)).toEqual({ delta: 1, rest: -10 })
    })

    it('向下滚缩小字号并扣掉一格', () => {
        expect(stepWheelFontAccumulator(READER_WHEEL_FONT_STEP_THRESHOLD)).toEqual({ delta: -1, rest: 0 })
        expect(stepWheelFontAccumulator(READER_WHEEL_FONT_STEP_THRESHOLD + 45)).toEqual({ delta: -1, rest: 45 })
    })
})
