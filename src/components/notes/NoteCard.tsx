import { Pin } from 'lucide-react'
import type { Note, Tag } from '@/types'
import { TagBadge } from '@/components/tags/TagBadge'

interface NoteCardProps {
  note: Note
  tags: Tag[]
  onClick: () => void
}

export function NoteCard({ note, tags, onClick }: NoteCardProps) {
  const displayTitle = note.title || 'Untitled'
  const preview = getContentPreview(note.content, note.note_type)

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-gray-900 line-clamp-1">{displayTitle}</h3>
        {note.is_pinned && (
          <Pin className="w-4 h-4 text-gray-400 flex-shrink-0 fill-current" />
        )}
      </div>

      {preview && (
        <p className="text-sm text-gray-600 mt-1 line-clamp-3 whitespace-pre-line">{preview}</p>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {tags.slice(0, 3).map(tag => (
            <TagBadge key={tag.id} tag={tag} size="sm" />
          ))}
          {tags.length > 3 && (
            <span className="text-xs text-gray-400">+{tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs text-gray-400">
          {formatDate(note.updated_at)}
        </span>
        <span className="text-xs text-gray-300">·</span>
        <span className="text-xs text-gray-400 capitalize">{note.note_type}</span>
      </div>
    </button>
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

  // For text and markdown, strip HTML tags if present
  return content.replace(/<[^>]*>/g, '').slice(0, 200)
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
