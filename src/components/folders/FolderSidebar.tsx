import { useState, useCallback } from 'react'
import { FolderOpen, FolderPlus, ChevronRight, Home, MoreVertical, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { hapticLight } from '@/hooks/useCapacitor'
import { useFolderStore } from '@/stores/folderStore'
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/DropdownMenu'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { Folder } from '@/types'
import { getFolderColor } from './FolderBadge'

interface FolderItemProps {
  folder: Folder
  isSelected: boolean
  onClick: () => void
  onDelete: () => void
}

function SortableFolderItem({ folder, isSelected, onClick, onDelete }: FolderItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: folder.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const color = getFolderColor(folder)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isSelected
          ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
      }`}
      onClick={onClick}
    >
      <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color }} />
      <span className="flex-1 truncate text-sm font-medium">{folder.name}</span>
      <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-50" />

      {/* Folder actions menu */}
      <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={e => {
            e.stopPropagation()
            setMenuOpen(!menuOpen)
          }}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        <DropdownMenu open={menuOpen} onClose={() => setMenuOpen(false)}>
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

export function FolderSidebar() {
  const {
    selectedFolderId,
    setSelectedFolder,
    getChildFolders,
    getFolderPath,
    getFolderById,
    createFolder,
    deleteFolder,
    reorderFolders,
  } = useFolderStore()

  const [newFolderName, setNewFolderName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const confirm = useConfirm()

  // Get current folder and its children
  const currentFolder = selectedFolderId ? getFolderById(selectedFolderId) : null
  const childFolders = getChildFolders(selectedFolderId)
  const breadcrumbPath = getFolderPath(selectedFolderId)

  // Drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      hapticLight()
      reorderFolders(active.id as string, over.id as string)
    }
  }, [reorderFolders])

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return

    hapticLight()
    await createFolder(newFolderName.trim(), selectedFolderId)
    setNewFolderName('')
    setIsCreating(false)
  }

  const handleDeleteFolder = async (folder: Folder) => {
    const confirmed = await confirm({
      title: 'Delete folder',
      message: `Delete "${folder.name}"? Notes in this folder will be moved to ${currentFolder ? currentFolder.name : 'root'}.`,
      confirmText: 'Delete',
      variant: 'danger',
    })

    if (confirmed) {
      hapticLight()
      await deleteFolder(folder.id)
    }
  }

  const handleGoBack = () => {
    hapticLight()
    if (currentFolder) {
      setSelectedFolder(currentFolder.parent_folder_id)
    }
  }

  const handleGoToRoot = () => {
    hapticLight()
    setSelectedFolder(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb navigation */}
      {breadcrumbPath.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 overflow-x-auto">
            <button
              onClick={handleGoToRoot}
              className="hover:text-gray-700 dark:hover:text-gray-200 flex-shrink-0"
            >
              <Home className="w-4 h-4" />
            </button>
            {breadcrumbPath.map((folder, index) => (
              <div key={folder.id} className="flex items-center gap-1 flex-shrink-0">
                <ChevronRight className="w-3 h-3" />
                <button
                  onClick={() => setSelectedFolder(folder.id)}
                  className={`hover:text-gray-700 dark:hover:text-gray-200 truncate max-w-[100px] ${
                    index === breadcrumbPath.length - 1 ? 'font-medium text-gray-700 dark:text-gray-200' : ''
                  }`}
                >
                  {folder.name}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current location header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {currentFolder ? (
            <>
              <button
                onClick={handleGoBack}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="Go back"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <FolderOpen className="w-5 h-5" style={{ color: getFolderColor(currentFolder) }} />
              <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                {currentFolder.name}
              </span>
            </>
          ) : (
            <>
              <Home className="w-5 h-5 text-gray-500" />
              <span className="font-medium text-gray-900 dark:text-gray-100">All Folders</span>
            </>
          )}
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          title="New folder"
        >
          <FolderPlus className="w-5 h-5" />
        </button>
      </div>

      {/* New folder input */}
      {isCreating && (
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
                  setIsCreating(false)
                }
              }}
              placeholder="Folder name"
              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              className="px-2 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
            <button
              onClick={() => {
                setNewFolderName('')
                setIsCreating(false)
              }}
              className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto py-2">
        {childFolders.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
            {currentFolder ? 'No subfolders' : 'No folders yet'}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={childFolders.map(f => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1 px-2">
                {childFolders.map(folder => (
                  <SortableFolderItem
                    key={folder.id}
                    folder={folder}
                    isSelected={false}
                    onClick={() => {
                      hapticLight()
                      setSelectedFolder(folder.id)
                    }}
                    onDelete={() => handleDeleteFolder(folder)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}
