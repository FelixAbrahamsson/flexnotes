import { useState, useCallback } from 'react'
import {
  FolderOpen,
  Folder as FolderIcon,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Trash2,
  Plus,
  Pencil,
  Palette,
} from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useNoteStore } from '@/stores/noteStore'
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/DropdownMenu'
import { NoteTreeItem } from './NoteTreeItem'
import { getFolderColor, DEFAULT_COLORS } from './FolderBadge'
import type { Folder, Note } from '@/types'

export interface FolderTreeItemProps {
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
  onDuplicateNote: (noteId: string) => void
}

export function FolderTreeItem({
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
  onDuplicateNote,
}: FolderTreeItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const isExpanded = expandedFolders.has(folder.id)
  const color = getFolderColor(folder)
  const isCreatingHere = creatingInFolder === folder.id
  const isRenamingHere = renamingFolderId === folder.id
  const isColorPickerHere = colorPickerFolderId === folder.id

  // Draggable for moving folders (only when reorder mode is enabled)
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `folder-drag-${folder.id}`,
    data: { type: 'folder', folder },
    disabled: !reorderMode,
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
        className={`group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition-colors ${
          isOver
            ? 'bg-primary-100 dark:bg-primary-900/40 ring-2 ring-primary-500'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
        }`}
        style={{
          paddingLeft: `${level * 16 + 8}px`,
          touchAction: reorderMode ? 'none' : 'auto',
        }}
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
              onDuplicateNote={onDuplicateNote}
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
              onDuplicate={() => onDuplicateNote(note.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
