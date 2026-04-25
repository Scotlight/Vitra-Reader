import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { DragHandlers } from './BookGridCard'

const LONG_PRESS_MS = 320
const LONG_PRESS_CANCEL_DISTANCE = 10

function resolveSortTargetKey(clientX: number, clientY: number, sortContextKey: string | null): string | null {
    if (!sortContextKey) return null
    const target = document
        .elementFromPoint(clientX, clientY)
        ?.closest<HTMLElement>('[data-sort-key][data-sort-context]')

    if (!target || target.dataset.sortContext !== sortContextKey) return null
    return target.dataset.sortKey || null
}

interface UseBookGridDragSortOptions {
    sortable: boolean
    sortContextKey: string | null
    onReorder?: (sourceKey: string, targetKey: string) => void | Promise<void>
}

export function useBookGridDragSort({ sortable, sortContextKey, onReorder }: UseBookGridDragSortOptions) {
    const [draggingKey, setDraggingKey] = useState<string | null>(null)
    const suppressClickUntilRef = useRef(0)
    const sortGestureRef = useRef<{
        timeoutId: number | null
        active: boolean
        pointerId: number | null
        sourceKey: string | null
        startX: number
        startY: number
        latestTargetKey: string | null
    }>({
        timeoutId: null,
        active: false,
        pointerId: null,
        sourceKey: null,
        startX: 0,
        startY: 0,
        latestTargetKey: null,
    })

    const resetSortGesture = useCallback(() => {
        const gesture = sortGestureRef.current
        if (gesture.timeoutId !== null) {
            window.clearTimeout(gesture.timeoutId)
        }
        sortGestureRef.current = {
            timeoutId: null,
            active: false,
            pointerId: null,
            sourceKey: null,
            startX: 0,
            startY: 0,
            latestTargetKey: null,
        }
        setDraggingKey(null)
    }, [])

    useEffect(() => resetSortGesture, [resetSortGesture])

    useEffect(() => {
        if (!sortable || !sortContextKey) {
            resetSortGesture()
        }
    }, [resetSortGesture, sortable, sortContextKey])

    const handlePointerDown = (event: ReactPointerEvent<HTMLElement>, key: string) => {
        if (!sortable || !sortContextKey || event.button !== 0) return

        resetSortGesture()
        try {
            event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
            // noop
        }

        const pointerId = event.pointerId
        sortGestureRef.current = {
            timeoutId: window.setTimeout(() => {
                if (sortGestureRef.current.pointerId !== pointerId || sortGestureRef.current.sourceKey !== key) return
                sortGestureRef.current.active = true
                sortGestureRef.current.timeoutId = null
                sortGestureRef.current.latestTargetKey = key
                setDraggingKey(key)
            }, LONG_PRESS_MS),
            active: false,
            pointerId,
            sourceKey: key,
            startX: event.clientX,
            startY: event.clientY,
            latestTargetKey: null,
        }
    }

    const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
        const gesture = sortGestureRef.current
        if (gesture.pointerId !== event.pointerId) return

        if (!gesture.active) {
            const movedDistance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY)
            if (movedDistance > LONG_PRESS_CANCEL_DISTANCE) {
                resetSortGesture()
            }
            return
        }

        const targetKey = resolveSortTargetKey(event.clientX, event.clientY, sortContextKey)
        if (targetKey) {
            gesture.latestTargetKey = targetKey
        }
        event.preventDefault()
    }

    const finishPointerGesture = (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
        const gesture = sortGestureRef.current
        if (gesture.pointerId !== event.pointerId) return

        const wasActive = gesture.active
        const sourceKey = gesture.sourceKey
        const targetKey = wasActive
            ? (resolveSortTargetKey(event.clientX, event.clientY, sortContextKey) ?? gesture.latestTargetKey)
            : null

        resetSortGesture()

        if (!wasActive) return

        suppressClickUntilRef.current = Date.now() + 400
        event.preventDefault()

        if (!cancelled && sourceKey && targetKey && sourceKey !== targetKey && onReorder) {
            void onReorder(sourceKey, targetKey)
        }
    }

    const handleClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
        if (suppressClickUntilRef.current <= Date.now()) return
        event.preventDefault()
        event.stopPropagation()
    }

    const dragHandlers: DragHandlers = {
        draggingKey,
        onClickCapture: handleClickCapture,
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: (event) => finishPointerGesture(event, false),
        onPointerCancel: (event) => finishPointerGesture(event, true),
    }

    return {
        dragHandlers,
        resetSortGesture,
    }
}
