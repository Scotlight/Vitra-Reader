import React, { useEffect } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SelectionMenu } from '@/components/Reader/SelectionMenu'
import { TranslationDialog } from '@/components/Reader/TranslationDialog'
import { useSelectionMenu } from '@/hooks/useSelectionMenu'

type MotionDivProps = React.HTMLAttributes<HTMLDivElement> & {
    initial?: unknown
    animate?: unknown
    exit?: unknown
    transition?: unknown
    ref?: React.Ref<HTMLDivElement>
}

const translateMocks = vi.hoisted(() => ({
    translateText: vi.fn(),
}))

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
        <>{children}</>
    ),
    motion: {
        div: React.forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => {
            const domProps = { ...props } as Record<string, unknown>
            const children = domProps.children as React.ReactNode
            delete domProps.children
            delete domProps.initial
            delete domProps.animate
            delete domProps.exit
            delete domProps.transition
            return React.createElement('div', { ...domProps, ref }, children)
        }),
    },
}))

vi.mock('@/services/storageService', () => ({
    db: {
        bookmarks: { add: vi.fn() },
        highlights: { add: vi.fn() },
    },
}))

vi.mock('@/services/translateService', () => ({
    getProviderLabel: (provider: string) => provider,
    translateText: translateMocks.translateText,
}))

const noop = () => undefined

function UseSelectionMenuHarness() {
    const selection = useSelectionMenu({
        bookId: 'book-1',
        getHighlightContainer: () => null,
    })

    useEffect(() => {
        selection.setSelectionMenu({
            visible: true,
            x: 120,
            y: 120,
            text: 'Hello',
            spineIndex: 0,
        })
        void selection.runTranslate('Hello')
    }, [selection.runTranslate, selection.setSelectionMenu])

    return <>{selection.renderSelectionUI()}</>
}

describe('useSelectionMenu translation dialog', () => {
    beforeEach(() => {
        translateMocks.translateText.mockResolvedValue({
            ok: true,
            translatedText: '你好',
            provider: 'openai',
            fromCache: false,
        })
    })

    afterEach(() => {
        cleanup()
        translateMocks.translateText.mockReset()
    })

    it('打开翻译弹窗时不再渲染选区菜单', async () => {
        render(<UseSelectionMenuHarness />)

        expect(await screen.findByText('翻译结果')).toBeInTheDocument()
        expect(screen.queryByTitle('翻译')).not.toBeInTheDocument()
    })

    it('翻译遮罩层级高于选区菜单', () => {
        render(
            <>
                <SelectionMenu
                    visible
                    x={120}
                    y={120}
                    onCopy={noop}
                    onHighlight={noop}
                    onNote={noop}
                    onSearch={noop}
                    onWebSearch={noop}
                    onReadAloud={noop}
                    onTranslate={noop}
                    onDismiss={noop}
                />
                <TranslationDialog
                    visible
                    sourceText="Hello"
                    translatedText="你好"
                    providerLabel="openai"
                    fromCache={false}
                    loading={false}
                    error=""
                    onRetry={noop}
                    onClose={noop}
                />
            </>,
        )

        const overlay = document.querySelector<HTMLElement>('[class*="overlay"]')
        const selectionMenu = document.querySelector<HTMLElement>('[class*="selectionMenu"]')

        expect(overlay).not.toBeNull()
        expect(selectionMenu).not.toBeNull()
        expect(overlay?.className).toContain('overlay')
        expect(selectionMenu?.className).toContain('selectionMenu')

        expect(selectionMenu?.compareDocumentPosition(overlay as HTMLElement)).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING,
        )
    })
})
