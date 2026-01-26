import { useState, useCallback } from 'react'
import { FolderOpen, FolderPlus, Edit2, Trash2, ChevronRight, Home, X, Check } from 'lucide-react'
import { hapticLight } from '@/hooks/useCapacitor'
import { useFolderStore } from '@/stores/folderStore'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { Folder } from '@/types'
import { DEFAULT_COLORS, getFolderColor } from './FolderBadge'

interface FolderManagerProps {
  open: boolean
  onClose: () => void
}

export function FolderManager({ open, onClose }: FolderManagerProps) {
  const {
    folders,
    getChildFolders,
    getFolderPath,
    getFolderById,
    createFolder,
    updateFolder,
    deleteFolder,
  } = useFolderStore()

  const [viewingFolderId, setViewingFolderId] = useState<string | null>(null)
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const confirm = useConfirm()

  // Get folders to display
  const childFolders = getChildFolders(viewingFolderId)
  const breadcrumbPath = getFolderPath(viewingFolderId)
  const viewingFolder = viewingFolderId ? getFolderById(viewingFolderId) : null

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return

    hapticLight()
    await createFolder(newFolderName.trim(), viewingFolderId)
    setNewFolderName('')
    setIsCreating(false)
  }

  const handleDeleteFolder = async (folder: Folder) => {
    const confirmed = await confirm({
      title: 'Delete folder',
      message: `Delete "${folder.name}"? Notes in this folder will be moved to ${viewingFolder ? viewingFolder.name : 'root'}.`,
      confirmText: 'Delete',
      variant: 'danger',
    })

    if (confirmed) {
      hapticLight()
      await deleteFolder(folder.id)
    }
  }

  const handleGoBack = useCallback(() => {
    if (viewingFolder) {
      setViewingFolderId(viewingFolder.parent_folder_id)
    }
  }, [viewingFolder])

  const handleGoToRoot = useCallback(() => {
    setViewingFolderId(null)
  }, [])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-xl z-50 overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Manage Folders</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Edit folder view */}
        {editingFolder ? (
          <FolderEditView
            folder={editingFolder}
            onSave={async (updates) => {
              await updateFolder(editingFolder.id, updates)
              setEditingFolder(null)
            }}
            onCancel={() => setEditingFolder(null)}
          />
        ) : (
          <>
            {/* Breadcrumb navigation */}
            {breadcrumbPath.length > 0 && (
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
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
                        onClick={() => setViewingFolderId(folder.id)}
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
            <div className="px-4 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                {viewingFolder ? (
                  <>
                    <button
                      onClick={handleGoBack}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      title="Go back"
                    >
                      <ChevronRight className="w-4 h-4 rotate-180" />
                    </button>
                    <FolderOpen className="w-5 h-5" style={{ color: getFolderColor(viewingFolder) }} />
                    <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {viewingFolder.name}
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
                className="flex items-center gap-1 px-2 py-1 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded"
              >
                <FolderPlus className="w-4 h-4" />
                New
              </button>
            </div>

            {/* New folder input */}
            {isCreating && (
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
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
                    className="px-2 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setNewFolderName('')
                      setIsCreating(false)
                    }}
                    className="px-2 py-1 text-sm text-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Folder list */}
            <div className="flex-1 overflow-y-auto">
              {childFolders.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  {viewingFolder ? 'No subfolders' : 'No folders yet'}
                </div>
              ) : (
                <div className="py-2">
                  {childFolders.map(folder => (
                    <div
                      key={folder.id}
                      className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <button
                        onClick={() => setViewingFolderId(folder.id)}
                        className="flex items-center gap-2 flex-1 min-w-0"
                      >
                        <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: getFolderColor(folder) }} />
                        <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                          {folder.name}
                        </span>
                        <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-50 ml-auto" />
                      </button>

                      <button
                        onClick={() => setEditingFolder(folder)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded flex-shrink-0"
                        title="Edit folder"
                      >
                        <Edit2 className="w-4 h-4 text-gray-500" />
                      </button>

                      <button
                        onClick={() => handleDeleteFolder(folder)}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded flex-shrink-0"
                        title="Delete folder"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stats footer */}
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                {folders.length} folder{folders.length !== 1 ? 's' : ''} total
              </p>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// Edit view for a single folder
interface FolderEditViewProps {
  folder: Folder
  onSave: (updates: Partial<Folder>) => Promise<void>
  onCancel: () => void
}

function FolderEditView({ folder, onSave, onCancel }: FolderEditViewProps) {
  const [name, setName] = useState(folder.name)
  const [color, setColor] = useState(folder.color || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return

    setSaving(true)
    await onSave({
      name: name.trim(),
      color: color || null,
    })
    setSaving(false)
  }

  return (
    <div className="p-4 space-y-4">
      {/* Back button */}
      <button
        onClick={onCancel}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <ChevronRight className="w-4 h-4 rotate-180" />
        Back
      </button>

      {/* Folder name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Color picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Color
        </label>
        <div className="flex flex-wrap gap-2">
          {/* No color option */}
          <button
            onClick={() => setColor('')}
            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
              !color
                ? 'border-primary-500 ring-2 ring-primary-500/30'
                : 'border-gray-300 dark:border-gray-600'
            }`}
            title="Auto (based on name)"
          >
            {!color && <Check className="w-4 h-4 text-gray-500" />}
          </button>

          {/* Color options */}
          {DEFAULT_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                color === c
                  ? 'border-gray-900 dark:border-white ring-2'
                  : 'border-transparent'
              }`}
              style={{ backgroundColor: c, ...(color === c ? { '--tw-ring-color': c } as React.CSSProperties : {}) }}
              title={c}
            >
              {color === c && <Check className="w-4 h-4 text-white" />}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Preview
        </label>
        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
          <FolderOpen
            className="w-5 h-5"
            style={{ color: color || getFolderColor({ ...folder, color: null }) }}
          />
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {name || 'Folder name'}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="flex-1 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
