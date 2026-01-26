import { useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

const NOTE_PARAM = 'note'

interface UseNoteFromUrlOptions {
  onNoteIdChange: (noteId: string | null) => void
  validateNoteExists: (noteId: string) => boolean
  isLoading: boolean
  hasNotes: boolean // Whether notes have been fetched (even if empty)
}

/**
 * Hook to sync open note with URL query parameter.
 * This allows each browser tab to remember its own open note.
 */
export function useNoteFromUrl({
  onNoteIdChange,
  validateNoteExists,
  isLoading,
  hasNotes,
}: UseNoteFromUrlOptions) {
  const [searchParams, setSearchParams] = useSearchParams()
  const hasRestoredRef = useRef(false)

  // Get note ID from URL
  const noteIdFromUrl = searchParams.get(NOTE_PARAM)

  // Restore note from URL on initial load
  useEffect(() => {
    // Wait until loading is done AND we have notes data
    if (hasRestoredRef.current || isLoading || !hasNotes) return

    if (noteIdFromUrl) {
      if (validateNoteExists(noteIdFromUrl)) {
        hasRestoredRef.current = true
        onNoteIdChange(noteIdFromUrl)
      } else {
        // Note doesn't exist, remove from URL
        hasRestoredRef.current = true
        setSearchParams((params) => {
          params.delete(NOTE_PARAM)
          return params
        }, { replace: true })
      }
    } else {
      hasRestoredRef.current = true
    }
  }, [isLoading, hasNotes, noteIdFromUrl, validateNoteExists, onNoteIdChange, setSearchParams])

  // Set note ID in URL (when opening a note)
  const setNoteInUrl = useCallback((noteId: string) => {
    setSearchParams((params) => {
      params.set(NOTE_PARAM, noteId)
      return params
    }, { replace: true })
  }, [setSearchParams])

  // Remove note ID from URL (when closing a note)
  const clearNoteFromUrl = useCallback(() => {
    setSearchParams((params) => {
      params.delete(NOTE_PARAM)
      return params
    }, { replace: true })
  }, [setSearchParams])

  return {
    noteIdFromUrl,
    setNoteInUrl,
    clearNoteFromUrl,
  }
}
