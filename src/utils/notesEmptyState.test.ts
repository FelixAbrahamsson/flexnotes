import { describe, it, expect } from 'vitest'
import { getEmptyStateMessage, type EmptyStateParams } from './notesEmptyState'

const base: EmptyStateParams = {
  showTrash: false,
  showArchived: false,
  showShared: false,
  searchQuery: '',
  hasSelectedTags: false,
  viewMode: 'list',
  hasSelectedFolder: false,
}

describe('getEmptyStateMessage', () => {
  it('defaults to "No notes yet" in the plain list view', () => {
    expect(getEmptyStateMessage(base)).toBe('No notes yet')
  })

  it('prioritizes trash, then archive, then shared', () => {
    expect(getEmptyStateMessage({ ...base, showTrash: true, showArchived: true })).toBe(
      'Trash is empty'
    )
    expect(getEmptyStateMessage({ ...base, showArchived: true, showShared: true })).toBe(
      'No archived notes'
    )
    expect(getEmptyStateMessage({ ...base, showShared: true })).toBe(
      "You haven't shared any notes yet"
    )
  })

  it('reflects active search and tag filters', () => {
    expect(getEmptyStateMessage({ ...base, searchQuery: 'x' })).toBe(
      'No notes match your search'
    )
    expect(getEmptyStateMessage({ ...base, hasSelectedTags: true })).toBe(
      'No notes with selected tags'
    )
  })

  it('distinguishes folder view root vs a selected folder', () => {
    expect(getEmptyStateMessage({ ...base, viewMode: 'folder' })).toBe(
      'No notes without a folder'
    )
    expect(
      getEmptyStateMessage({ ...base, viewMode: 'folder', hasSelectedFolder: true })
    ).toBe('No notes in this folder')
  })

  it('search takes precedence over folder view', () => {
    expect(
      getEmptyStateMessage({ ...base, viewMode: 'folder', searchQuery: 'x' })
    ).toBe('No notes match your search')
  })
})
