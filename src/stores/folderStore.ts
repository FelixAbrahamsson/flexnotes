import { create } from 'zustand'
import type { Folder } from '@/types'
import { supabase } from '@/services/supabase'
import { db, generateLocalId, getCurrentTimestamp, type LocalFolder } from '@/services/db'
import { queueChange } from '@/services/sync'
import { useAuthStore } from './authStore'
import { triggerSyncIfOnline } from './syncStore'
import { useNoteStore } from './noteStore'

interface FolderState {
  folders: Folder[]
  selectedFolderId: string | null  // Currently viewed folder (null = root)
  loading: boolean
  error: string | null

  // CRUD
  createFolder: (name: string, parentId?: string | null, color?: string) => Promise<Folder | null>
  updateFolder: (id: string, updates: Partial<Folder>) => Promise<void>
  deleteFolder: (id: string) => Promise<void>

  // Navigation
  setSelectedFolder: (id: string | null) => void
  getFolderPath: (id: string | null) => Folder[]  // Breadcrumb path from root to folder
  getChildFolders: (parentId: string | null) => Folder[]
  getFolderById: (id: string) => Folder | undefined

  // Reordering
  reorderFolders: (activeId: string, overId: string) => Promise<void>

  // Fetching
  fetchFolders: () => Promise<void>
  loadFromLocal: () => Promise<void>
  syncFromServer: () => Promise<void>
}

export const useFolderStore = create<FolderState>((set, get) => ({
  folders: [],
  selectedFolderId: null,
  loading: false,
  error: null,

  loadFromLocal: async () => {
    const user = useAuthStore.getState().user
    if (!user) return

    try {
      const localFolders = await db.folders
        .where('owner_id')
        .equals(user.id)
        .toArray()

      const folders: Folder[] = localFolders.map(({ _syncStatus, _localUpdatedAt, ...folder }) => ({
        ...folder,
        sort_order: folder.sort_order ?? 0
      }))

      // Sort by sort_order
      folders.sort((a, b) => a.sort_order - b.sort_order)

      set({ folders })
    } catch (error) {
      console.error('Failed to load folders from local:', error)
    }
  },

  syncFromServer: async () => {
    const user = useAuthStore.getState().user
    if (!user || !navigator.onLine) return

    try {
      const { data: serverFolders, error: foldersError } = await supabase
        .from('folders')
        .select('*')
        .eq('owner_id', user.id)

      if (foldersError) throw foldersError

      // Merge with local
      await db.transaction('rw', db.folders, async () => {
        for (const serverFolder of serverFolders || []) {
          const localFolder = await db.folders.get(serverFolder.id)
          if (localFolder && localFolder._syncStatus === 'pending') continue

          const folderData: LocalFolder = {
            ...serverFolder,
            sort_order: serverFolder.sort_order ?? localFolder?.sort_order ?? 0,
            _syncStatus: 'synced',
            _localUpdatedAt: serverFolder.updated_at,
          }
          await db.folders.put(folderData)
        }

        // Remove deleted folders
        const localFolders = await db.folders.where('owner_id').equals(user.id).toArray()
        const serverFolderIds = new Set((serverFolders || []).map(f => f.id))

        for (const localFolder of localFolders) {
          if (!serverFolderIds.has(localFolder.id) && localFolder._syncStatus === 'synced') {
            await db.folders.delete(localFolder.id)
          }
        }
      })

      // Reload from local
      await get().loadFromLocal()
    } catch (error) {
      console.error('Failed to sync folders from server:', error)
    }
  },

  fetchFolders: async () => {
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

  createFolder: async (name: string, parentId?: string | null, color?: string) => {
    const user = useAuthStore.getState().user
    if (!user) return null

    const id = generateLocalId()
    const now = getCurrentTimestamp()

    // New folders go at the end within their parent
    const siblingFolders = get().getChildFolders(parentId ?? null)
    const maxSortOrder = siblingFolders.length > 0
      ? Math.max(...siblingFolders.map(f => f.sort_order))
      : -1
    const sortOrder = maxSortOrder + 1

    const newFolder: LocalFolder = {
      id,
      owner_id: user.id,
      name: name.trim(),
      color: color || null,
      parent_folder_id: parentId ?? null,
      sort_order: sortOrder,
      created_at: now,
      updated_at: now,
      _syncStatus: 'pending',
      _localUpdatedAt: now,
    }

    try {
      await db.folders.add(newFolder)
      await queueChange('folder', id, 'create')

      const uiFolder: Folder = {
        id,
        owner_id: user.id,
        name: name.trim(),
        color: color || null,
        parent_folder_id: parentId ?? null,
        sort_order: sortOrder,
        created_at: now,
        updated_at: now,
      }

      set(state => ({
        folders: [...state.folders, uiFolder].sort((a, b) => a.sort_order - b.sort_order)
      }))

      triggerSyncIfOnline()

      return uiFolder
    } catch (error) {
      set({ error: (error as Error).message })
      return null
    }
  },

  updateFolder: async (id: string, updates: Partial<Folder>) => {
    const now = getCurrentTimestamp()

    set(state => ({
      folders: state.folders.map(f => (f.id === id ? { ...f, ...updates, updated_at: now } : f))
    }))

    try {
      await db.folders.update(id, {
        ...updates,
        updated_at: now,
        _syncStatus: 'pending',
        _localUpdatedAt: now,
      })

      await queueChange('folder', id, 'update', { ...updates, updated_at: now })

      triggerSyncIfOnline()
    } catch (error) {
      await get().loadFromLocal()
      set({ error: (error as Error).message })
    }
  },

  deleteFolder: async (id: string) => {
    const previousFolders = get().folders
    const folderToDelete = previousFolders.find(f => f.id === id)
    if (!folderToDelete) return

    // Move all subfolders to parent folder (or root if no parent)
    // Actually, per the plan: "Move subfolders to parent (or root)"
    // Let's move direct children to the deleted folder's parent
    const childFolders = previousFolders.filter(f => f.parent_folder_id === id)

    // Update UI state
    set(state => ({
      folders: state.folders
        .filter(f => f.id !== id)  // Remove the deleted folder
        .map(f =>
          f.parent_folder_id === id
            ? { ...f, parent_folder_id: folderToDelete.parent_folder_id }  // Move children to grandparent
            : f
        ),
      // If we're viewing the deleted folder, go to its parent
      selectedFolderId: state.selectedFolderId === id ? folderToDelete.parent_folder_id : state.selectedFolderId
    }))

    try {
      // Move notes from deleted folder to parent folder (or root)
      const { notes, moveNoteToFolder } = useNoteStore.getState()
      const notesInFolder = notes.filter(n => n.folder_id === id)
      for (const note of notesInFolder) {
        await moveNoteToFolder(note.id, folderToDelete.parent_folder_id)
      }

      // Update children to point to grandparent
      for (const child of childFolders) {
        await db.folders.update(child.id, {
          parent_folder_id: folderToDelete.parent_folder_id,
          _syncStatus: 'pending',
          _localUpdatedAt: getCurrentTimestamp(),
        })
        await queueChange('folder', child.id, 'update', {
          parent_folder_id: folderToDelete.parent_folder_id
        })
      }

      // Delete the folder
      await db.folders.delete(id)
      await queueChange('folder', id, 'delete')

      triggerSyncIfOnline()
    } catch (error) {
      set({ folders: previousFolders, error: (error as Error).message })
    }
  },

  setSelectedFolder: (id: string | null) => {
    set({ selectedFolderId: id })
  },

  getFolderPath: (id: string | null) => {
    if (!id) return []

    const { folders } = get()
    const path: Folder[] = []
    let currentId: string | null = id

    while (currentId) {
      const folder = folders.find(f => f.id === currentId)
      if (!folder) break
      path.unshift(folder)
      currentId = folder.parent_folder_id
    }

    return path
  },

  getChildFolders: (parentId: string | null) => {
    const { folders } = get()
    return folders
      .filter(f => f.parent_folder_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order)
  },

  getFolderById: (id: string) => {
    return get().folders.find(f => f.id === id)
  },

  reorderFolders: async (activeId: string, overId: string) => {
    const { folders } = get()

    // Get siblings (folders in same parent)
    const activeFolder = folders.find(f => f.id === activeId)
    if (!activeFolder) return

    const siblings = folders
      .filter(f => f.parent_folder_id === activeFolder.parent_folder_id)
      .sort((a, b) => a.sort_order - b.sort_order)

    const oldIndex = siblings.findIndex(f => f.id === activeId)
    const newIndex = siblings.findIndex(f => f.id === overId)

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

    // Reorder
    const newSiblings = [...siblings]
    const [removed] = newSiblings.splice(oldIndex, 1)
    newSiblings.splice(newIndex, 0, removed)

    // Update sort_order for all siblings
    const updatedSiblings = newSiblings.map((folder, index) => ({
      ...folder,
      sort_order: index
    }))

    // Update state
    set(state => ({
      folders: state.folders.map(f => {
        const updated = updatedSiblings.find(s => s.id === f.id)
        return updated || f
      }).sort((a, b) => a.sort_order - b.sort_order)
    }))

    // Persist to local DB
    try {
      await db.transaction('rw', db.folders, async () => {
        for (const folder of updatedSiblings) {
          await db.folders.update(folder.id, {
            sort_order: folder.sort_order,
            _syncStatus: 'pending',
            _localUpdatedAt: getCurrentTimestamp(),
          })
        }
      })

      // Queue changes for sync
      for (const folder of updatedSiblings) {
        await queueChange('folder', folder.id, 'update', { sort_order: folder.sort_order })
      }

      triggerSyncIfOnline()
    } catch (error) {
      await get().loadFromLocal()
      set({ error: (error as Error).message })
    }
  },
}))
