import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, GripVertical, X, Check } from 'lucide-react'
import type { ListItem, ListContent } from '@/types'

interface ListEditorProps {
  content: string
  onChange: (content: string) => void
}

const MAX_INDENT = 5
const SWIPE_THRESHOLD = 40 // pixels to swipe for one indent level

export function ListEditor({ content, onChange }: ListEditorProps) {
  const [items, setItems] = useState<ListItem[]>([])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  // Parse content on mount and when it changes externally
  useEffect(() => {
    try {
      const parsed: ListContent = JSON.parse(content || '{"items":[]}')
      // Ensure all items have indent property
      const itemsWithIndent = (parsed.items || []).map(item => ({
        ...item,
        indent: item.indent ?? 0
      }))
      setItems(itemsWithIndent)
    } catch {
      setItems([])
    }
  }, [content])

  const saveItems = useCallback((newItems: ListItem[]) => {
    const newContent: ListContent = { items: newItems }
    onChange(JSON.stringify(newContent))
  }, [onChange])

  const addItem = (afterId?: string, inheritIndent?: number) => {
    const newItem: ListItem = {
      id: `item-${Date.now()}`,
      text: '',
      checked: false,
      indent: inheritIndent ?? 0,
    }

    let newItems: ListItem[]
    if (afterId) {
      const index = items.findIndex(item => item.id === afterId)
      const currentItem = items[index]
      newItem.indent = currentItem?.indent ?? 0
      newItems = [
        ...items.slice(0, index + 1),
        newItem,
        ...items.slice(index + 1),
      ]
    } else {
      newItems = [...items, newItem]
    }

    setItems(newItems)
    saveItems(newItems)
    setFocusedId(newItem.id)
  }

  const updateItem = (id: string, updates: Partial<ListItem>) => {
    const newItems = items.map(item =>
      item.id === id ? { ...item, ...updates } : item
    )
    setItems(newItems)
    saveItems(newItems)
  }

  const deleteItem = (id: string) => {
    const index = items.findIndex(item => item.id === id)
    const newItems = items.filter(item => item.id !== id)
    setItems(newItems)
    saveItems(newItems)

    // Focus previous item or next item
    if (newItems.length > 0) {
      const newFocusIndex = Math.max(0, index - 1)
      setFocusedId(newItems[newFocusIndex]?.id ?? null)
    }
  }

  const indentItem = (id: string, direction: 1 | -1) => {
    const newItems = items.map(item => {
      if (item.id === id) {
        const newIndent = Math.max(0, Math.min(MAX_INDENT, (item.indent ?? 0) + direction))
        return { ...item, indent: newIndent }
      }
      return item
    })
    setItems(newItems)
    saveItems(newItems)
  }

  const setItemIndent = (id: string, indent: number) => {
    const newItems = items.map(item => {
      if (item.id === id) {
        const newIndent = Math.max(0, Math.min(MAX_INDENT, indent))
        return { ...item, indent: newIndent }
      }
      return item
    })
    setItems(newItems)
    saveItems(newItems)
  }

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return

    if (e.key === 'Enter') {
      e.preventDefault()
      addItem(id)
    } else if (e.key === 'Backspace' && item.text === '') {
      e.preventDefault()
      if ((item.indent ?? 0) > 0) {
        // First, reduce indent
        indentItem(id, -1)
      } else {
        deleteItem(id)
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        indentItem(id, -1)
      } else {
        indentItem(id, 1)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const index = items.findIndex(i => i.id === id)
      if (index < items.length - 1) {
        setFocusedId(items[index + 1]?.id ?? null)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const index = items.findIndex(i => i.id === id)
      if (index > 0) {
        setFocusedId(items[index - 1]?.id ?? null)
      }
    }
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    // Add a slight delay to allow the drag image to be set
    setTimeout(() => {
      const el = e.target as HTMLElement
      el.style.opacity = '0.5'
    }, 0)
  }

  const handleDragEnd = (e: React.DragEvent) => {
    const el = e.target as HTMLElement
    el.style.opacity = '1'
    setDraggedId(null)
    setDragOverId(null)
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (id !== draggedId) {
      setDragOverId(id)
    }
  }

  const handleDragLeave = () => {
    setDragOverId(null)
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    setDragOverId(null)

    if (!draggedId || draggedId === targetId) return

    const draggedIndex = items.findIndex(item => item.id === draggedId)
    const targetIndex = items.findIndex(item => item.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const newItems = [...items]
    const [draggedItem] = newItems.splice(draggedIndex, 1)
    newItems.splice(targetIndex, 0, draggedItem)

    setItems(newItems)
    saveItems(newItems)
    setDraggedId(null)
  }

  // Focus management
  useEffect(() => {
    if (focusedId) {
      const input = inputRefs.current.get(focusedId)
      if (input) {
        input.focus()
      }
    }
  }, [focusedId])

  const uncheckedItems = items.filter(item => !item.checked)
  const checkedItems = items.filter(item => item.checked)

  return (
    <div className="space-y-1">
      {/* Unchecked items */}
      {uncheckedItems.map(item => (
        <ListItemRow
          key={item.id}
          item={item}
          inputRef={el => {
            if (el) inputRefs.current.set(item.id, el)
            else inputRefs.current.delete(item.id)
          }}
          onToggle={() => updateItem(item.id, { checked: !item.checked })}
          onTextChange={text => updateItem(item.id, { text })}
          onKeyDown={e => handleKeyDown(e, item.id)}
          onDelete={() => deleteItem(item.id)}
          onIndentChange={indent => setItemIndent(item.id, indent)}
          isDragging={draggedId === item.id}
          isDragOver={dragOverId === item.id}
          onDragStart={e => handleDragStart(e, item.id)}
          onDragEnd={handleDragEnd}
          onDragOver={e => handleDragOver(e, item.id)}
          onDragLeave={handleDragLeave}
          onDrop={e => handleDrop(e, item.id)}
        />
      ))}

      {/* Add item button */}
      <button
        onClick={() => addItem()}
        className="flex items-center gap-2 px-2 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg w-full transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add item
      </button>

      {/* Checked items */}
      {checkedItems.length > 0 && (
        <div className="pt-4 border-t border-gray-100 dark:border-gray-700 mt-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
            {checkedItems.length} completed
          </p>
          {checkedItems.map(item => (
            <ListItemRow
              key={item.id}
              item={item}
              inputRef={el => {
                if (el) inputRefs.current.set(item.id, el)
                else inputRefs.current.delete(item.id)
              }}
              onToggle={() => updateItem(item.id, { checked: !item.checked })}
              onTextChange={text => updateItem(item.id, { text })}
              onKeyDown={e => handleKeyDown(e, item.id)}
              onDelete={() => deleteItem(item.id)}
              onIndentChange={indent => setItemIndent(item.id, indent)}
              isDragging={draggedId === item.id}
              isDragOver={dragOverId === item.id}
              onDragStart={e => handleDragStart(e, item.id)}
              onDragEnd={handleDragEnd}
              onDragOver={e => handleDragOver(e, item.id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, item.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface ListItemRowProps {
  item: ListItem
  inputRef: (el: HTMLInputElement | null) => void
  onToggle: () => void
  onTextChange: (text: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onDelete: () => void
  onIndentChange: (indent: number) => void
  isDragging: boolean
  isDragOver: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
}

function ListItemRow({
  item,
  inputRef,
  onToggle,
  onTextChange,
  onKeyDown,
  onDelete,
  onIndentChange,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: ListItemRowProps) {
  const indent = item.indent ?? 0
  const rowRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; indent: number } | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)

  // Touch handlers for horizontal swipe to change indent
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, indent: item.indent ?? 0 }
    setSwipeOffset(0)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const touch = e.touches[0]
    const deltaX = touch.clientX - touchStartRef.current.x
    setSwipeOffset(deltaX)
  }

  const handleTouchEnd = () => {
    if (!touchStartRef.current) return

    const indentDelta = Math.round(swipeOffset / SWIPE_THRESHOLD)
    if (indentDelta !== 0) {
      const newIndent = Math.max(0, Math.min(MAX_INDENT, touchStartRef.current.indent + indentDelta))
      onIndentChange(newIndent)
    }

    touchStartRef.current = null
    setSwipeOffset(0)
  }

  return (
    <div
      ref={rowRef}
      className={`flex items-center gap-2 group rounded-lg transition-colors ${
        isDragOver ? 'bg-primary-50 dark:bg-primary-900/20' : ''
      } ${isDragging ? 'opacity-50' : ''}`}
      style={{
        paddingLeft: `${indent * 24 + (swipeOffset > 0 ? Math.min(swipeOffset, SWIPE_THRESHOLD) : Math.max(swipeOffset, -SWIPE_THRESHOLD))}px`,
        transition: swipeOffset === 0 ? 'padding-left 0.15s ease-out' : 'none'
      }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="w-5 h-5 flex items-center justify-center text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing flex-shrink-0"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Custom checkbox for proper dark mode support */}
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          item.checked
            ? 'bg-primary-600 border-primary-600 text-white'
            : 'border-gray-300 dark:border-gray-500 bg-transparent hover:border-gray-400 dark:hover:border-gray-400'
        }`}
        type="button"
        aria-checked={item.checked}
        role="checkbox"
      >
        {item.checked && <Check className="w-3 h-3" strokeWidth={3} />}
      </button>

      <input
        ref={inputRef}
        type="text"
        value={item.text}
        onChange={e => onTextChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="List item"
        className={`flex-1 bg-transparent border-0 focus:outline-none focus:ring-0 p-1 text-sm ${
          item.checked
            ? 'text-gray-400 dark:text-gray-500 line-through'
            : 'text-gray-900 dark:text-gray-100'
        } placeholder-gray-400 dark:placeholder-gray-500`}
      />

      <button
        onClick={onDelete}
        className="p-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        type="button"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
