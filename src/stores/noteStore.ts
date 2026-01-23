import { create } from 'zustand'
import type { Note, NewNote, NoteType } from '@/types'
import { supabase } from '@/services/supabase'
import { db, generateLocalId, getCurrentTimestamp, type LocalNote } from '@/services/db'
import { queueChange } from '@/services/sync'
import { useAuthStore } from './authStore'
import { useTagStore } from './tagStore'
import { useSyncStore } from './syncStore'

interface NoteState {
  notes: Note[]
  loading: boolean
  error: string | null
  activeNoteId: string | null

  // Filters
  showArchived: boolean
  selectedTagIds: string[]
  searchQuery: string

  // Actions
  fetchNotes: () => Promise<void>
  createNote: (note?: NewNote) => Promise<Note | null>
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  setActiveNote: (id: string | null) => void

  // Filter actions
  setShowArchived: (show: boolean) => void
  setSelectedTagIds: (ids: string[]) => void
  setSearchQuery: (query: string) => void

  // Computed
  getFilteredNotes: () => Note[]
  getActiveNote: () => Note | undefined

  // Local-first helpers
  loadFromLocal: () => Promise<void>
  syncFromServer: () => Promise<void>
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  loading: false,
  error: null,
  activeNoteId: null,

  showArchived: false,
  selectedTagIds: [],
  searchQuery: '',

  // Load notes from local IndexedDB first
  loadFromLocal: async () => {
    const user = useAuthStore.getState().user
    if (!user) return

    try {
      const localNotes = await db.notes
        .where('owner_id')
        .equals(user.id)
        .toArray()

      // Convert LocalNote to Note for the UI
      const notes: Note[] = localNotes.map(({ _syncStatus, _localUpdatedAt, _serverUpdatedAt, ...note }) => ({
        ...note,
        _pendingSync: _syncStatus === 'pending',
      }))

      // Sort: pinned first, then by updated_at
      notes.sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      })

      set({ notes })
    } catch (error) {
      console.error('Failed to load notes from local:', error)
    }
  },

  // Sync notes from server (called after local load)
  syncFromServer: async () => {
    const user = useAuthStore.getState().user
    if (!user || !navigator.onLine) return

    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('owner_id', user.id)

      if (error) throw error

      // Merge server data with local
      await db.transaction('rw', db.notes, async () => {
        for (const serverNote of data || []) {
          const localNote = await db.notes.get(serverNote.id)

          // Skip if local has pending changes
          if (localNote && localNote._syncStatus === 'pending') {
            continue
          }

          const noteData: LocalNote = {
            ...serverNote,
            _syncStatus: 'synced',
            _localUpdatedAt: serverNote.updated_at,
            _serverUpdatedAt: serverNote.updated_at,
          }
          await db.notes.put(noteData)
        }

        // Check for notes deleted on server
        const localNotes = await db.notes.where('owner_id').equals(user.id).toArray()
        const serverIds = new Set((data || []).map(n => n.id))

        for (const localNote of localNotes) {
          if (!serverIds.has(localNote.id) && localNote._syncStatus === 'synced') {
            await db.notes.delete(localNote.id)
          }
        }
      })

      // Reload from local
      await get().loadFromLocal()
    } catch (error) {
      console.error('Failed to sync from server:', error)
    }
  },

  fetchNotes: async () => {
    set({ loading: true, error: null })

    try {
      // Load from local first (instant)
      await get().loadFromLocal()

      // Then sync from server (background)
      await get().syncFromServer()
    } catch (error) {
      set({ error: (error as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  createNote: async (note?: NewNote) => {
    const user = useAuthStore.getState().user
    if (!user) return null

    const id = generateLocalId()
    const now = getCurrentTimestamp()

    const newNote: LocalNote = {
      id,
      owner_id: user.id,
      title: note?.title ?? null,
      content: note?.content ?? '',
      note_type: note?.note_type ?? 'text' as NoteType,
      is_pinned: false,
      is_archived: false,
      created_at: now,
      updated_at: now,
      version: 1,
      _syncStatus: 'pending',
      _localUpdatedAt: now,
    }

    try {
      // Save to local DB first
      await db.notes.add(newNote)

      // Queue for sync
      await queueChange('note', id, 'create')

      // Update UI state
      const uiNote: Note = {
        ...newNote,
        _pendingSync: true,
      }

      set(state => ({
        notes: [uiNote, ...state.notes],
        activeNoteId: id
      }))

      // Try to sync immediately if online
      if (navigator.onLine) {
        useSyncStore.getState().sync()
      }

      return uiNote
    } catch (error) {
      set({ error: (error as Error).message })
      return null
    }
  },

  updateNote: async (id: string, updates: Partial<Note>) => {
    const now = getCurrentTimestamp()

    // Optimistic UI update
    set(state => ({
      notes: state.notes.map(n =>
        n.id === id
          ? { ...n, ...updates, updated_at: now, _pendingSync: true }
          : n
      )
    }))

    try {
      // Update local DB
      const existingNote = await db.notes.get(id)
      if (!existingNote) return

      await db.notes.update(id, {
        ...updates,
        updated_at: now,
        version: existingNote.version + 1,
        _syncStatus: 'pending',
        _localUpdatedAt: now,
      })

      // Queue for sync
      await queueChange('note', id, 'update', {
        ...updates,
        version: existingNote.version + 1,
      })

      // Update pending count
      await useSyncStore.getState().refreshPendingCount()

      // Try to sync if online
      if (navigator.onLine) {
        useSyncStore.getState().sync()
      }
    } catch (error) {
      // Revert on error - reload from local
      await get().loadFromLocal()
      set({ error: (error as Error).message })
    }
  },

  deleteNote: async (id: string) => {
    // Optimistic UI update
    const previousNotes = get().notes
    set(state => ({
      notes: state.notes.filter(n => n.id !== id),
      activeNoteId: state.activeNoteId === id ? null : state.activeNoteId
    }))

    try {
      // Delete from local DB
      await db.notes.delete(id)

      // Queue for sync
      await queueChange('note', id, 'delete')

      // Update pending count
      await useSyncStore.getState().refreshPendingCount()

      // Try to sync if online
      if (navigator.onLine) {
        useSyncStore.getState().sync()
      }
    } catch (error) {
      // Revert on error
      set({ notes: previousNotes, error: (error as Error).message })
    }
  },

  setActiveNote: (id: string | null) => {
    set({ activeNoteId: id })
  },

  setShowArchived: (show: boolean) => {
    set({ showArchived: show })
  },

  setSelectedTagIds: (ids: string[]) => {
    set({ selectedTagIds: ids })
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query })
  },

  getFilteredNotes: () => {
    const { notes, showArchived, searchQuery, selectedTagIds } = get()
    const { noteTags } = useTagStore.getState()

    return notes.filter(note => {
      // Archive filter
      if (note.is_archived !== showArchived) return false

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
          .filter(nt => nt.note_id === note.id)
          .map(nt => nt.tag_id)

        const hasAllTags = selectedTagIds.every(tagId => noteTagIds.includes(tagId))
        if (!hasAllTags) return false
      }

      return true
    })
  },

  getActiveNote: () => {
    const { notes, activeNoteId } = get()
    return notes.find(n => n.id === activeNoteId)
  },
}))
