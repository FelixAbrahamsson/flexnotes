import { useEffect } from 'react'

/**
 * Hook to handle ESC key press for closing modals/dialogs.
 *
 * @param onEscape - Callback to execute when ESC is pressed
 * @param enabled - Optional flag to enable/disable the listener (default: true)
 *
 * @example
 * // Simple usage
 * useEscapeKey(onClose)
 *
 * @example
 * // With condition (disable when sub-modal is open)
 * useEscapeKey(onClose, !showSubModal)
 */
export function useEscapeKey(onEscape: () => void, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onEscape, enabled])
}
