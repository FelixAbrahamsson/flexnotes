export interface EmptyStateParams {
  showTrash: boolean
  showArchived: boolean
  showShared: boolean
  searchQuery: string
  hasSelectedTags: boolean
  viewMode: 'list' | 'folder'
  hasSelectedFolder: boolean
}

/**
 * Pick the empty-state message for the notes list based on the current view.
 * Extracted from NotesPage's deeply-nested ternary so the precedence of the
 * view conditions is explicit and unit-testable.
 */
export function getEmptyStateMessage(p: EmptyStateParams): string {
  if (p.showTrash) return 'Trash is empty'
  if (p.showArchived) return 'No archived notes'
  if (p.showShared) return "You haven't shared any notes yet"
  if (p.searchQuery) return 'No notes match your search'
  if (p.hasSelectedTags) return 'No notes with selected tags'
  if (p.viewMode === 'folder') {
    return p.hasSelectedFolder
      ? 'No notes in this folder'
      : 'No notes without a folder'
  }
  return 'No notes yet'
}
