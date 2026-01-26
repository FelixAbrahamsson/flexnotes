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
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchMove: (e: React.TouchEvent) => void
    onTouchEnd: () => void
  }
}

/**
 * Hook for pull-to-refresh functionality.
 * Only triggers when user is at the top of the scroll container.
 *
 * @example
 * const { pullDistance, isRefreshing, handlers } = usePullToRefresh({
 *   onRefresh: async () => { await fetchData() }
 * })
 *
 * return (
 *   <div {...handlers}>
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

  const startY = useRef(0)
  const currentY = useRef(0)
  const isPulling = useRef(false)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Don't start if disabled (e.g., reorder mode)
    if (disabled) return

    // Only start if we're at the top of the page
    if (window.scrollY > 0 || isRefreshing) return

    startY.current = e.touches[0].clientY
    isPulling.current = true
  }, [isRefreshing, disabled])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || isRefreshing) return

    currentY.current = e.touches[0].clientY
    const diff = currentY.current - startY.current

    // Only pull down, not up
    if (diff > 0 && window.scrollY === 0) {
      // Apply resistance - pulling gets harder as you go
      const resistance = 0.5
      const adjustedDiff = Math.min(diff * resistance, maxPull)
      setPullDistance(adjustedDiff)

      // Prevent default scroll when pulling
      if (adjustedDiff > 10) {
        e.preventDefault()
      }
    }
  }, [isRefreshing, maxPull])

  const onTouchEnd = useCallback(async () => {
    if (!isPulling.current) return

    isPulling.current = false

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true)
      setPullDistance(threshold) // Hold at threshold during refresh

      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }, [pullDistance, threshold, isRefreshing, onRefresh])

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
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  }
}
