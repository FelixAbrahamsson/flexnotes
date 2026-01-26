import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  FolderOpen,
  Folder as FolderIcon,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  FileText,
  FileCode,
  ListChecks,
  MoreVertical,
  Trash2,
  FolderInput,
  Plus,
  Share2,
  Archive,
  Pin,
  PinOff,
  Pencil,
  Palette,
} from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { hapticLight } from '@/hooks/useCapacitor'
import { useFolderStore } from '@/stores/folderStore'
import { useNoteStore } from '@/stores/noteStore'
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/DropdownMenu'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { getContentPreview } from '@/utils/formatters'
import type { Folder, Note } from '@/types'
import { getFolderColor, DEFAULT_COLORS } from './FolderBadge'

interface TreeItemProps {
  folder: Folder
  notes: Note[]
  allFolders: Folder[]
  level: number
  selectedNoteId: string | null
  expandedFolders: Set<string>
  reorderMode: boolean
  creatingInFolder: string | null | false
  newFolderName: string
  renamingFolderId: string | null
  renameFolderValue: string
  colorPickerFolderId: string | null
  onNewFolderNameChange: (name: string) => void
  onToggleExpand: (folderId: string) => void
  onSelectNote: (noteId: string) => void
  onDeleteFolder: (folder: Folder) => void
  onCreateNote: (folderId: string | null) => void
  onCreateSubfolder: (parentFolderId: string) => void
  onCreateFolderSubmit: () => void
  onCreateFolderCancel: () => void
  onRenameFolder: (folderId: string, currentName: string) => void
  onRenameFolderChange: (name: string) => void
  onRenameFolderSubmit: () => void
  onRenameFolderCancel: () => void
  onOpenColorPicker: (folderId: string) => void
  onCloseColorPicker: () => void
  onChangeColor: (folderId: string, color: string | null) => void
  onMoveNote: (noteId: string) => void
  onShareNote: (noteId: string) => void
  onArchiveNote: (noteId: string) => void
  onPinNote: (noteId: string) => void
}

// Draggable note item in the tree
function NoteTreeItem({
  note,
  isSelected,
  level,
  reorderMode,
  onSelect,
  onMove,
  onDelete,
  onShare,
  onArchive,
  onPin,
}: {
  note: Note
  isSelected: boolean
  level: number
  reorderMode: boolean
  onSelect: () => void
  onMove: () => void
  onDelete: () => void
  onShare: () => void
  onArchive: () => void
  onPin: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `note-${note.id}`,
    data: { type: 'note', note },
  })

  const title = note.title || 'Untitled note'
  const preview = useMemo(() => {
    return getContentPreview(note.content, note.note_type, 50)
  }, [note.content, note.note_type])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuOpen(true)
  }

  return (
    <div
      ref={setDragRef}
      {...attributes}
      {...listeners}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
        isSelected
          ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
      } ${isDragging ? 'opacity-50' : ''}`}
      style={{
        paddingLeft: `${level * 16 + 8}px`,
        touchAction: reorderMode ? 'none' : 'auto',
      }}
      onClick={onSelect}
      onContextMenu={handleContextMenu}
    >
      {note.note_type === 'list' ? (
        <ListChecks className={`w-4 h-4 flex-shrink-0 ${note.is_pinned ? 'text-amber-500' : 'text-gray-400'}`} />
      ) : note.note_type === 'markdown' ? (
        <FileCode className={`w-4 h-4 flex-shrink-0 ${note.is_pinned ? 'text-amber-500' : 'text-gray-400'}`} />
      ) : (
        <FileText className={`w-4 h-4 flex-shrink-0 ${note.is_pinned ? 'text-amber-500' : 'text-gray-400'}`} />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        {preview && !note.title && (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{preview}</div>
        )}
      </div>

      {/* Actions menu - always visible on mobile, hover on desktop */}
      <div className="relative flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          onClick={e => {
            e.stopPropagation()
            setMenuOpen(!menuOpen)
          }}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
        >
          <MoreVertical className="w-3 h-3" />
        </button>

        <DropdownMenu open={menuOpen} onClose={() => setMenuOpen(false)}>
          <DropdownMenuItem
            icon={note.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            onClick={e => {
              e.stopPropagation()
              setMenuOpen(false)
              onPin()
            }}
          >
            {note.is_pinned ? 'Unpin' : 'Pin'}
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<Share2 className="w-4 h-4" />}
            onClick={e => {
              e.stopPropagation()
              setMenuOpen(false)
              onShare()
            }}
          >
            Share
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<FolderInput className="w-4 h-4" />}
            onClick={e => {
              e.stopPropagation()
              setMenuOpen(false)
              onMove()
            }}
          >
            Move to folder
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<Archive className="w-4 h-4" />}
            onClick={e => {
              e.stopPropagation()
              setMenuOpen(false)
              onArchive()
            }}
          >
            {note.is_archived ? 'Unarchive' : 'Archive'}
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<Trash2 className="w-4 h-4" />}
            onClick={e => {
              e.stopPropagation()
              setMenuOpen(false)
              onDelete()
            }}
            variant="danger"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    </div>
  )
}

// Folder tree item (can be expanded to show children)
function FolderTreeItem({
  folder,
  notes,
  allFolders,
  level,
  selectedNoteId,
  expandedFolders,
  reorderMode,
  creatingInFolder,
  newFolderName,
  renamingFolderId,
  renameFolderValue,
  colorPickerFolderId,
  onNewFolderNameChange,
  onToggleExpand,
  onSelectNote,
  onDeleteFolder,
  onCreateNote,
  onCreateSubfolder,
  onCreateFolderSubmit,
  onCreateFolderCancel,
  onRenameFolder,
  onRenameFolderChange,
  onRenameFolderSubmit,
  onRenameFolderCancel,
  onOpenColorPicker,
  onCloseColorPicker,
  onChangeColor,
  onMoveNote,
  onShareNote,
  onArchiveNote,
  onPinNote,
}: TreeItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const isExpanded = expandedFolders.has(folder.id)
  const color = getFolderColor(folder)
  const isCreatingHere = creatingInFolder === folder.id
  const isRenamingHere = renamingFolderId === folder.id
  const isColorPickerHere = colorPickerFolderId === folder.id

  // Draggable for moving folders
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `folder-drag-${folder.id}`,
    data: { type: 'folder', folder },
  })

  // Droppable for notes and folders
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: 'folder', folder },
  })

  // Merge refs for drag and drop on the same element
  const setNodeRef = useCallback((node: HTMLDivElement | null) => {
    setDragRef(node)
    setDropRef(node)
  }, [setDragRef, setDropRef])

  // Get notes in this folder
  const folderNotes = notes.filter(n => n.folder_id === folder.id && !n.is_deleted && !n.is_archived)

  // Get subfolders
  const childFolders = allFolders.filter(f => f.parent_folder_id === folder.id)
  const hasChildren = childFolders.length > 0 || folderNotes.length > 0 || isCreatingHere

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuOpen(true)
  }

  return (
    <div style={{ opacity: isDragging ? 0.5 : 1 }}>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={`group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition-colors touch-manipulation ${
          isOver
            ? 'bg-primary-100 dark:bg-primary-900/40 ring-2 ring-primary-500'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onToggleExpand(folder.id)}
        onContextMenu={handleContextMenu}
      >
        {/* Expand/collapse chevron */}
        <button
          className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded flex-shrink-0"
          onClick={e => {
            e.stopPropagation()
            onToggleExpand(folder.id)
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )
          ) : (
            <div className="w-4 h-4" />
          )}
        </button>

        {/* Folder icon */}
        {isExpanded ? (
          <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color }} />
        ) : (
          <FolderIcon className="w-4 h-4 flex-shrink-0" style={{ color }} />
        )}

        {/* Folder name - inline rename input or text */}
        {isRenamingHere ? (
          <input
            type="text"
            value={renameFolderValue}
            onChange={e => onRenameFolderChange(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter') onRenameFolderSubmit()
              if (e.key === 'Escape') onRenameFolderCancel()
            }}
            onClick={e => e.stopPropagation()}
            className="flex-1 min-w-0 px-1 py-0 text-sm font-medium border border-primary-500 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
            autoFocus
          />
        ) : (
          <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
            {folder.name}
          </span>
        )}

        {/* Item count */}
        {folderNotes.length > 0 && !isRenamingHere && (
          <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
            {folderNotes.length}
          </span>
        )}

        {/* Add button - always visible on mobile, hover on desktop */}
        <div className="relative flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => {
              e.stopPropagation()
              setAddMenuOpen(!addMenuOpen)
            }}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
          >
            <Plus className="w-3 h-3" />
          </button>

          <DropdownMenu open={addMenuOpen} onClose={() => setAddMenuOpen(false)}>
            <DropdownMenuItem
              icon={<Plus className="w-4 h-4" />}
              onClick={e => {
                e.stopPropagation()
                setAddMenuOpen(false)
                onCreateNote(folder.id)
              }}
            >
              New note
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<FolderPlus className="w-4 h-4" />}
              onClick={e => {
                e.stopPropagation()
                setAddMenuOpen(false)
                onCreateSubfolder(folder.id)
              }}
            >
              New folder
            </DropdownMenuItem>
          </DropdownMenu>
        </div>

        {/* Actions menu - always visible on mobile, hover on desktop */}
        <div className="relative flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => {
              e.stopPropagation()
              setMenuOpen(!menuOpen)
            }}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
          >
            <MoreVertical className="w-3 h-3" />
          </button>

          <DropdownMenu open={menuOpen} onClose={() => setMenuOpen(false)}>
            <DropdownMenuItem
              icon={<Pencil className="w-4 h-4" />}
              onClick={e => {
                e.stopPropagation()
                setMenuOpen(false)
                onRenameFolder(folder.id, folder.name)
              }}
            >
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<Palette className="w-4 h-4" />}
              onClick={e => {
                e.stopPropagation()
                setMenuOpen(false)
                onOpenColorPicker(folder.id)
              }}
            >
              Change color
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<Trash2 className="w-4 h-4" />}
              onClick={e => {
                e.stopPropagation()
                setMenuOpen(false)
                onDeleteFolder(folder)
              }}
              variant="danger"
            >
              Delete folder
            </DropdownMenuItem>
          </DropdownMenu>
        </div>
      </div>

      {/* Color picker */}
      {isColorPickerHere && (
        <div
          className="flex items-center gap-2 px-2 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700"
          style={{ paddingLeft: `${level * 16 + 32}px` }}
          onClick={e => e.stopPropagation()}
        >
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Color:</span>
          {DEFAULT_COLORS.map(c => (
            <button
              key={c}
              onClick={() => onChangeColor(folder.id, c)}
              className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
                folder.color === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
          <button
            onClick={() => onChangeColor(folder.id, null)}
            className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 bg-gradient-to-br from-gray-300 to-gray-500 dark:from-gray-500 dark:to-gray-700 ${
              !folder.color ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'
            }`}
            title="Auto"
          />
          <button
            onClick={onCloseColorPicker}
            className="ml-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Done
          </button>
        </div>
      )}

      {/* Children (subfolders + notes) */}
      {(isExpanded || isCreatingHere) && (
        <div>
          {/* New subfolder input */}
          {isCreatingHere && (
            <div
              className="flex items-center gap-2 px-2 py-1"
              style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
            >
              <FolderIcon className="w-4 h-4 flex-shrink-0 text-gray-400" />
              <input
                type="text"
                value={newFolderName}
                onChange={e => onNewFolderNameChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onCreateFolderSubmit()
                  if (e.key === 'Escape') onCreateFolderCancel()
                }}
                placeholder="Folder name"
                className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
              />
              <button
                onClick={onCreateFolderSubmit}
                disabled={!newFolderName.trim()}
                className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}

          {/* Subfolders */}
          {childFolders.map(childFolder => (
            <FolderTreeItem
              key={childFolder.id}
              folder={childFolder}
              notes={notes}
              allFolders={allFolders}
              level={level + 1}
              selectedNoteId={selectedNoteId}
              expandedFolders={expandedFolders}
              reorderMode={reorderMode}
              creatingInFolder={creatingInFolder}
              newFolderName={newFolderName}
              renamingFolderId={renamingFolderId}
              renameFolderValue={renameFolderValue}
              colorPickerFolderId={colorPickerFolderId}
              onNewFolderNameChange={onNewFolderNameChange}
              onToggleExpand={onToggleExpand}
              onSelectNote={onSelectNote}
              onDeleteFolder={onDeleteFolder}
              onCreateNote={onCreateNote}
              onCreateSubfolder={onCreateSubfolder}
              onCreateFolderSubmit={onCreateFolderSubmit}
              onCreateFolderCancel={onCreateFolderCancel}
              onRenameFolder={onRenameFolder}
              onRenameFolderChange={onRenameFolderChange}
              onRenameFolderSubmit={onRenameFolderSubmit}
              onRenameFolderCancel={onRenameFolderCancel}
              onOpenColorPicker={onOpenColorPicker}
              onCloseColorPicker={onCloseColorPicker}
              onChangeColor={onChangeColor}
              onMoveNote={onMoveNote}
              onShareNote={onShareNote}
              onArchiveNote={onArchiveNote}
              onPinNote={onPinNote}
            />
          ))}

          {/* Notes in this folder */}
          {folderNotes.map(note => (
            <NoteTreeItem
              key={note.id}
              note={note}
              isSelected={note.id === selectedNoteId}
              level={level + 1}
              reorderMode={reorderMode}
              onSelect={() => onSelectNote(note.id)}
              onMove={() => onMoveNote(note.id)}
              onDelete={() => useNoteStore.getState().trashNote(note.id)}
              onShare={() => onShareNote(note.id)}
              onArchive={() => onArchiveNote(note.id)}
              onPin={() => onPinNote(note.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

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
