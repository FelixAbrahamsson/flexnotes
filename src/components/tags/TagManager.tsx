import { useState } from 'react'
import { Pencil, Trash2, Check, X, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTagStore } from '@/stores/tagStore'
import { DEFAULT_COLORS, getTagColor } from './TagBadge'
import type { Tag } from '@/types'

export function TagManager() {
  const { tags, updateTag, deleteTag, reorderTags } = useTagStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState<string | null>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const handleStartEdit = (tag: Tag) => {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color)
    setShowColorPicker(false)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return

    await updateTag(editingId, { name: editName.trim(), color: editColor })
    setEditingId(null)
    setEditName('')
    setEditColor(null)
    setShowColorPicker(false)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditColor(null)
    setShowColorPicker(false)
  }

  const handleDelete = async (tag: Tag) => {
    if (window.confirm(`Delete tag "${tag.name}"? It will be removed from all notes.`)) {
      await deleteTag(tag.id)
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      reorderTags(active.id as string, over.id as string)
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={tags.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {tags.map(tag => (
            <SortableTagRow
              key={tag.id}
              tag={tag}
              isEditing={editingId === tag.id}
              editName={editName}
              editColor={editColor}
              showColorPicker={showColorPicker}
              onStartEdit={() => handleStartEdit(tag)}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              onDelete={() => handleDelete(tag)}
              onEditNameChange={setEditName}
              onEditColorChange={setEditColor}
              onToggleColorPicker={() => setShowColorPicker(!showColorPicker)}
              onCloseColorPicker={() => setShowColorPicker(false)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

interface SortableTagRowProps {
  tag: Tag
  isEditing: boolean
  editName: string
  editColor: string | null
  showColorPicker: boolean
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  onEditNameChange: (name: string) => void
  onEditColorChange: (color: string) => void
  onToggleColorPicker: () => void
  onCloseColorPicker: () => void
}

function SortableTagRow({
  tag,
  isEditing,
  editName,
  editColor,
  showColorPicker,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onEditNameChange,
  onEditColorChange,
  onToggleColorPicker,
  onCloseColorPicker,
}: SortableTagRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tag.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      }`}
    >
      {isEditing ? (
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleColorPicker}
              className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0 hover:scale-110 transition-transform"
              style={{ backgroundColor: editColor || getTagColor(tag) }}
              title="Change color"
            />
            <input
              type="text"
              value={editName}
              onChange={e => onEditNameChange(e.target.value)}
              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') onSaveEdit()
                if (e.key === 'Escape') onCancelEdit()
              }}
            />
            <button
              onClick={onSaveEdit}
              className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
              title="Save"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={onCancelEdit}
              className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {showColorPicker && (
            <div className="flex gap-2 flex-wrap pl-8 items-center">
              {DEFAULT_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => {
                    onEditColorChange(color)
                    onCloseColorPicker()
                  }}
                  className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                    editColor === color ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-800 ring-gray-400 dark:ring-gray-500' : ''
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
              <label
                className="w-6 h-6 rounded-full cursor-pointer transition-transform hover:scale-110 border border-gray-300 dark:border-gray-600"
                style={{
                  background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                }}
                title="Custom color"
              >
                <input
                  type="color"
                  value={editColor || getTagColor(tag)}
                  onChange={e => onEditColorChange(e.target.value)}
                  className="sr-only"
                />
              </label>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="p-1 text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: getTagColor(tag) }}
          />
          <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">
            {tag.name}
          </span>
          <button
            onClick={onStartEdit}
            className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  )
}
