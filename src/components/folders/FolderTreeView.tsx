import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  FolderPlus,
  Folder as FolderIcon,
  Plus,
} from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { hapticLight } from '@/hooks/useCapacitor'
import { useFolderStore } from '@/stores/folderStore'
import { useNoteStore } from '@/stores/noteStore'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { FolderTreeItem } from './FolderTreeItem'
import { NoteTreeItem } from './NoteTreeItem'
import type { Folder } from '@/types'

interface FolderTreeViewProps {
  selectedNoteId: string | null
  searchQuery: string
  reorderMode?: boolean
  onSelectNote: (noteId: string) => void
  onCreateNote: (folderId: string | null) => void
  onMoveNote: (noteId: string) => void
  onShareNote: (noteId: string) => void
  onArchiveNote: (noteId: string) => void
  onPinNote: (noteId: string) => void
  onDuplicateNote: (noteId: string) => void
}

export function FolderTreeView({
  selectedNoteId,
  searchQuery,
  reorderMode = false,
  onSelectNote,
  onCreateNote,
  onMoveNote,
  onShareNote,
  onArchiveNote,
  onPinNote,
  onDuplicateNote,
}: FolderTreeViewProps) {
  const { folders, createFolder, deleteFolder } = useFolderStore()
  const { notes: allNotes } = useNoteStore()
  const confirm = useConfirm()

  // Filter notes based on search query
  const notes = useMemo(() => {
    if (!searchQuery.trim()) return allNotes
    const query = searchQuery.toLowerCase()
    return allNotes.filter(note => {
      const titleMatch = note.title?.toLowerCase().includes(query)
      const contentMatch = note.content.toLowerCase().includes(query)
      return titleMatch || contentMatch
    })
  }, [allNotes, searchQuery])

  // Track expanded folders
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  // Helper to get all parent folder IDs for a given folder
  const getParentFolderIds = useCallback((folderId: string | null): string[] => {
    if (!folderId) return []
    const parentIds: string[] = []
    let currentFolderId: string | null = folderId
    while (currentFolderId) {
      parentIds.push(currentFolderId)
      const folder = folders.find(f => f.id === currentFolderId)
      currentFolderId = folder?.parent_folder_id ?? null
    }
    return parentIds
  }, [folders])

  // Auto-expand parent folders when a note is selected (e.g., on page load from URL)
  useEffect(() => {
    if (!selectedNoteId) return
    const note = notes.find(n => n.id === selectedNoteId)
    if (!note?.folder_id) return

    const parentIds = getParentFolderIds(note.folder_id)
    if (parentIds.length > 0) {
      setExpandedFolders(prev => {
        const next = new Set(prev)
        parentIds.forEach(id => next.add(id))
        return next
      })
    }
  }, [selectedNoteId, notes, getParentFolderIds])

  // Track new folder creation - parentId is null for root, or the parent folder's ID
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingInFolder, setCreatingInFolder] = useState<string | null | false>(false) // false = not creating

  // Track folder renaming
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameFolderValue, setRenameFolderValue] = useState('')

  // Track color picker
  const [colorPickerFolderId, setColorPickerFolderId] = useState<string | null>(null)

  // Get updateFolder from store
  const { updateFolder } = useFolderStore()

  // Get root folders
  const rootFolders = folders.filter(f => f.parent_folder_id === null)

  // Get notes without a folder (root level)
  const rootNotes = notes.filter(n => n.folder_id === null && !n.is_deleted && !n.is_archived)

  // Droppable for root level (unfiled notes)
  const { isOver: isOverRoot, setNodeRef: setRootDropRef } = useDroppable({
    id: 'folder-root',
    data: { type: 'folder', folder: null },
  })

  const handleToggleExpand = useCallback((folderId: string) => {
    hapticLight()
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }, [])

  const handleDeleteFolder = async (folder: Folder) => {
    const confirmed = await confirm({
      title: 'Delete folder',
      message: `Delete "${folder.name}"? Notes will be moved to the parent folder.`,
      confirmText: 'Delete',
      variant: 'danger',
    })

    if (confirmed) {
      hapticLight()
      await deleteFolder(folder.id)
    }
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || creatingInFolder === false) return

    hapticLight()
    const parentId = creatingInFolder === null ? undefined : creatingInFolder
    const newFolder = await createFolder(newFolderName.trim(), parentId)

    // Auto-expand the parent folder to show the new subfolder
    if (newFolder && creatingInFolder) {
      setExpandedFolders(prev => new Set([...prev, creatingInFolder]))
    }

    setNewFolderName('')
    setCreatingInFolder(false)
  }

  const handleCreateSubfolder = useCallback((parentFolderId: string) => {
    // Expand the parent folder and show the input
    setExpandedFolders(prev => new Set([...prev, parentFolderId]))
    setCreatingInFolder(parentFolderId)
    setNewFolderName('')
  }, [])

  // Rename handlers
  const handleRenameFolder = useCallback((folderId: string, currentName: string) => {
    setRenamingFolderId(folderId)
    setRenameFolderValue(currentName)
  }, [])

  const handleRenameFolderSubmit = useCallback(async () => {
    if (!renamingFolderId || !renameFolderValue.trim()) return
    hapticLight()
    await updateFolder(renamingFolderId, { name: renameFolderValue.trim() })
    setRenamingFolderId(null)
    setRenameFolderValue('')
  }, [renamingFolderId, renameFolderValue, updateFolder])

  const handleRenameFolderCancel = useCallback(() => {
    setRenamingFolderId(null)
    setRenameFolderValue('')
  }, [])

  // Color picker handlers
  const handleOpenColorPicker = useCallback((folderId: string) => {
    setColorPickerFolderId(folderId)
  }, [])

  const handleCloseColorPicker = useCallback(() => {
    setColorPickerFolderId(null)
  }, [])

  const handleChangeColor = useCallback(async (folderId: string, color: string | null) => {
    hapticLight()
    await updateFolder(folderId, { color })
    setColorPickerFolderId(null)
  }, [updateFolder])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
        <span className="font-medium text-gray-900 dark:text-gray-100">Files</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onCreateNote(null)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            title="New note"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCreatingInFolder(null)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            title="New folder"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* New root folder input */}
      {creatingInFolder === null && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateFolder()
                if (e.key === 'Escape') {
                  setNewFolderName('')
                  setCreatingInFolder(false)
                }
              }}
              placeholder="Folder name"
              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              className="px-2 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Root folders */}
        {rootFolders.map(folder => (
          <FolderTreeItem
            key={folder.id}
            folder={folder}
            notes={notes}
            allFolders={folders}
            level={0}
            selectedNoteId={selectedNoteId}
            expandedFolders={expandedFolders}
            reorderMode={reorderMode}
            creatingInFolder={creatingInFolder}
            newFolderName={newFolderName}
            renamingFolderId={renamingFolderId}
            renameFolderValue={renameFolderValue}
            colorPickerFolderId={colorPickerFolderId}
            onNewFolderNameChange={setNewFolderName}
            onToggleExpand={handleToggleExpand}
            onSelectNote={onSelectNote}
            onDeleteFolder={handleDeleteFolder}
            onCreateNote={onCreateNote}
            onCreateSubfolder={handleCreateSubfolder}
            onCreateFolderSubmit={handleCreateFolder}
            onCreateFolderCancel={() => setCreatingInFolder(false)}
            onRenameFolder={handleRenameFolder}
            onRenameFolderChange={setRenameFolderValue}
            onRenameFolderSubmit={handleRenameFolderSubmit}
            onRenameFolderCancel={handleRenameFolderCancel}
            onOpenColorPicker={handleOpenColorPicker}
            onCloseColorPicker={handleCloseColorPicker}
            onChangeColor={handleChangeColor}
            onMoveNote={onMoveNote}
            onShareNote={onShareNote}
            onArchiveNote={onArchiveNote}
            onPinNote={onPinNote}
            onDuplicateNote={onDuplicateNote}
          />
        ))}

        {/* Unfiled notes section */}
        {rootNotes.length > 0 && (
          <div
            ref={setRootDropRef}
            className={`mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 ${
              isOverRoot ? 'bg-primary-50 dark:bg-primary-900/20' : ''
            }`}
          >
            <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Unfiled
            </div>
            {rootNotes.map(note => (
              <NoteTreeItem
                key={note.id}
                note={note}
                isSelected={note.id === selectedNoteId}
                level={0}
                reorderMode={reorderMode}
                onSelect={() => onSelectNote(note.id)}
                onMove={() => onMoveNote(note.id)}
                onDelete={() => useNoteStore.getState().trashNote(note.id)}
                onShare={() => onShareNote(note.id)}
                onArchive={() => onArchiveNote(note.id)}
                onPin={() => onPinNote(note.id)}
                onDuplicate={() => onDuplicateNote(note.id)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {rootFolders.length === 0 && rootNotes.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            <p className="mb-2">No notes yet</p>
            <button
              onClick={() => onCreateNote(null)}
              className="text-primary-600 dark:text-primary-400 hover:underline"
            >
              Create your first note
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
