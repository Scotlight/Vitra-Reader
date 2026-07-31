import { useEffect, useState } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function readReducedMotionPreference(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia(REDUCED_MOTION_QUERY).matches
}

export function usePrefersReducedMotion(): boolean {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(readReducedMotionPreference)

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return
        const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY)
        const handleChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches)

        setPrefersReducedMotion(mediaQuery.matches)
        mediaQuery.addEventListener('change', handleChange)
        return () => mediaQuery.removeEventListener('change', handleChange)
    }, [])

    return prefersReducedMotion
}
