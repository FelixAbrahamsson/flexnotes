import { useState } from 'react'
import { List, FolderOpen, Archive, Trash2, ChevronDown, Check } from 'lucide-react'
import { DropdownMenu, DropdownMenuItem } from './DropdownMenu'

interface ViewSwitcherProps {
  viewMode: 'list' | 'folder'
  onViewModeChange: (mode: 'list' | 'folder') => void
  showArchived: boolean
  showTrash: boolean
  onShowArchived: (show: boolean) => void
  onShowTrash: (show: boolean) => void
  trashCount?: number
}

export function ViewSwitcher({
  viewMode,
  onViewModeChange,
  showArchived,
  showTrash,
  onShowArchived,
  onShowTrash,
  trashCount = 0,
}: ViewSwitcherProps) {
  const [open, setOpen] = useState(false)

  // Determine current display state
  const isInSpecialView = showArchived || showTrash

  const handleViewClick = (mode: 'list' | 'folder') => {
    onViewModeChange(mode)
    // Clear special views when switching view mode
    if (showArchived) onShowArchived(false)
    if (showTrash) onShowTrash(false)
    setOpen(false)
  }

  const handleArchiveClick = () => {
    // Store already handles clearing showTrash when setting showArchived
    onShowArchived(!showArchived)
    setOpen(false)
  }

  const handleTrashClick = () => {
    // Store already handles clearing showArchived when setting showTrash
    onShowTrash(!showTrash)
    setOpen(false)
  }

  // Get button icon based on current state
  const getButtonIcon = () => {
    if (showArchived) return <Archive className="w-5 h-5" />
    if (showTrash) return <Trash2 className="w-5 h-5" />
    if (viewMode === 'folder') return <FolderOpen className="w-5 h-5" />
    return <List className="w-5 h-5" />
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="btn btn-ghost p-2 flex items-center gap-1"
        title="View options"
      >
        {getButtonIcon()}
        <ChevronDown className="w-3 h-3" />
      </button>

      <DropdownMenu open={open} onClose={() => setOpen(false)} className="min-w-[180px]">
        {/* View modes */}
        <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          View
        </div>
        <DropdownMenuItem
          icon={viewMode === 'list' && !isInSpecialView ? <Check className="w-4 h-4" /> : <div className="w-4 h-4" />}
          onClick={() => handleViewClick('list')}
        >
          <List className="w-4 h-4" />
          <span>List View</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={viewMode === 'folder' && !isInSpecialView ? <Check className="w-4 h-4" /> : <div className="w-4 h-4" />}
          onClick={() => handleViewClick('folder')}
        >
          <FolderOpen className="w-4 h-4" />
          <span>Folder View</span>
        </DropdownMenuItem>

        {/* Divider */}
        <div className="my-1 border-t border-gray-200 dark:border-gray-700" />

        {/* Special views */}
        <DropdownMenuItem
          icon={showArchived ? <Check className="w-4 h-4" /> : <div className="w-4 h-4" />}
          onClick={handleArchiveClick}
        >
          <Archive className="w-4 h-4" />
          <span>Archive</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={showTrash ? <Check className="w-4 h-4" /> : <div className="w-4 h-4" />}
          onClick={handleTrashClick}
        >
          <Trash2 className="w-4 h-4" />
          <span className="flex-1">Trash</span>
          {trashCount > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {trashCount}
            </span>
          )}
        </DropdownMenuItem>
      </DropdownMenu>
    </div>
  )
}
