import { useState, useCallback } from 'react'
import { FolderOpen, ChevronRight, Home, Check, X } from 'lucide-react'
import { useFolderStore } from '@/stores/folderStore'
import { getFolderColor } from './FolderBadge'

interface FolderPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (folderId: string | null) => void
  currentFolderId?: string | null
  title?: string
}

export function FolderPicker({
  open,
  onClose,
  onSelect,
  currentFolderId,
  title = 'Move to folder',
}: FolderPickerProps) {
  const { getChildFolders, getFolderPath, getFolderById } = useFolderStore()
  const [viewingFolderId, setViewingFolderId] = useState<string | null>(null)

  // Get folders to display based on current view
  const childFolders = getChildFolders(viewingFolderId)
  const breadcrumbPath = getFolderPath(viewingFolderId)
  const viewingFolder = viewingFolderId ? getFolderById(viewingFolderId) : null

  const handleSelect = useCallback((folderId: string | null) => {
    onSelect(folderId)
    onClose()
    setViewingFolderId(null)
  }, [onSelect, onClose])

  const handleClose = useCallback(() => {
    onClose()
    setViewingFolderId(null)
  }, [onClose])

  const handleNavigate = useCallback((folderId: string) => {
    setViewingFolderId(folderId)
  }, [])

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
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-xl z-50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Breadcrumb navigation */}
        {breadcrumbPath.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
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

        {/* Current location header with back button and select */}
        <div className="px-4 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
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
                <span className="font-medium text-gray-900 dark:text-gray-100">Root</span>
              </>
            )}
          </div>

          {/* Select current location button */}
          <button
            onClick={() => handleSelect(viewingFolderId)}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              viewingFolderId === currentFolderId
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {viewingFolderId === currentFolderId ? (
              <>
                <Check className="w-4 h-4" />
                Current
              </>
            ) : (
              'Select'
            )}
          </button>
        </div>

        {/* Folder list */}
        <div className="max-h-[300px] overflow-y-auto">
          {childFolders.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {viewingFolder ? 'No subfolders' : 'No folders yet'}
            </div>
          ) : (
            <div className="py-2">
              {childFolders.map(folder => (
                <div
                  key={folder.id}
                  className={`flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors ${
                    folder.id === currentFolderId
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  onClick={() => handleNavigate(folder.id)}
                >
                  <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: getFolderColor(folder) }} />
                  <span className="flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                    {folder.name}
                  </span>
                  {folder.id === currentFolderId && (
                    <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                  )}
                  <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-50" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with remove from folder option */}
        {currentFolderId && viewingFolderId !== null && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <button
              onClick={() => handleSelect(null)}
              className="w-full px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-center"
            >
              Remove from folder (move to root)
            </button>
          </div>
        )}
      </div>
    </>
  )
}
