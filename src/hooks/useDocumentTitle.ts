import { useEffect } from 'react'

const BASE_TITLE = 'Notes'
const MAX_TITLE_LENGTH = 50

/**
 * Updates the browser tab title based on the current note.
 * Shows "Notes" by default, or "Notes: <title>" when a note is open.
 */
export function useDocumentTitle(noteTitle: string | null | undefined) {
  useEffect(() => {
    if (noteTitle) {
      // Truncate long titles
      const truncated = noteTitle.length > MAX_TITLE_LENGTH
        ? noteTitle.slice(0, MAX_TITLE_LENGTH - 1) + '…'
        : noteTitle
      document.title = `${BASE_TITLE}: ${truncated}`
    } else {
      document.title = BASE_TITLE
    }

    // Reset on unmount
    return () => {
      document.title = BASE_TITLE
    }
  }, [noteTitle])
}
