import { describe, expect, it } from 'vitest'
import {
    buildHomeOrderKey,
    buildMigratedGroupState,
    reorderKeys,
    sanitizeGroupState,
} from '@/hooks/groupManagerState'

describe('groupManagerState', () => {
    it('从旧书架状态迁移为分组状态与首页混排顺序', () => {
        const migrated = buildMigratedGroupState(
            [{ id: 'group-1', name: '待读' }],
            { 'group-1': ['book-1'] },
            [{ id: 'book-1' }, { id: 'book-2' }, { id: 'book-3' }],
        )

        expect(migrated.groups).toEqual([{ id: 'group-1', name: '待读' }])
        expect(migrated.groupBookMap).toEqual({ 'group-1': ['book-1'] })
        expect(migrated.groupBookOrder).toEqual({ 'group-1': ['book-1'] })
        expect(migrated.homeOrder).toEqual([
            buildHomeOrderKey('group', 'group-1'),
            buildHomeOrderKey('book', 'book-2'),
            buildHomeOrderKey('book', 'book-3'),
        ])
    })

    it('清洗分组成员时保留有效手动顺序并补齐首页未分组图书', () => {
        const sanitized = sanitizeGroupState(
            [{ id: 'group-1', name: '已读' }],
            { 'group-1': ['book-1', 'book-1', 'missing-book'] },
            { 'group-1': ['missing-book', 'book-1'] },
            [
                buildHomeOrderKey('book', 'book-3'),
                buildHomeOrderKey('group', 'group-1'),
                buildHomeOrderKey('book', 'book-1'),
                buildHomeOrderKey('book', 'book-2'),
            ],
            [{ id: 'book-1' }, { id: 'book-2' }, { id: 'book-3' }],
        )

        expect(sanitized.groupBookMap).toEqual({ 'group-1': ['book-1'] })
        expect(sanitized.groupBookOrder).toEqual({ 'group-1': ['book-1'] })
        expect(sanitized.homeOrder).toEqual([
            buildHomeOrderKey('book', 'book-3'),
            buildHomeOrderKey('group', 'group-1'),
            buildHomeOrderKey('book', 'book-2'),
        ])
    })

    it('拖拽重排时把源项插到目标项位置', () => {
        expect(reorderKeys(['a', 'b', 'c', 'd'], 'c', 'a')).toEqual(['c', 'a', 'b', 'd'])
        expect(reorderKeys(['a', 'b', 'c', 'd'], 'a', 'd')).toEqual(['b', 'c', 'd', 'a'])
    })
})
