import { useState } from 'react'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import { useTagStore } from '@/stores/tagStore'
import type { Tag } from '@/types'

export function TagManager() {
  const { tags, updateTag, deleteTag } = useTagStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleStartEdit = (tag: Tag) => {
    setEditingId(tag.id)
    setEditName(tag.name)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return

    await updateTag(editingId, { name: editName.trim() })
    setEditingId(null)
    setEditName('')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditName('')
  }

  const handleDelete = async (tag: Tag) => {
    if (window.confirm(`Delete tag "${tag.name}"? It will be removed from all notes.`)) {
      await deleteTag(tag.id)
    }
  }

  if (tags.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
        No tags yet. Create tags when editing notes.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {tags.map(tag => (
        <div
          key={tag.id}
          className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        >
          {editingId === tag.id ? (
            <>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveEdit()
                  if (e.key === 'Escape') handleCancelEdit()
                }}
              />
              <button
                onClick={handleSaveEdit}
                className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                title="Save"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancelEdit}
                className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: tag.color || '#6366f1' }}
              />
              <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">
                {tag.name}
              </span>
              <button
                onClick={() => handleStartEdit(tag)}
                className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(tag)}
                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
