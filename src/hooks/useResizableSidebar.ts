import { useState, useCallback, useEffect, useRef } from 'react'

interface UseResizableSidebarOptions {
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
}

interface UseResizableSidebarReturn {
  width: number
  handleResizeStart: (e: React.MouseEvent | React.TouchEvent) => void
}

export function useResizableSidebar({
  defaultWidth = 320,
  minWidth = 200,
  maxWidth = 600,
}: UseResizableSidebarOptions = {}): UseResizableSidebarReturn {
  const [width, setWidth] = useState(defaultWidth)
  const isResizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleResizeStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      isResizing.current = true
      startX.current = 'touches' in e ? e.touches[0].clientX : e.clientX
      startWidth.current = width
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [width]
  )

  useEffect(() => {
    const handleResizeMove = (e: MouseEvent | TouchEvent) => {
      if (!isResizing.current) return
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const delta = clientX - startX.current
      const newWidth = Math.min(Math.max(startWidth.current + delta, minWidth), maxWidth)
      setWidth(newWidth)
    }

    const handleResizeEnd = () => {
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleResizeMove)
    document.addEventListener('mouseup', handleResizeEnd)
    document.addEventListener('touchmove', handleResizeMove)
    document.addEventListener('touchend', handleResizeEnd)

    return () => {
      document.removeEventListener('mousemove', handleResizeMove)
      document.removeEventListener('mouseup', handleResizeEnd)
      document.removeEventListener('touchmove', handleResizeMove)
      document.removeEventListener('touchend', handleResizeEnd)
    }
  }, [minWidth, maxWidth])

  return {
    width,
    handleResizeStart,
  }
}
