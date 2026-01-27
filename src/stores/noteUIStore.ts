import { create } from 'zustand'
import type { Note } from '@/types'
import { useTagStore } from './tagStore'

const NOTES_PER_PAGE = 20

export type SharedTab = 'by_me' | 'with_me'

interface NoteUIState {
  // Active note
  activeNoteId: string | null

  // View toggles
  showArchived: boolean
  showTrash: boolean
  showShared: boolean
  sharedTab: SharedTab

  // Filters
  selectedTagIds: string[]
  searchQuery: string

  // Pagination
  displayLimit: number

  // Actions
  setActiveNote: (id: string | null) => void

  // View toggle actions
  setShowArchived: (show: boolean) => void
  setShowTrash: (show: boolean) => void
  setShowShared: (show: boolean) => void
  setSharedTab: (tab: SharedTab) => void

  // Filter actions
  setSelectedTagIds: (ids: string[]) => void
  setSearchQuery: (query: string) => void

  // Pagination actions
  loadMoreNotes: () => void
  resetDisplayLimit: () => void

  // Computed helpers (require notes to be passed in)
  getFilteredNotes: (
    notes: Note[],
    sharedNoteIds: Set<string>
  ) => Note[]
  getPaginatedNotes: (
    notes: Note[],
    sharedNoteIds: Set<string>
  ) => Note[]
  hasMoreNotes: (
    notes: Note[],
    sharedNoteIds: Set<string>
  ) => boolean
  getActiveNote: (notes: Note[]) => Note | undefined
}

export const useNoteUIStore = create<NoteUIState>((set, get) => ({
  activeNoteId: null,
  showArchived: false,
  showTrash: false,
  showShared: false,
  sharedTab: 'with_me' as SharedTab,
  selectedTagIds: [],
  searchQuery: '',
  displayLimit: NOTES_PER_PAGE,

  setActiveNote: (id: string | null) => {
    set({ activeNoteId: id })
  },

  setShowArchived: (show: boolean) => {
    set({
      showArchived: show,
      showTrash: false,
      showShared: false,
      displayLimit: NOTES_PER_PAGE,
    })
  },

  setShowTrash: (show: boolean) => {
    set({
      showTrash: show,
      showArchived: false,
      showShared: false,
      displayLimit: NOTES_PER_PAGE,
    })
  },

  setShowShared: (show: boolean) => {
    set({
      showShared: show,
      showArchived: false,
      showTrash: false,
      displayLimit: NOTES_PER_PAGE,
    })
  },

  setSharedTab: (tab: SharedTab) => {
    set({ sharedTab: tab, displayLimit: NOTES_PER_PAGE })
  },

  setSelectedTagIds: (ids: string[]) => {
    set({ selectedTagIds: ids, displayLimit: NOTES_PER_PAGE })
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query, displayLimit: NOTES_PER_PAGE })
  },

  loadMoreNotes: () => {
    set((state) => ({ displayLimit: state.displayLimit + NOTES_PER_PAGE }))
  },

  resetDisplayLimit: () => {
    set({ displayLimit: NOTES_PER_PAGE })
  },

  getFilteredNotes: (notes: Note[], sharedNoteIds: Set<string>) => {
    const { showArchived, showTrash, showShared, searchQuery, selectedTagIds } = get()
    const { noteTags } = useTagStore.getState()

    return notes.filter((note) => {
      // Trash filter
      if (showTrash) {
        return note.is_deleted === true
      }

      // Exclude deleted notes from normal views
      if (note.is_deleted) return false

      // Shared filter - show only notes that have been shared
      if (showShared) {
        if (!sharedNoteIds.has(note.id)) return false
        // In shared view, show both archived and non-archived shared notes
      } else {
        // Archive filter (only apply when not in shared view)
        if (note.is_archived !== showArchived) return false
      }

      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const titleMatch = note.title?.toLowerCase().includes(q)
        const contentMatch = note.content.toLowerCase().includes(q)
        if (!titleMatch && !contentMatch) return false
      }

      // Tag filter - note must have ALL selected tags
      if (selectedTagIds.length > 0) {
        const noteTagIds = noteTags
          .filter((nt) => nt.note_id === note.id)
          .map((nt) => nt.tag_id)

        const hasAllTags = selectedTagIds.every((tagId) =>
          noteTagIds.includes(tagId)
        )
        if (!hasAllTags) return false
      }

      return true
    })
  },

  getPaginatedNotes: (notes: Note[], sharedNoteIds: Set<string>) => {
    const { displayLimit } = get()
    const allFiltered = get().getFilteredNotes(notes, sharedNoteIds)
    return allFiltered.slice(0, displayLimit)
  },

  hasMoreNotes: (notes: Note[], sharedNoteIds: Set<string>) => {
    const { displayLimit } = get()
    const allFiltered = get().getFilteredNotes(notes, sharedNoteIds)
    return allFiltered.length > displayLimit
  },

  getActiveNote: (notes: Note[]) => {
    const { activeNoteId } = get()
    return notes.find((n) => n.id === activeNoteId)
  },
}))
