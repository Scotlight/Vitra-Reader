import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ReadingStatsPanel } from '@/components/Library/ReadingStatsPanel'

const mocks = vi.hoisted(() => ({
    booksBulkGet: vi.fn(),
    loadMonthlyReadingReport: vi.fn(),
    loadReadingStatsSummary: vi.fn(),
    progressBulkGet: vi.fn(),
}))

vi.mock('@/services/storageService', () => ({
    db: {
        books: {
            bulkGet: mocks.booksBulkGet,
        },
        progress: {
            bulkGet: mocks.progressBulkGet,
        },
    },
}))

vi.mock('@/services/readingStatsService', async () => {
    const actual = await vi.importActual<typeof import('@/services/readingStatsService')>('@/services/readingStatsService')
    return {
        ...actual,
        loadMonthlyReadingReport: mocks.loadMonthlyReadingReport,
        loadReadingStatsSummary: mocks.loadReadingStatsSummary,
    }
})

describe('ReadingStatsPanel', () => {
    beforeEach(() => {
        mocks.loadReadingStatsSummary.mockResolvedValue({
            period: 'day',
            startDateKey: '2026-04-19',
            endDateKey: '2026-04-19',
            totalActiveMs: 0,
            byBook: [],
        })
        mocks.loadMonthlyReadingReport.mockResolvedValue({
            monthKey: '2026-04',
            startDateKey: '2026-04-01',
            endDateKey: '2026-04-19',
            calendarStartDateKey: '2026-04-01',
            calendarEndDateKey: '2026-04-30',
            totalActiveMs: 4_200_000,
            todayActiveMs: 600_000,
            activeDayCount: 2,
            longestStreakDays: 2,
            byBook: [
                { bookId: 'book-a', activeMs: 4_200_000 },
            ],
            dailyTrend: [
                { dateKey: '2026-04-01', activeMs: 600_000 },
                { dateKey: '2026-04-02', activeMs: 3_600_000 },
            ],
            calendarDays: [
                { dateKey: '2026-04-01', activeMs: 600_000, dayOfMonth: 1, weekday: 3, isToday: false, isFuture: false },
                { dateKey: '2026-04-02', activeMs: 3_600_000, dayOfMonth: 2, weekday: 4, isToday: true, isFuture: false },
                { dateKey: '2026-04-03', activeMs: 0, dayOfMonth: 3, weekday: 5, isToday: false, isFuture: true },
            ],
        })
        mocks.booksBulkGet.mockResolvedValue([
            { id: 'book-a', title: 'Book A', author: 'Author A' },
        ])
        mocks.progressBulkGet.mockResolvedValue([
            { bookId: 'book-a', percentage: 0.42 },
        ])
    })

    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it('渲染月度视图的日历、趋势条和 Top 图书', async () => {
        render(<ReadingStatsPanel />)

        fireEvent.click(screen.getByRole('button', { name: '本月' }))

        expect(await screen.findByText('2026-04 阅读日历')).toBeInTheDocument()
        expect(screen.getByText('2026-04-01 ~ 2026-04-19')).toBeInTheDocument()
        expect(screen.getByTestId('monthly-calendar')).toBeInTheDocument()
        expect(screen.getByTestId('monthly-trend-chart')).toBeInTheDocument()
        expect(screen.getByTestId('monthly-top-books')).toBeInTheDocument()
        expect(screen.getByText('每日趋势')).toBeInTheDocument()
        expect(screen.getByText('本月 Top 图书')).toBeInTheDocument()
        expect(screen.getByText('1. Book A')).toBeInTheDocument()
        expect(screen.getByText('Author A · 进度 42%')).toBeInTheDocument()
    })
})
