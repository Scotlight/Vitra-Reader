import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibrarySidebar } from '@/components/Library/LibrarySidebar'
import type { useGroupManager } from '@/hooks/useGroupManager'
import type { BookMeta } from '@/services/storageService'

const sampleBook: BookMeta = {
    id: 'book-1',
    title: '沙丘',
    author: 'Frank Herbert',
    fileSize: 1,
    addedAt: 1,
}

function createGroupManager(overrides: Partial<ReturnType<typeof useGroupManager>> = {}) {
    return {
        groups: [{ id: 'group-1', name: '科幻' }],
        groupBookMap: { 'group-1': ['book-1'] },
        groupBookOrder: { 'group-1': ['book-1'] },
        homeOrder: ['group:group-1'],
        activeGroupId: null,
        setActiveGroupId: vi.fn(),
        expandedGroups: { 'group-1': true },
        showCreateGroupModal: false,
        setShowCreateGroupModal: vi.fn(),
        newGroupName: '',
        setNewGroupName: vi.fn(),
        showManageGroupModal: false,
        setShowManageGroupModal: vi.fn(),
        manageSourceGroupId: '',
        setManageSourceGroupId: vi.fn(),
        manageTargetGroupId: '',
        setManageTargetGroupId: vi.fn(),
        openCreateGroupModal: vi.fn(),
        openManageGroupModal: vi.fn(),
        bookById: new Map([[sampleBook.id, sampleBook]]),
        orderedGroupBookIdsByGroup: { 'group-1': ['book-1'] },
        groupedBookIdSet: new Set(['book-1']),
        activeGroupBookIdSet: null,
        groupCollections: [{ id: 'group-1', name: '科幻', bookIds: ['book-1'], books: [sampleBook] }],
        toggleGroupExpanded: vi.fn(),
        createGroup: vi.fn(async () => undefined),
        renameGroup: vi.fn(async () => undefined),
        dissolveGroup: vi.fn(),
        moveGroupBooks: vi.fn(async () => undefined),
        addBookToGroup: vi.fn(async () => undefined),
        removeBookFromActiveGroup: vi.fn(async () => undefined),
        reorderHomeItems: vi.fn(async () => undefined),
        reorderActiveGroupBooks: vi.fn(async () => undefined),
        ...overrides,
    } as ReturnType<typeof useGroupManager>
}

function renderSidebar(overrides: Partial<ReturnType<typeof useGroupManager>> = {}) {
    const group = createGroupManager(overrides)
    const setActiveNav = vi.fn()
    const view = render(
        <LibrarySidebar
            activeNav="all"
            isSettingsOpen={false}
            setActiveNav={setActiveNav}
            group={group}
            onOpenBook={vi.fn()}
            onContextMenu={vi.fn()}
            onToggleSettings={vi.fn()}
        />,
    )

    return { group, setActiveNav, view }
}

describe('LibrarySidebar', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it('移除侧栏分组操作区，并把已有分组挂在全部图书下面', () => {
        const openCreateGroupModal = vi.fn()
        const openManageGroupModal = vi.fn()
        const { group, setActiveNav, view } = renderSidebar({
            openCreateGroupModal,
            openManageGroupModal,
        })

        expect(view.queryByText('我的分组')).toBeNull()
        expect(view.queryByRole('button', { name: '新建分组' })).toBeNull()
        expect(view.queryByRole('button', { name: '管理分组' })).toBeNull()

        const allBooks = view.getByRole('button', { name: /全部图书/ })
        const groupButton = view.getByRole('button', { name: '科幻' })
        expect(allBooks.compareDocumentPosition(groupButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

        fireEvent.click(groupButton)

        expect(group.setActiveGroupId).toHaveBeenCalledWith('group-1')
        expect(setActiveNav).toHaveBeenCalledWith('all')
        expect(openCreateGroupModal).not.toHaveBeenCalled()
        expect(openManageGroupModal).not.toHaveBeenCalled()
    })

    it('点击全部图书会回到根目录并清空当前分组', () => {
        const { group, setActiveNav, view } = renderSidebar({ activeGroupId: 'group-1' })

        fireEvent.click(view.getByRole('button', { name: /全部图书/ }))

        expect(setActiveNav).toHaveBeenCalledWith('all')
        expect(group.setActiveGroupId).toHaveBeenCalledWith(null)
    })
})
