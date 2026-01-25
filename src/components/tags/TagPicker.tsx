import { useState } from 'react'
import { Plus, Check } from 'lucide-react'
import { useTagStore } from '@/stores/tagStore'
import { TagBadge, DEFAULT_COLORS } from './TagBadge'
import type { Tag } from '@/types'

interface TagPickerProps {
  noteId: string
  selectedTags: Tag[]
  onClose: () => void
}

export function TagPicker({ noteId, selectedTags, onClose }: TagPickerProps) {
  const { tags, createTag, addTagToNote, removeTagFromNote } = useTagStore()
  const [newTagName, setNewTagName] = useState('')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [selectedColor, setSelectedColor] = useState<string | undefined>()

  const selectedTagIds = new Set(selectedTags.map(t => t.id))

  const handleToggleTag = (tag: Tag) => {
    if (selectedTagIds.has(tag.id)) {
      removeTagFromNote(noteId, tag.id)
    } else {
      addTagToNote(noteId, tag.id)
    }
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return

    const tag = await createTag(newTagName.trim(), selectedColor)
    if (tag) {
      addTagToNote(noteId, tag.id)
      setNewTagName('')
      setSelectedColor(undefined)
      setShowColorPicker(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCreateTag()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 z-20">
      {/* Existing tags */}
      {tags.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Select tags</p>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <button
                key={tag.id}
                onClick={() => handleToggleTag(tag)}
                className="flex items-center gap-1"
              >
                <TagBadge
                  tag={tag}
                  selected={selectedTagIds.has(tag.id)}
                />
                {selectedTagIds.has(tag.id) && (
                  <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create new tag */}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Create new tag</p>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tag name"
              className="input text-sm pr-8"
              autoFocus
            />
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600"
              style={{ backgroundColor: selectedColor || '#94a3b8' }}
              title="Pick color"
            />
          </div>
          <button
            onClick={handleCreateTag}
            disabled={!newTagName.trim()}
            className="btn btn-primary p-2"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Color picker */}
        {showColorPicker && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {DEFAULT_COLORS.map(color => (
              <button
                key={color}
                onClick={() => {
                  setSelectedColor(color)
                  setShowColorPicker(false)
                }}
                className={`w-6 h-6 rounded-full ${selectedColor === color ? 'ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-800 ring-gray-400 dark:ring-gray-500' : ''}`}
                style={{ backgroundColor: color }}
              />
            ))}
            <button
              onClick={() => {
                setSelectedColor(undefined)
                setShowColorPicker(false)
              }}
              className={`w-6 h-6 rounded-full bg-gray-400 ${!selectedColor ? 'ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-800 ring-gray-400 dark:ring-gray-500' : ''}`}
              title="Auto"
            />
          </div>
        )}
      </div>

      {/* Close hint */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-center">
        Click outside to close
      </p>
    </div>
  )
}
