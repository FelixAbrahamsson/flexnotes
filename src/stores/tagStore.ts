import { create } from 'zustand'
import type { Tag, NoteTag } from '@/types'
import { supabase } from '@/services/supabase'
import { db, generateLocalId, getCurrentTimestamp, type LocalTag, type LocalNoteTag } from '@/services/db'
import { queueChange } from '@/services/sync'
import { useAuthStore } from './authStore'
import { triggerSyncIfOnline } from './syncStore'

interface TagState {
  tags: Tag[]
  noteTags: NoteTag[]
  loading: boolean
  error: string | null

  fetchTags: () => Promise<void>
  fetchNoteTags: () => Promise<void>
  createTag: (name: string, color?: string) => Promise<Tag | null>
  updateTag: (id: string, updates: Partial<Tag>) => Promise<void>
  deleteTag: (id: string) => Promise<void>
  reorderTags: (activeId: string, overId: string) => Promise<void>
  addTagToNote: (noteId: string, tagId: string) => Promise<void>
  removeTagFromNote: (noteId: string, tagId: string) => Promise<void>
  getTagsForNote: (noteId: string) => Tag[]
  getNotesForTag: (tagId: string) => string[]

  // Local-first helpers
  loadFromLocal: () => Promise<void>
  syncFromServer: () => Promise<void>
}

export const useTagStore = create<TagState>((set, get) => ({
  tags: [],
  noteTags: [],
  loading: false,
  error: null,

  loadFromLocal: async () => {
    const user = useAuthStore.getState().user
    if (!user) return

    try {
      const localTags = await db.tags
        .where('owner_id')
        .equals(user.id)
        .toArray()

      const tags: Tag[] = localTags.map(({ _syncStatus, _localUpdatedAt, ...tag }) => ({
        ...tag,
        sort_order: tag.sort_order ?? 0
      }))
      // Sort by sort_order, then by name for stable ordering
      tags.sort((a, b) => {
        const orderDiff = a.sort_order - b.sort_order
        if (orderDiff !== 0) return orderDiff
        return a.name.localeCompare(b.name)
      })

      const localNoteTags = await db.noteTags.toArray()
      const noteTags: NoteTag[] = localNoteTags
        .filter(nt => nt._syncStatus !== 'pending' || nt._operation !== 'remove')
        .map(({ _syncStatus, _operation, ...nt }) => nt)

      set({ tags, noteTags })
    } catch (error) {
      console.error('Failed to load tags from local:', error)
    }
  },

  syncFromServer: async () => {
    const user = useAuthStore.getState().user
    if (!user || !navigator.onLine) return

    try {
      // Fetch tags
      const { data: serverTags, error: tagsError } = await supabase
        .from('tags')
        .select('*')
        .eq('owner_id', user.id)

      if (tagsError) throw tagsError

      // Fetch note_tags
      const { data: serverNoteTags, error: noteTagsError } = await supabase
        .from('note_tags')
        .select('note_id, tag_id, notes!inner(owner_id)')
        .eq('notes.owner_id', user.id)

      if (noteTagsError) throw noteTagsError

      // Merge with local
      await db.transaction('rw', [db.tags, db.noteTags], async () => {
        // Sync tags
        for (const serverTag of serverTags || []) {
          const localTag = await db.tags.get(serverTag.id)
          if (localTag && localTag._syncStatus === 'pending') continue

          // Use server sort_order (synced across devices)
          const tagData: LocalTag = {
            ...serverTag,
            sort_order: serverTag.sort_order ?? localTag?.sort_order ?? 0,
            _syncStatus: 'synced',
            _localUpdatedAt: serverTag.created_at,
          }
          await db.tags.put(tagData)
        }

        // Remove deleted tags
        const localTags = await db.tags.where('owner_id').equals(user.id).toArray()
        const serverTagIds = new Set((serverTags || []).map(t => t.id))

        for (const localTag of localTags) {
          if (!serverTagIds.has(localTag.id) && localTag._syncStatus === 'synced') {
            await db.tags.delete(localTag.id)
          }
        }

        // Sync note_tags
        for (const snt of serverNoteTags || []) {
          const localNT = await db.noteTags.get([snt.note_id, snt.tag_id])
          if (localNT && localNT._syncStatus === 'pending') continue

          const ntData: LocalNoteTag = {
            note_id: snt.note_id,
            tag_id: snt.tag_id,
            _syncStatus: 'synced',
          }
          await db.noteTags.put(ntData)
        }
      })

      // Reload from local
      await get().loadFromLocal()
    } catch (error) {
      console.error('Failed to sync tags from server:', error)
    }
  },

  fetchTags: async () => {
    set({ loading: true, error: null })

    try {
      await get().loadFromLocal()
      await get().syncFromServer()
    } catch (error) {
      set({ error: (error as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  fetchNoteTags: async () => {
    // This is now handled in loadFromLocal/syncFromServer
    await get().loadFromLocal()
  },

  createTag: async (name: string, color?: string) => {
    const user = useAuthStore.getState().user
    if (!user) return null

    const id = generateLocalId()
    const now = getCurrentTimestamp()

    // New tags go at the top (lower sort_order = appears first)
    const existingTags = get().tags
    const minSortOrder = existingTags.length > 0
      ? Math.min(...existingTags.map(t => t.sort_order))
      : 1
    const sortOrder = minSortOrder - 1

    const newTag: LocalTag = {
      id,
      owner_id: user.id,
      name: name.trim(),
      color: color || null,
      sort_order: sortOrder,
      created_at: now,
      _syncStatus: 'pending',
      _localUpdatedAt: now,
    }

    try {
      await db.tags.add(newTag)
      await queueChange('tag', id, 'create')

      const uiTag: Tag = {
        id,
        owner_id: user.id,
        name: name.trim(),
        color: color || null,
        sort_order: sortOrder,
        created_at: now,
      }

      set(state => ({
        tags: [...state.tags, uiTag].sort((a, b) => a.sort_order - b.sort_order)
      }))

      triggerSyncIfOnline()

      return uiTag
    } catch (error) {
      set({ error: (error as Error).message })
      return null
    }
  },

  updateTag: async (id: string, updates: Partial<Tag>) => {
    set(state => ({
      tags: state.tags.map(t => (t.id === id ? { ...t, ...updates } : t))
    }))

    try {
      await db.tags.update(id, {
        ...updates,
        _syncStatus: 'pending',
        _localUpdatedAt: getCurrentTimestamp(),
      })

      await queueChange('tag', id, 'update', updates)

      triggerSyncIfOnline()
    } catch (error) {
      await get().loadFromLocal()
      set({ error: (error as Error).message })
    }
  },

  deleteTag: async (id: string) => {
    const previousTags = get().tags
    const previousNoteTags = get().noteTags

    set(state => ({
      tags: state.tags.filter(t => t.id !== id),
      noteTags: state.noteTags.filter(nt => nt.tag_id !== id),
    }))

    try {
      await db.tags.delete(id)
      await db.noteTags.where('tag_id').equals(id).delete()
      await queueChange('tag', id, 'delete')

      triggerSyncIfOnline()
    } catch (error) {
      set({ tags: previousTags, noteTags: previousNoteTags, error: (error as Error).message })
    }
  },

  reorderTags: async (activeId: string, overId: string) => {
    const tags = get().tags
    const oldIndex = tags.findIndex(t => t.id === activeId)
    const newIndex = tags.findIndex(t => t.id === overId)

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

    // Reorder the array
    const newTags = [...tags]
    const [removed] = newTags.splice(oldIndex, 1)
    newTags.splice(newIndex, 0, removed)

    // Update sort_order for all affected tags
    const updatedTags = newTags.map((tag, index) => ({
      ...tag,
      sort_order: index
    }))

    set({ tags: updatedTags })

    // Persist to local DB and sync to server
    try {
      await db.transaction('rw', db.tags, async () => {
        for (const tag of updatedTags) {
          await db.tags.update(tag.id, {
            sort_order: tag.sort_order,
            _syncStatus: 'pending',
            _localUpdatedAt: getCurrentTimestamp(),
          })
        }
      })

      // Queue changes for all reordered tags
      for (const tag of updatedTags) {
        await queueChange('tag', tag.id, 'update', { sort_order: tag.sort_order })
      }

      triggerSyncIfOnline()
    } catch (error) {
      await get().loadFromLocal()
      set({ error: (error as Error).message })
    }
  },

  addTagToNote: async (noteId: string, tagId: string) => {
    const exists = get().noteTags.some(
      nt => nt.note_id === noteId && nt.tag_id === tagId
    )
    if (exists) return

    set(state => ({
      noteTags: [...state.noteTags, { note_id: noteId, tag_id: tagId }]
    }))

    try {
      const ntData: LocalNoteTag = {
        note_id: noteId,
        tag_id: tagId,
        _syncStatus: 'pending',
        _operation: 'add',
      }
      await db.noteTags.put(ntData)
      await queueChange('noteTag', `${noteId}:${tagId}`, 'create')

      triggerSyncIfOnline()
    } catch (error) {
      set(state => ({
        noteTags: state.noteTags.filter(
          nt => !(nt.note_id === noteId && nt.tag_id === tagId)
        ),
        error: (error as Error).message
      }))
    }
  },

  removeTagFromNote: async (noteId: string, tagId: string) => {
    const previousNoteTags = get().noteTags

    set(state => ({
      noteTags: state.noteTags.filter(
        nt => !(nt.note_id === noteId && nt.tag_id === tagId)
      )
    }))

    try {
      await db.noteTags
        .where('[note_id+tag_id]')
        .equals([noteId, tagId])
        .delete()
      await queueChange('noteTag', `${noteId}:${tagId}`, 'delete')

      triggerSyncIfOnline()
    } catch (error) {
      set({ noteTags: previousNoteTags, error: (error as Error).message })
    }
  },

  getTagsForNote: (noteId: string) => {
    const { tags, noteTags } = get()
    const tagIds = noteTags
      .filter(nt => nt.note_id === noteId)
      .map(nt => nt.tag_id)
    return tags.filter(t => tagIds.includes(t.id))
  },

  getNotesForTag: (tagId: string) => {
    const { noteTags } = get()
    return noteTags
      .filter(nt => nt.tag_id === tagId)
      .map(nt => nt.note_id)
  },
}))
