import { useState, useMemo } from 'react'
import {
  FileText,
  FileCode,
  ListChecks,
  MoreVertical,
  Trash2,
  FolderInput,
  Share2,
  Archive,
  Pin,
  PinOff,
  Copy,
} from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/DropdownMenu'
import { getContentPreview } from '@/utils/formatters'
import type { Note } from '@/types'

export interface NoteTreeItemProps {
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
  onDuplicate: () => void
}

export function NoteTreeItem({
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
  onDuplicate,
}: NoteTreeItemProps) {
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
      className={`group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition-colors ${
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
      {/* Spacer to align with folder chevron */}
      <div className="w-5 h-5 flex-shrink-0" />
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
            icon={<Copy className="w-4 h-4" />}
            onClick={e => {
              e.stopPropagation()
              setMenuOpen(false)
              onDuplicate()
            }}
          >
            Duplicate
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
