import { create } from 'zustand'
import { useAuthStore } from './authStore'
import {
  fullSync,
  incrementalSync,
  reconcileNotes,
  processPendingChanges,
  getPendingCount,
  getConflictedNotes,
  resolveConflict,
} from '@/services/sync'
import { clearLocalData, type LocalNote } from '@/services/db'
import { supabase } from '@/services/supabase'
import { useNoteStore } from './noteStore'
import { useTagStore } from './tagStore'
import { useFolderStore } from './folderStore'

interface SyncState {
  isSyncing: boolean
  isOnline: boolean
  pendingCount: number
  lastSyncTime: string | null
  conflicts: LocalNote[]
  error: string | null

  // Actions
  setOnline: (online: boolean) => void
  /**
   * Push local changes, then pull. `reconcile` compares every note with the
   * server (catches deletions and anything the incremental pull missed).
   * Requests made while a sync runs are queued and run right after it.
   */
  sync: (opts?: { reconcile?: boolean }) => Promise<void>
  fullSync: () => Promise<void>
  resolveConflict: (noteId: string, choice: 'local' | 'server') => Promise<void>
  refreshPendingCount: () => Promise<void>
  clearAllData: () => Promise<void>

  // Realtime subscription
  subscribeToChanges: () => () => void
}

// Sync scheduling state (module-level: not UI state)
let resyncRequested = false
let reconcileRequested = false
let hasReconciled = false

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

  sync: async (opts) => {
    const user = useAuthStore.getState().user
    if (!user || !navigator.onLine) return

    if (opts?.reconcile) reconcileRequested = true
    if (get().isSyncing) {
      // Don't drop it: an event that arrives mid-sync may be for a change the
      // running pull has already passed.
      resyncRequested = true
      return
    }

    set({ isSyncing: true, error: null })

    try {
      // Reconcile on the first sync of a session too
      let rounds = 0
      do {
        resyncRequested = false
        const reconcile = reconcileRequested || !hasReconciled
        reconcileRequested = false

        // First, push local changes
        const { failed, errors } = await processPendingChanges(user.id)
        if (failed > 0) {
          console.warn('Some changes failed to sync:', errors)
        }

        // Then pull remote changes
        const merged = reconcile
          ? await reconcileNotes(user.id)
          : await incrementalSync(user.id)
        if (reconcile) hasReconciled = true

        // Remote edits merged into local ones need pushing
        if (merged > 0) await processPendingChanges(user.id)

        set({
          pendingCount: await getPendingCount(),
          conflicts: await getConflictedNotes(),
          lastSyncTime: new Date().toISOString(),
        })

        // Refresh note, tag, and folder stores to update UI with new sync status
        await useNoteStore.getState().loadFromLocal()
        await useTagStore.getState().loadFromLocal()
        await useFolderStore.getState().loadFromLocal()
      } while (resyncRequested && ++rounds < 5)
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

      // Refresh note, tag, and folder stores to update UI with new sync status
      await useNoteStore.getState().loadFromLocal()
      await useTagStore.getState().loadFromLocal()
      await useFolderStore.getState().loadFromLocal()
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
      await resolveConflict(noteId, choice)

      const conflicts = await getConflictedNotes()
      const pendingCount = await getPendingCount()
      set({ conflicts, pendingCount })

      await useNoteStore.getState().loadFromLocal()
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  refreshPendingCount: async () => {
    const pendingCount = await getPendingCount()
    const conflicts = await getConflictedNotes()
    set({ pendingCount, conflicts })
  },

  clearAllData: async () => {
    await clearLocalData()
    hasReconciled = false
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
        (payload) => {
          // Deletions don't show up in the incremental pull; reconcile for them
          get().sync({ reconcile: payload.eventType === 'DELETE' })
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
          useTagStore.getState().syncFromServer()
        }
      )
      .subscribe()

    // Subscribe to folders changes
    const foldersChannel = supabase
      .channel('folders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'folders',
          filter: `owner_id=eq.${user.id}`,
        },
        () => {
          useFolderStore.getState().syncFromServer()
        }
      )
      .subscribe()

    // Cleanup function
    return () => {
      supabase.removeChannel(notesChannel)
      supabase.removeChannel(tagsChannel)
      supabase.removeChannel(foldersChannel)
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

  // Sync when app becomes visible (user returns from another tab/app)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      // Realtime may have been asleep while hidden, so compare everything.
      // Small delay to let the app fully resume.
      setTimeout(() => {
        useSyncStore.getState().sync({ reconcile: true })
      }, 300)
    }
  })
}

// Helper to trigger sync if online - use this instead of repeating the pattern
export function triggerSyncIfOnline(): void {
  if (navigator.onLine) {
    useSyncStore.getState().sync()
  }
}
