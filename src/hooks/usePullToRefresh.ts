import { useState, useRef, useCallback, useEffect } from 'react'

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>
  threshold?: number // Distance to pull before triggering refresh (default: 80)
  maxPull?: number // Maximum pull distance (default: 120)
  disabled?: boolean // Disable pull-to-refresh (e.g., when in reorder mode)
}

interface UsePullToRefreshReturn {
  pullDistance: number
  isRefreshing: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
}

/**
 * Hook for pull-to-refresh functionality.
 * Only triggers when user is at the top of the scroll container.
 *
 * @example
 * const { pullDistance, isRefreshing, containerRef } = usePullToRefresh({
 *   onRefresh: async () => { await fetchData() }
 * })
 *
 * return (
 *   <div ref={containerRef}>
 *     <PullIndicator distance={pullDistance} refreshing={isRefreshing} />
 *     <Content />
 *   </div>
 * )
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  maxPull = 120,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const startY = useRef(0)
  const isPulling = useRef(false)
  const isRefreshingRef = useRef(false)
  const pullDistanceRef = useRef(0)

  // Keep refs in sync with state for use in event handlers
  useEffect(() => {
    isRefreshingRef.current = isRefreshing
  }, [isRefreshing])

  useEffect(() => {
    pullDistanceRef.current = pullDistance
  }, [pullDistance])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    setPullDistance(threshold) // Hold at threshold during refresh

    try {
      await onRefresh()
    } finally {
      setIsRefreshing(false)
      setPullDistance(0)
    }
  }, [onRefresh, threshold])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onTouchStart = (e: TouchEvent) => {
      // Don't start if disabled (e.g., reorder mode)
      if (disabled) return

      // Only start if we're at the top of the page
      if (window.scrollY > 0 || isRefreshingRef.current) return

      startY.current = e.touches[0].clientY
      isPulling.current = true
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || isRefreshingRef.current) return

      const currentY = e.touches[0].clientY
      const diff = currentY - startY.current

      // Only pull down, not up
      if (diff > 0 && window.scrollY === 0) {
        // Apply resistance - pulling gets harder as you go
        const resistance = 0.5
        const adjustedDiff = Math.min(diff * resistance, maxPull)
        setPullDistance(adjustedDiff)

        // Prevent default scroll when pulling (only if event is cancelable)
        if (adjustedDiff > 10 && e.cancelable) {
          e.preventDefault()
        }
      }
    }

    const onTouchEnd = () => {
      if (!isPulling.current) return

      isPulling.current = false

      if (pullDistanceRef.current >= threshold && !isRefreshingRef.current) {
        handleRefresh()
      } else {
        setPullDistance(0)
      }
    }

    // Use { passive: false } to allow preventDefault() in touchmove
    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchmove', onTouchMove, { passive: false })
    container.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
    }
  }, [disabled, maxPull, threshold, handleRefresh])

  // Reset on unmount
  useEffect(() => {
    return () => {
      setPullDistance(0)
      setIsRefreshing(false)
    }
  }, [])

  return {
    pullDistance,
    isRefreshing,
    containerRef,
  }
}
