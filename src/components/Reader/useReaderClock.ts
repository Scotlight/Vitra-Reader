import { useEffect, useState } from 'react'

export function useReaderClock(updateIntervalMs: number = 30000) {
    const [clockText, setClockText] = useState('')

    useEffect(() => {
        const formatClock = () => {
            const now = new Date()
            const hours = String(now.getHours()).padStart(2, '0')
            const minutes = String(now.getMinutes()).padStart(2, '0')
            setClockText(`${hours}:${minutes}`)
        }

        formatClock()
        const timer = window.setInterval(formatClock, updateIntervalMs)
        return () => {
            window.clearInterval(timer)
        }
    }, [updateIntervalMs])

    return clockText
}
