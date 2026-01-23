import { create } from 'zustand'
import type { Note, NewNote, NoteType } from '@/types'
import { supabase } from '@/services/supabase'
import { db, generateLocalId, getCurrentTimestamp, type LocalNote } from '@/services/db'
import { queueChange } from '@/services/sync'
import { useAuthStore } from './authStore'
import { useTagStore } from './tagStore'
import { useSyncStore } from './syncStore'

// Constants
const TRASH_RETENTION_DAYS = 30

interface NoteState {
  notes: Note[]
  loading: boolean
  error: string | null
  activeNoteId: string | null

  // Filters
  showArchived: boolean
  showTrash: boolean
  selectedTagIds: string[]
  searchQuery: string

  // Actions
  fetchNotes: () => Promise<void>
  createNote: (note?: NewNote) => Promise<Note | null>
  createNoteFromImport: (note: Omit<Note, 'id'> & { id: string }) => Promise<string>
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  trashNote: (id: string) => Promise<void>
  restoreNote: (id: string) => Promise<void>
  permanentlyDeleteNote: (id: string) => Promise<void>
  emptyTrash: () => Promise<void>
  cleanupOldTrash: () => Promise<void>
  setActiveNote: (id: string | null) => void
  deleteNoteIfEmpty: (id: string) => Promise<boolean>

  // Filter actions
  setShowArchived: (show: boolean) => void
  setShowTrash: (show: boolean) => void
  setSelectedTagIds: (ids: string[]) => void
  setSearchQuery: (query: string) => void

  // Computed
  getFilteredNotes: () => Note[]
  getActiveNote: () => Note | undefined
  getTrashedNotes: () => Note[]
  getTrashCount: () => number

  // Local-first helpers
  loadFromLocal: () => Promise<void>
  syncFromServer: () => Promise<void>
}

// Check if a note is empty (no title and no meaningful content)
function isNoteEmpty(note: Note): boolean {
  const hasTitle = note.title && note.title.trim().length > 0
  if (hasTitle) return false

  // Check content based on note type
  if (note.note_type === 'list') {
    try {
      const parsed = JSON.parse(note.content)
      if (parsed.items && Array.isArray(parsed.items)) {
        return parsed.items.every((item: { text: string }) => !item.text.trim())
      }
    } catch {
      return !note.content.trim()
    }
  }

  // For text and markdown, strip HTML and check
  const textContent = note.content
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()

  return textContent.length === 0
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  loading: false,
  error: null,
  activeNoteId: null,

  showArchived: false,
  showTrash: false,
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
        is_deleted: note.is_deleted ?? false,
        deleted_at: note.deleted_at ?? null,
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
            is_deleted: serverNote.is_deleted ?? false,
            deleted_at: serverNote.deleted_at ?? null,
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

      // Cleanup old trash
      await get().cleanupOldTrash()
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
      is_deleted: false,
      deleted_at: null,
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

  // Create note from imported data (preserves id and timestamps)
  createNoteFromImport: async (note) => {
    try {
      const localNote: LocalNote = {
        ...note,
        _syncStatus: 'pending',
        _localUpdatedAt: note.updated_at,
      }

      // Save to local DB
      await db.notes.add(localNote)

      // Queue for sync
      await queueChange('note', note.id, 'create')

      // Update UI state
      const uiNote: Note = {
        ...note,
        _pendingSync: true,
      }

      set(state => ({
        notes: [uiNote, ...state.notes],
      }))

      return note.id
    } catch (error) {
      console.error('Failed to import note:', error)
      throw error
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

  // Soft delete - move to trash
  trashNote: async (id: string) => {
    const now = getCurrentTimestamp()

    // Optimistic UI update
    set(state => ({
      notes: state.notes.map(n =>
        n.id === id
          ? { ...n, is_deleted: true, deleted_at: now, is_pinned: false, _pendingSync: true }
          : n
      ),
      activeNoteId: state.activeNoteId === id ? null : state.activeNoteId
    }))

    try {
      const existingNote = await db.notes.get(id)
      if (!existingNote) return

      await db.notes.update(id, {
        is_deleted: true,
        deleted_at: now,
        is_pinned: false,
        updated_at: now,
        version: existingNote.version + 1,
        _syncStatus: 'pending',
        _localUpdatedAt: now,
      })

      await queueChange('note', id, 'update', {
        is_deleted: true,
        deleted_at: now,
        is_pinned: false,
        version: existingNote.version + 1,
      })

      await useSyncStore.getState().refreshPendingCount()

      if (navigator.onLine) {
        useSyncStore.getState().sync()
      }
    } catch (error) {
      await get().loadFromLocal()
      set({ error: (error as Error).message })
    }
  },

  // Restore from trash
  restoreNote: async (id: string) => {
    const now = getCurrentTimestamp()

    set(state => ({
      notes: state.notes.map(n =>
        n.id === id
          ? { ...n, is_deleted: false, deleted_at: null, _pendingSync: true }
          : n
      )
    }))

    try {
      const existingNote = await db.notes.get(id)
      if (!existingNote) return

      await db.notes.update(id, {
        is_deleted: false,
        deleted_at: null,
        updated_at: now,
        version: existingNote.version + 1,
        _syncStatus: 'pending',
        _localUpdatedAt: now,
      })

      await queueChange('note', id, 'update', {
        is_deleted: false,
        deleted_at: null,
        version: existingNote.version + 1,
      })

      await useSyncStore.getState().refreshPendingCount()

      if (navigator.onLine) {
        useSyncStore.getState().sync()
      }
    } catch (error) {
      await get().loadFromLocal()
      set({ error: (error as Error).message })
    }
  },

  // Permanently delete (from trash)
  permanentlyDeleteNote: async (id: string) => {
    const previousNotes = get().notes
    set(state => ({
      notes: state.notes.filter(n => n.id !== id),
      activeNoteId: state.activeNoteId === id ? null : state.activeNoteId
    }))

    try {
      await db.notes.delete(id)
      await queueChange('note', id, 'delete')
      await useSyncStore.getState().refreshPendingCount()

      if (navigator.onLine) {
        useSyncStore.getState().sync()
      }
    } catch (error) {
      set({ notes: previousNotes, error: (error as Error).message })
    }
  },

  // Legacy delete - now redirects to trash
  deleteNote: async (id: string) => {
    await get().trashNote(id)
  },

  // Empty all trash
  emptyTrash: async () => {
    const trashedNotes = get().notes.filter(n => n.is_deleted)

    for (const note of trashedNotes) {
      await get().permanentlyDeleteNote(note.id)
    }
  },

  // Cleanup notes in trash older than 30 days
  cleanupOldTrash: async () => {
    const now = new Date()
    const cutoffDate = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)

    const oldTrashedNotes = get().notes.filter(n => {
      if (!n.is_deleted || !n.deleted_at) return false
      return new Date(n.deleted_at) < cutoffDate
    })

    for (const note of oldTrashedNotes) {
      await get().permanentlyDeleteNote(note.id)
    }
  },

  // Delete note if it's empty (called when closing editor)
  deleteNoteIfEmpty: async (id: string) => {
    const note = get().notes.find(n => n.id === id)
    if (!note) return false

    if (isNoteEmpty(note)) {
      // Permanently delete empty notes (don't put in trash)
      const previousNotes = get().notes
      set(state => ({
        notes: state.notes.filter(n => n.id !== id),
        activeNoteId: null
      }))

      try {
        await db.notes.delete(id)
        // Remove from pending changes since we're deleting
        await db.pendingChanges.where('entityId').equals(id).delete()
        return true
      } catch (error) {
        set({ notes: previousNotes, error: (error as Error).message })
        return false
      }
    }

    return false
  },

  setActiveNote: (id: string | null) => {
    set({ activeNoteId: id })
  },

  setShowArchived: (show: boolean) => {
    set({ showArchived: show, showTrash: false })
  },

  setShowTrash: (show: boolean) => {
    set({ showTrash: show, showArchived: false })
  },

  setSelectedTagIds: (ids: string[]) => {
    set({ selectedTagIds: ids })
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query })
  },

  getFilteredNotes: () => {
    const { notes, showArchived, showTrash, searchQuery, selectedTagIds } = get()
    const { noteTags } = useTagStore.getState()

    return notes.filter(note => {
      // Trash filter
      if (showTrash) {
        return note.is_deleted === true
      }

      // Exclude deleted notes from normal views
      if (note.is_deleted) return false

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

  getTrashedNotes: () => {
    return get().notes.filter(n => n.is_deleted)
  },

  getTrashCount: () => {
    return get().notes.filter(n => n.is_deleted).length
  },

  getActiveNote: () => {
    const { notes, activeNoteId } = get()
    return notes.find(n => n.id === activeNoteId)
  },
}))
