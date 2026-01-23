import { useTagStore } from '@/stores/tagStore'
import { useNoteStore } from '@/stores/noteStore'
import { TagBadge } from './TagBadge'
import { Tag, X } from 'lucide-react'

export function TagFilter() {
  const { tags } = useTagStore()
  const { selectedTagIds, setSelectedTagIds } = useNoteStore()

  const selectedSet = new Set(selectedTagIds)

  const handleToggleTag = (tagId: string) => {
    if (selectedSet.has(tagId)) {
      setSelectedTagIds(selectedTagIds.filter(id => id !== tagId))
    } else {
      setSelectedTagIds([...selectedTagIds, tagId])
    }
  }

  const handleClearAll = () => {
    setSelectedTagIds([])
  }

  if (tags.length === 0) return null

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
      <Tag className="w-4 h-4 text-gray-400 flex-shrink-0" />

      {tags.map(tag => (
        <button key={tag.id} onClick={() => handleToggleTag(tag.id)}>
          <TagBadge
            tag={tag}
            selected={selectedSet.has(tag.id)}
          />
        </button>
      ))}

      {selectedTagIds.length > 0 && (
        <button
          onClick={handleClearAll}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 flex-shrink-0"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  )
}
