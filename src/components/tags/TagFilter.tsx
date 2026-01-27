import { useState, useCallback, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTagStore } from '@/stores/tagStore'
import { useNoteStore } from '@/stores/noteStore'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { TagBadge, DEFAULT_COLORS, getTagColor } from './TagBadge'
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/DropdownMenu'
import { Tag, X, Pencil, Trash2, Check } from 'lucide-react'
import type { Tag as TagType } from '@/types'

interface SortableTagProps {
  tag: TagType
  isSelected: boolean
  menuOpen: boolean
  onTagClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onCloseMenu: () => void
  onStartEdit: () => void
  onDelete: () => void
}

function SortableTag({
  tag,
  isSelected,
  menuOpen,
  onTagClick,
  onContextMenu,
  onCloseMenu,
  onStartEdit,
  onDelete,
}: SortableTagProps) {
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
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
    touchAction: 'none' as const, // Allow dnd-kit to capture touch events for dragging
  }

  // Intercept pointer down to prevent dnd-kit from capturing right-clicks
  const mergedListeners = {
    ...listeners,
    onPointerDown: (e: React.PointerEvent) => {
      // Only let dnd-kit handle left-clicks
      if (e.button === 0) {
        listeners?.onPointerDown?.(e)
      }
    },
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...mergedListeners}
      className="relative flex-shrink-0 touch-manipulation"
      onContextMenu={onContextMenu}
    >
      <TagBadge
        tag={tag}
        selected={isSelected}
        onClick={onTagClick}
      />
      <DropdownMenu
        open={menuOpen}
        onClose={onCloseMenu}
      >
        <DropdownMenuItem
          icon={<Pencil className="w-4 h-4" />}
          onClick={e => {
            e.stopPropagation()
            onStartEdit()
          }}
        >
          Edit tag
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={<Trash2 className="w-4 h-4" />}
          onClick={e => {
            e.stopPropagation()
            onDelete()
          }}
          variant="danger"
        >
          Delete tag
        </DropdownMenuItem>
      </DropdownMenu>
    </div>
  )
}

export function TagFilter() {
  const { tags, updateTag, deleteTag, reorderTags } = useTagStore()
  const { selectedTagIds, setSelectedTagIds } = useNoteStore()
  const confirm = useConfirm()

  const [menuTagId, setMenuTagId] = useState<string | null>(null)
  const [editingTag, setEditingTag] = useState<TagType | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState<string | null>(null)

  // Track double tap for mobile
  const lastTapRef = useRef<{ tagId: string; time: number } | null>(null)

  const selectedSet = new Set(selectedTagIds)

  // Drag sensors for reordering (use MouseSensor to allow right-click context menu)
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      reorderTags(active.id as string, over.id as string)
    }
  }, [reorderTags])

  const handleToggleTag = useCallback((tagId: string) => {
    if (selectedSet.has(tagId)) {
      setSelectedTagIds(selectedTagIds.filter(id => id !== tagId))
    } else {
      setSelectedTagIds([...selectedTagIds, tagId])
    }
  }, [selectedSet, selectedTagIds, setSelectedTagIds])

  const handleClearAll = () => {
    setSelectedTagIds([])
  }

  const handleContextMenu = (e: React.MouseEvent, tagId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuTagId(tagId)
  }

  // Handle tap/click - detect double tap on mobile
  const handleTagClick = useCallback((tagId: string) => {
    const now = Date.now()
    const lastTap = lastTapRef.current

    // Check for double tap (within 300ms on same tag)
    if (lastTap && lastTap.tagId === tagId && now - lastTap.time < 300) {
      // Double tap - open menu
      setMenuTagId(tagId)
      lastTapRef.current = null
    } else {
      // Single tap - toggle selection
      lastTapRef.current = { tagId, time: now }
      handleToggleTag(tagId)
    }
  }, [handleToggleTag])

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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <Tag className="w-4 h-4 text-gray-400 flex-shrink-0" />

        <SortableContext items={tags.map(t => t.id)} strategy={horizontalListSortingStrategy}>
          {tags.map(tag => (
            <SortableTag
              key={tag.id}
              tag={tag}
              isSelected={selectedSet.has(tag.id)}
              menuOpen={menuTagId === tag.id}
              onTagClick={() => handleTagClick(tag.id)}
              onContextMenu={e => handleContextMenu(e, tag.id)}
              onCloseMenu={() => setMenuTagId(null)}
              onStartEdit={() => handleStartEdit(tag)}
              onDelete={() => handleDelete(tag)}
            />
          ))}
        </SortableContext>

        {selectedTagIds.length > 0 && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex-shrink-0"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

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
    </DndContext>
  )
}
