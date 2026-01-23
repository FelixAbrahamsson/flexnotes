import { useState } from 'react'
import { Pin, Archive, Trash2, MoreVertical, RotateCcw } from 'lucide-react'
import type { Note, Tag } from '@/types'
import { TagBadge } from '@/components/tags/TagBadge'

interface NoteCardProps {
  note: Note
  tags: Tag[]
  onClick: () => void
  onArchive?: () => void
  onDelete?: () => void
  onRestore?: () => void
  showRestore?: boolean
}

export function NoteCard({ note, tags, onClick, onArchive, onDelete, onRestore, showRestore }: NoteCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const displayTitle = note.title || 'Untitled'
  const preview = getContentPreview(note.content, note.note_type)

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(!showMenu)
  }

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(false)
    onArchive?.()
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(false)
    onDelete?.()
  }

  const handleRestore = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(false)
    onRestore?.()
  }

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className="w-full text-left p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 line-clamp-1">{displayTitle}</h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            {note.is_pinned && (
              <Pin className="w-4 h-4 text-gray-400 dark:text-gray-500 fill-current" />
            )}
          </div>
        </div>

        {preview && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-3 whitespace-pre-line">{preview}</p>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.slice(0, 3).map(tag => (
              <TagBadge key={tag.id} tag={tag} size="sm" />
            ))}
            {tags.length > 3 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">+{tags.length - 3}</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatDate(note.updated_at)}
          </span>
          <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{note.note_type}</span>
          {note._pendingSync && (
            <>
              <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
              <span className="text-xs text-yellow-500">Pending sync</span>
            </>
          )}
        </div>
      </button>

      {/* Quick actions menu */}
      {(onArchive || onDelete || onRestore) && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleMenuClick}
            className="p-1.5 bg-white dark:bg-gray-700 rounded-lg shadow border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            <MoreVertical className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setShowMenu(false) }} />
              <div className="absolute right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20 min-w-[140px]">
                {showRestore && onRestore && (
                  <button
                    onClick={handleRestore}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 w-full"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Restore
                  </button>
                )}
                {onArchive && !showRestore && (
                  <button
                    onClick={handleArchive}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 w-full"
                  >
                    <Archive className="w-4 h-4" />
                    {note.is_archived ? 'Unarchive' : 'Archive'}
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 w-full"
                  >
                    <Trash2 className="w-4 h-4" />
                    {showRestore ? 'Delete forever' : 'Delete'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function getContentPreview(content: string, noteType: string): string {
  if (!content) return ''

  if (noteType === 'list') {
    try {
      const parsed = JSON.parse(content)
      if (parsed.items && Array.isArray(parsed.items)) {
        return parsed.items
          .slice(0, 3)
          .map((item: { text: string; checked: boolean }) =>
            `${item.checked ? '✓' : '○'} ${item.text}`
          )
          .join('\n')
      }
    } catch {
      return content
    }
  }

  // For text and markdown, strip HTML tags but preserve newlines
  // First replace <br>, </p>, </div> with newlines, then strip remaining tags
  let text = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
    .trim()

  return text.slice(0, 200)
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return date.toLocaleDateString()
}
