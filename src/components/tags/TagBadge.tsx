import { X } from 'lucide-react'
import type { Tag } from '@/types'

interface TagBadgeProps {
  tag: Tag
  onRemove?: () => void
  onClick?: () => void
  selected?: boolean
  size?: 'sm' | 'md'
}

const DEFAULT_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
]

function getTagColor(tag: Tag): string {
  if (tag.color) return tag.color
  // Generate consistent color from tag name
  const hash = tag.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return DEFAULT_COLORS[hash % DEFAULT_COLORS.length] ?? DEFAULT_COLORS[0]
}

export function TagBadge({ tag, onRemove, onClick, selected, size = 'sm' }: TagBadgeProps) {
  const color = getTagColor(tag)
  const isClickable = !!onClick

  const sizeClasses = size === 'sm'
    ? 'text-xs px-2 py-0.5'
    : 'text-sm px-2.5 py-1'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium transition-all ${sizeClasses} ${
        isClickable ? 'cursor-pointer hover:opacity-80' : ''
      } ${selected ? 'ring-2 ring-offset-1' : ''}`}
      style={{
        backgroundColor: `${color}20`,
        color: color,
        ...(selected ? { ringColor: color } : {}),
      }}
      onClick={onClick}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={e => {
            e.stopPropagation()
            onRemove()
          }}
          className="hover:bg-black/10 rounded-full p-0.5 -mr-1"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  )
}

export { DEFAULT_COLORS, getTagColor }
