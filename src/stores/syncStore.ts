import { create } from 'zustand'
import { useAuthStore } from './authStore'
import {
  fullSync,
  incrementalSync,
  processPendingChanges,
  getPendingCount,
  getConflictedNotes,
  resolveConflict,
} from '@/services/sync'
import { clearLocalData, type LocalNote } from '@/services/db'
import { supabase } from '@/services/supabase'
import { useNoteStore } from './noteStore'
import { useTagStore } from './tagStore'

interface SyncState {
  isSyncing: boolean
  isOnline: boolean
  pendingCount: number
  lastSyncTime: string | null
  conflicts: LocalNote[]
  error: string | null

  // Actions
  setOnline: (online: boolean) => void
  sync: () => Promise<void>
  fullSync: () => Promise<void>
  resolveConflict: (noteId: string, choice: 'local' | 'server') => Promise<void>
  refreshPendingCount: () => Promise<void>
  clearAllData: () => Promise<void>

  // Realtime subscription
  subscribeToChanges: () => () => void
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isSyncing: false,
  isOnline: navigator.onLine,
  pendingCount: 0,
  lastSyncTime: null,
  conflicts: [],
  error: null,

  setOnline: (online: boolean) => {
    set({ isOnline: online })

    // Auto-sync when coming back online
    if (online && !get().isSyncing) {
      get().sync()
    }
  },

  sync: async () => {
    const user = useAuthStore.getState().user
    if (!user || get().isSyncing || !navigator.onLine) return

    set({ isSyncing: true, error: null })

    try {
      // First, push local changes
      const { failed, errors } = await processPendingChanges(user.id)

      if (failed > 0) {
        console.warn('Some changes failed to sync:', errors)
      }

      // Then pull remote changes
      await incrementalSync(user.id)

      // Check for conflicts
      const conflicts = await getConflictedNotes()

      // Update pending count
      const pendingCount = await getPendingCount()

      set({
        pendingCount,
        conflicts,
        lastSyncTime: new Date().toISOString(),
      })

      // Refresh note and tag stores to update UI with new sync status
      await useNoteStore.getState().loadFromLocal()
      await useTagStore.getState().loadFromLocal()
    } catch (error) {
      set({ error: (error as Error).message })
    } finally {
      set({ isSyncing: false })
    }
  },

  fullSync: async () => {
    const user = useAuthStore.getState().user
    if (!user || get().isSyncing || !navigator.onLine) return

    set({ isSyncing: true, error: null })

    try {
      await fullSync(user.id)

      const conflicts = await getConflictedNotes()
      const pendingCount = await getPendingCount()

      set({
        pendingCount,
        conflicts,
        lastSyncTime: new Date().toISOString(),
      })

      // Refresh note and tag stores to update UI with new sync status
      await useNoteStore.getState().loadFromLocal()
      await useTagStore.getState().loadFromLocal()
    } catch (error) {
      set({ error: (error as Error).message })
    } finally {
      set({ isSyncing: false })
    }
  },

  resolveConflict: async (noteId: string, choice: 'local' | 'server') => {
    const user = useAuthStore.getState().user
    if (!user) return

    try {
      await resolveConflict(noteId, choice, user.id)

      const conflicts = await getConflictedNotes()
      set({ conflicts })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  refreshPendingCount: async () => {
    const pendingCount = await getPendingCount()
    const conflicts = await getConflictedNotes()
    set({ pendingCount, conflicts })
  },

  clearAllData: async () => {
    await clearLocalData()
    set({
      pendingCount: 0,
      conflicts: [],
      lastSyncTime: null,
    })
  },

  subscribeToChanges: () => {
    const user = useAuthStore.getState().user
    if (!user) return () => {}

    // Subscribe to notes changes
    const notesChannel = supabase
      .channel('notes-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes',
          filter: `owner_id=eq.${user.id}`,
        },
        () => {
          // Trigger sync on remote changes
          get().sync()
        }
      )
      .subscribe()

    // Subscribe to tags changes
    const tagsChannel = supabase
      .channel('tags-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tags',
          filter: `owner_id=eq.${user.id}`,
        },
        () => {
          get().sync()
        }
      )
      .subscribe()

    // Cleanup function
    return () => {
      supabase.removeChannel(notesChannel)
      supabase.removeChannel(tagsChannel)
    }
  },
}))

// Initialize online/offline listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useSyncStore.getState().setOnline(true)
  })

  window.addEventListener('offline', () => {
    useSyncStore.getState().setOnline(false)
  })
}
