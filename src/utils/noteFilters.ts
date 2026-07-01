import type { Note } from '@/types'

/**
 * Shared note-filtering predicates. Centralized so "what counts as a visible
 * note" has a single definition instead of being re-implemented inline across
 * stores and components.
 */

/** Notes visible in the main list: neither trashed nor archived. */
export function activeNotes(notes: Note[]): Note[] {
  return notes.filter((n) => !n.is_deleted && !n.is_archived)
}

/**
 * Active notes assigned to a folder (or to the root when `folderId` is null).
 */
export function notesInFolder(notes: Note[], folderId: string | null): Note[] {
  return notes.filter(
    (n) => n.folder_id === folderId && !n.is_deleted && !n.is_archived
  )
}

/** Notes currently in the trash. */
export function trashedNotes(notes: Note[]): Note[] {
  return notes.filter((n) => n.is_deleted)
}
