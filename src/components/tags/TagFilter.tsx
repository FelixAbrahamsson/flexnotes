import { useState } from 'react'
import { useTagStore } from '@/stores/tagStore'
import { useNoteStore } from '@/stores/noteStore'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { TagBadge, DEFAULT_COLORS, getTagColor } from './TagBadge'
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/DropdownMenu'
import { Tag, X, Pencil, Trash2, Check } from 'lucide-react'
import type { Tag as TagType } from '@/types'

export function TagFilter() {
  const { tags, updateTag, deleteTag } = useTagStore()
  const { selectedTagIds, setSelectedTagIds } = useNoteStore()
  const confirm = useConfirm()

  const [menuTagId, setMenuTagId] = useState<string | null>(null)
  const [editingTag, setEditingTag] = useState<TagType | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState<string | null>(null)

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

  const handleContextMenu = (e: React.MouseEvent, tagId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuTagId(tagId)
  }

  const handleStartEdit = (tag: TagType) => {
    setMenuTagId(null)
    setEditingTag(tag)
    setEditName(tag.name)
    setEditColor(tag.color)
  }

  const handleSaveEdit = async () => {
    if (!editingTag || !editName.trim()) return
    await updateTag(editingTag.id, { name: editName.trim(), color: editColor })
    setEditingTag(null)
    setEditName('')
    setEditColor(null)
  }

  const handleCancelEdit = () => {
    setEditingTag(null)
    setEditName('')
    setEditColor(null)
  }

  const handleDelete = async (tag: TagType) => {
    setMenuTagId(null)
    const confirmed = await confirm({
      title: 'Delete tag',
      message: `Delete "${tag.name}"? It will be removed from all notes.`,
      confirmText: 'Delete',
      variant: 'danger',
    })
    if (confirmed) {
      await deleteTag(tag.id)
    }
  }

  if (tags.length === 0) return null

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
      <Tag className="w-4 h-4 text-gray-400 flex-shrink-0" />

      {tags.map(tag => (
        <div key={tag.id} className="relative flex-shrink-0">
          <button
            onClick={() => handleToggleTag(tag.id)}
            onContextMenu={e => handleContextMenu(e, tag.id)}
          >
            <TagBadge
              tag={tag}
              selected={selectedSet.has(tag.id)}
            />
          </button>

          {/* Context menu */}
          <DropdownMenu
            open={menuTagId === tag.id}
            onClose={() => setMenuTagId(null)}
          >
            <DropdownMenuItem
              icon={<Pencil className="w-4 h-4" />}
              onClick={e => {
                e.stopPropagation()
                handleStartEdit(tag)
              }}
            >
              Edit tag
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<Trash2 className="w-4 h-4" />}
              onClick={e => {
                e.stopPropagation()
                handleDelete(tag)
              }}
              variant="danger"
            >
              Delete tag
            </DropdownMenuItem>
          </DropdownMenu>
        </div>
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

      {/* Edit tag modal */}
      {editingTag && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCancelEdit}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4 w-full max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Edit tag
            </h3>

            <div className="space-y-4">
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Tag name"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveEdit()
                  if (e.key === 'Escape') handleCancelEdit()
                }}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Color
                </label>
                <div className="flex gap-2 flex-wrap">
                  {DEFAULT_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setEditColor(color)}
                      className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${
                        editColor === color ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-800 ring-primary-500' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <label
                    className="w-8 h-8 rounded-full cursor-pointer transition-transform hover:scale-110 border border-gray-300 dark:border-gray-600 flex items-center justify-center"
                    style={{
                      background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                    }}
                    title="Custom color"
                  >
                    <input
                      type="color"
                      value={editColor || getTagColor(editingTag)}
                      onChange={e => setEditColor(e.target.value)}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editName.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 flex items-center gap-1"
                >
                  <Check className="w-4 h-4" />
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
