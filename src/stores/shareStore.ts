import { create } from 'zustand'
import type { NoteShare } from '@/types'
import {
  createShareLink,
  getSharesForNote,
  deleteShare,
  updateSharePermission,
} from '@/services/share'

interface ShareState {
  shares: NoteShare[]
  loading: boolean
  error: string | null

  // Actions
  fetchShares: (noteId: string) => Promise<void>
  createShare: (
    noteId: string,
    permission: 'read' | 'write',
    expiresInDays?: number
  ) => Promise<{ url: string } | { error: Error }>
  removeShare: (shareId: string) => Promise<void>
  updatePermission: (shareId: string, permission: 'read' | 'write') => Promise<void>
  clearShares: () => void
}

export const useShareStore = create<ShareState>((set, get) => ({
  shares: [],
  loading: false,
  error: null,

  fetchShares: async (noteId: string) => {
    set({ loading: true, error: null })

    try {
      const shares = await getSharesForNote(noteId)
      set({ shares, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  createShare: async (
    noteId: string,
    permission: 'read' | 'write',
    expiresInDays?: number
  ) => {
    set({ loading: true, error: null })

    const result = await createShareLink(noteId, permission, expiresInDays)

    if ('error' in result) {
      set({ error: result.error.message, loading: false })
      return { error: result.error }
    }

    set(state => ({
      shares: [result.share, ...state.shares],
      loading: false,
    }))

    return { url: result.url }
  },

  removeShare: async (shareId: string) => {
    const previousShares = get().shares

    // Optimistic update
    set(state => ({
      shares: state.shares.filter(s => s.id !== shareId),
    }))

    const { error } = await deleteShare(shareId)

    if (error) {
      // Revert on error
      set({ shares: previousShares, error: error.message })
    }
  },

  updatePermission: async (shareId: string, permission: 'read' | 'write') => {
    const previousShares = get().shares

    // Optimistic update
    set(state => ({
      shares: state.shares.map(s =>
        s.id === shareId ? { ...s, permission } : s
      ),
    }))

    const { error } = await updateSharePermission(shareId, permission)

    if (error) {
      // Revert on error
      set({ shares: previousShares, error: error.message })
    }
  },

  clearShares: () => {
    set({ shares: [], error: null })
  },
}))
