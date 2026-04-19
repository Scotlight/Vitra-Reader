import { db, type ReadingStatsDaily } from './storageService'

export type ReadingStatsPeriod = 'day' | 'week' | 'month'

export interface BookReadingStatsItem {
    bookId: string
    activeMs: number
}

export interface ReadingStatsSummary {
    period: ReadingStatsPeriod
    startDateKey: string
    endDateKey: string
    totalActiveMs: number
    byBook: BookReadingStatsItem[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_PROGRESS_FOR_ESTIMATION = 0.03
export const READING_STATS_RETENTION_DAYS = 400
let lastPrunedDateKey: string | null = null

function pad2(value: number): string {
    return value.toString().padStart(2, '0')
}

function atLocalDayStart(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function atLocalDayEnd(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

function toStatsId(dateKey: string, bookId: string): string {
    return `${dateKey}::${bookId}`
}

function getPeriodRange(period: ReadingStatsPeriod, anchorMs: number): { start: Date; end: Date } {
    const anchorDate = new Date(anchorMs)
    const dayStart = atLocalDayStart(anchorDate)
    if (period === 'day') {
        return { start: dayStart, end: atLocalDayEnd(anchorDate) }
    }

    if (period === 'week') {
        const weekDayOffset = (dayStart.getDay() + 6) % 7
        const weekStart = new Date(dayStart.getTime() - weekDayOffset * DAY_MS)
        return { start: weekStart, end: atLocalDayEnd(anchorDate) }
    }

    const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1, 0, 0, 0, 0)
    return { start: monthStart, end: atLocalDayEnd(anchorDate) }
}

export function toLocalDateKey(timestampMs: number): string {
    const date = new Date(timestampMs)
    const year = date.getFullYear()
    const month = pad2(date.getMonth() + 1)
    const day = pad2(date.getDate())
    return `${year}-${month}-${day}`
}

export function resolvePeriodDateKeys(period: ReadingStatsPeriod, anchorMs: number = Date.now()): string[] {
    const { start, end } = getPeriodRange(period, anchorMs)
    const result: string[] = []
    const cursor = new Date(start.getTime())
    while (cursor.getTime() <= end.getTime()) {
        result.push(toLocalDateKey(cursor.getTime()))
        cursor.setDate(cursor.getDate() + 1)
    }
    return result
}

export function resolveReadingStatsCutoffDateKey(
    anchorMs: number = Date.now(),
    retentionDays: number = READING_STATS_RETENTION_DAYS,
): string {
    const normalizedRetentionDays = Math.max(1, Math.floor(retentionDays))
    const anchorDayStart = atLocalDayStart(new Date(anchorMs))
    anchorDayStart.setDate(anchorDayStart.getDate() - (normalizedRetentionDays - 1))
    return toLocalDateKey(anchorDayStart.getTime())
}

async function pruneStaleReadingStats(nowMs: number): Promise<void> {
    const todayKey = toLocalDateKey(nowMs)
    if (lastPrunedDateKey === todayKey) return

    const cutoffDateKey = resolveReadingStatsCutoffDateKey(nowMs)
    await db.readingStatsDaily.where('dateKey').below(cutoffDateKey).delete()
    lastPrunedDateKey = todayKey
}

export async function loadReadingStatsRowsForSync(
    anchorMs: number = Date.now(),
    retentionDays: number = READING_STATS_RETENTION_DAYS,
): Promise<ReadingStatsDaily[]> {
    const cutoffDateKey = resolveReadingStatsCutoffDateKey(anchorMs, retentionDays)
    return db.readingStatsDaily.where('dateKey').aboveOrEqual(cutoffDateKey).toArray()
}

export async function addActiveReadingMs(bookId: string, activeMs: number, nowMs: number = Date.now()): Promise<void> {
    const normalizedMs = Math.round(activeMs)
    if (!bookId || normalizedMs <= 0) return

    try {
        await pruneStaleReadingStats(nowMs)
    } catch (error) {
        console.warn('[ReadingStats] prune stale rows failed:', error)
    }

    const dateKey = toLocalDateKey(nowMs)
    const id = toStatsId(dateKey, bookId)

    await db.transaction('rw', db.readingStatsDaily, async () => {
        const existing = await db.readingStatsDaily.get(id)
        if (existing) {
            await db.readingStatsDaily.put({
                ...existing,
                activeMs: existing.activeMs + normalizedMs,
                updatedAt: nowMs,
            })
            return
        }

        await db.readingStatsDaily.put({
            id,
            dateKey,
            bookId,
            activeMs: normalizedMs,
            updatedAt: nowMs,
        })
    })
}

export async function loadReadingStatsSummary(
    period: ReadingStatsPeriod,
    anchorMs: number = Date.now(),
): Promise<ReadingStatsSummary> {
    const dateKeys = resolvePeriodDateKeys(period, anchorMs)
    const startDateKey = dateKeys[0] ?? toLocalDateKey(anchorMs)
    const endDateKey = dateKeys[dateKeys.length - 1] ?? startDateKey

    const rows = dateKeys.length <= 1
        ? await db.readingStatsDaily.where('dateKey').equals(startDateKey).toArray()
        : await db.readingStatsDaily.where('dateKey').between(startDateKey, endDateKey, true, true).toArray()

    const byBookMap = new Map<string, number>()
    rows.forEach((row) => {
        byBookMap.set(row.bookId, (byBookMap.get(row.bookId) ?? 0) + row.activeMs)
    })

    const byBook = Array.from(byBookMap.entries())
        .map(([bookId, activeMs]) => ({ bookId, activeMs }))
        .sort((left, right) => right.activeMs - left.activeMs)

    const totalActiveMs = byBook.reduce((sum, item) => sum + item.activeMs, 0)
    return {
        period,
        startDateKey,
        endDateKey,
        totalActiveMs,
        byBook,
    }
}

export function estimateRemainingMsFromProgress(activeMs: number, progress: number): number | null {
    if (!Number.isFinite(activeMs) || !Number.isFinite(progress)) return null
    const normalizedActiveMs = Math.max(0, Math.round(activeMs))
    const normalizedProgress = Math.max(0, Math.min(1, progress))

    if (normalizedProgress >= 1) return 0
    if (normalizedActiveMs <= 0 || normalizedProgress < MIN_PROGRESS_FOR_ESTIMATION) return null

    return Math.max(
        0,
        Math.round((normalizedActiveMs * (1 - normalizedProgress)) / normalizedProgress),
    )
}

export function formatDurationLabel(durationMs: number): string {
    const normalizedMs = Math.max(0, Math.round(durationMs))
    const totalSeconds = Math.floor(normalizedMs / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) return `${hours}小时${minutes}分钟`
    if (minutes > 0) return `${minutes}分钟${seconds}秒`
    return `${seconds}秒`
}
