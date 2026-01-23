import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, GripVertical, X } from 'lucide-react'
import type { ListItem, ListContent } from '@/types'

interface ListEditorProps {
  content: string
  onChange: (content: string) => void
}

export function ListEditor({ content, onChange }: ListEditorProps) {
  const [items, setItems] = useState<ListItem[]>([])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  // Parse content on mount and when it changes externally
  useEffect(() => {
    try {
      const parsed: ListContent = JSON.parse(content || '{"items":[]}')
      setItems(parsed.items || [])
    } catch {
      setItems([])
    }
  }, [content])

  const saveItems = useCallback((newItems: ListItem[]) => {
    const newContent: ListContent = { items: newItems }
    onChange(JSON.stringify(newContent))
  }, [onChange])

  const addItem = (afterId?: string) => {
    const newItem: ListItem = {
      id: `item-${Date.now()}`,
      text: '',
      checked: false,
    }

    let newItems: ListItem[]
    if (afterId) {
      const index = items.findIndex(item => item.id === afterId)
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

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return

    if (e.key === 'Enter') {
      e.preventDefault()
      addItem(id)
    } else if (e.key === 'Backspace' && item.text === '') {
      e.preventDefault()
      deleteItem(id)
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
        />
      ))}

      {/* Add item button */}
      <button
        onClick={() => addItem()}
        className="flex items-center gap-2 px-2 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg w-full"
      >
        <Plus className="w-4 h-4" />
        Add item
      </button>

      {/* Checked items */}
      {checkedItems.length > 0 && (
        <div className="pt-4 border-t border-gray-100 mt-4">
          <p className="text-xs text-gray-400 mb-2">
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
}

function ListItemRow({
  item,
  inputRef,
  onToggle,
  onTextChange,
  onKeyDown,
  onDelete,
}: ListItemRowProps) {
  return (
    <div className="flex items-center gap-2 group">
      <GripVertical className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 cursor-grab flex-shrink-0" />

      <input
        type="checkbox"
        checked={item.checked}
        onChange={onToggle}
        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
      />

      <input
        ref={inputRef}
        type="text"
        value={item.text}
        onChange={e => onTextChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="List item"
        className={`flex-1 border-0 focus:outline-none focus:ring-0 p-1 ${
          item.checked ? 'text-gray-400 line-through' : 'text-gray-900'
        }`}
      />

      <button
        onClick={onDelete}
        className="p-1 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
