import type { ReadingStatsPeriod } from './readingStatsService'

export const DAY_MS = 24 * 60 * 60 * 1000

function pad2(value: number): string {
    return value.toString().padStart(2, '0')
}

export function atLocalDayStart(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

export function atLocalDayEnd(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

export function toLocalMonthKey(timestampMs: number): string {
    const date = new Date(timestampMs)
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

export function getPeriodRange(period: ReadingStatsPeriod, anchorMs: number): { start: Date; end: Date } {
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

export function getMonthCalendarRange(anchorMs: number): { start: Date; end: Date } {
    const anchorDate = new Date(anchorMs)
    const start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1, 0, 0, 0, 0)
    const end = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0, 23, 59, 59, 999)
    return { start, end }
}

export function fromDateKey(dateKey: string): Date {
    const [year, month, day] = dateKey.split('-').map((item) => Number(item))
    return new Date(year || 1970, Math.max(0, (month || 1) - 1), day || 1, 0, 0, 0, 0)
}

export function toLocalDateKey(timestampMs: number): string {
    const date = new Date(timestampMs)
    const year = date.getFullYear()
    const month = pad2(date.getMonth() + 1)
    const day = pad2(date.getDate())
    return `${year}-${month}-${day}`
}

export function resolveDateKeysInRange(start: Date, end: Date): string[] {
    const result: string[] = []
    const cursor = new Date(start.getTime())
    while (cursor.getTime() <= end.getTime()) {
        result.push(toLocalDateKey(cursor.getTime()))
        cursor.setDate(cursor.getDate() + 1)
    }
    return result
}

export function resolvePeriodDateKeys(period: ReadingStatsPeriod, anchorMs: number = Date.now()): string[] {
    const { start, end } = getPeriodRange(period, anchorMs)
    return resolveDateKeysInRange(start, end)
}
