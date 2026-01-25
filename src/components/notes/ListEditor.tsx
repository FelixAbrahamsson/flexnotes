import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, GripVertical, X, Check } from 'lucide-react'
import type { ListItem, ListContent } from '@/types'

interface ListEditorProps {
  content: string
  onChange: (content: string) => void
}

const MAX_INDENT = 5
const SWIPE_THRESHOLD = 40 // pixels to swipe for one indent level

interface DragState {
  draggedIds: string[]
  startIndex: number
  startX: number
  startY: number
  startIndent: number
  mode: 'undecided' | 'vertical' | 'horizontal'
}

export function ListEditor({ content, onChange }: ListEditorProps) {
  const [items, setItems] = useState<ListItem[]>([])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [draggedIds, setDraggedIds] = useState<string[]>([])
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [swipeState, setSwipeState] = useState<{ id: string; offset: number } | null>(null)

  const inputRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)

  // Use refs to avoid stale closure issues
  const itemsRef = useRef(items)
  const dragStateRef = useRef<DragState | null>(null)
  const dropTargetRef = useRef<number | null>(null)
  const swipeStateRef = useRef(swipeState)

  // Track the last content we saved to avoid resetting items from our own changes
  const lastSavedContentRef = useRef<string>('')

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    dropTargetRef.current = dropTargetIndex
  }, [dropTargetIndex])

  useEffect(() => {
    swipeStateRef.current = swipeState
  }, [swipeState])

  // Parse content on mount and when it changes externally
  // Skip if the content matches what we just saved (avoid resetting our own changes)
  useEffect(() => {
    if (content === lastSavedContentRef.current) {
      return // Skip - this is our own change coming back from the store
    }

    try {
      const parsed: ListContent = JSON.parse(content || '{"items":[]}')
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
    const contentStr = JSON.stringify(newContent)
    lastSavedContentRef.current = contentStr
    onChange(contentStr)
  }, [onChange])

  // Get an item and all its children (items with higher indent that follow it)
  const getItemWithChildren = useCallback((itemId: string, itemList: ListItem[]): string[] => {
    const index = itemList.findIndex(item => item.id === itemId)
    if (index === -1) return []

    const parentIndent = itemList[index].indent ?? 0
    const ids = [itemId]

    for (let i = index + 1; i < itemList.length; i++) {
      const itemIndent = itemList[i].indent ?? 0
      if (itemIndent > parentIndent) {
        ids.push(itemList[i].id)
      } else {
        break
      }
    }

    return ids
  }, [])

  const addItem = (afterId?: string) => {
    const newItem: ListItem = {
      id: `item-${Date.now()}`,
      text: '',
      checked: false,
      indent: 0,
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

    if (e.key === 'Enter' && !e.shiftKey) {
      // Enter without shift creates a new item
      e.preventDefault()
      addItem(id)
    } else if (e.key === 'Backspace' && item.text === '') {
      e.preventDefault()
      if ((item.indent ?? 0) > 0) {
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

  // Calculate drop target based on Y position
  const calculateDropTarget = useCallback((clientY: number): number => {
    const currentItems = itemsRef.current
    const dragState = dragStateRef.current
    if (!dragState) return 0

    let targetIndex = 0

    // Find which item we're hovering over
    for (let i = 0; i < currentItems.length; i++) {
      // Skip items being dragged
      if (dragState.draggedIds.includes(currentItems[i].id)) continue

      const rowEl = rowRefs.current.get(currentItems[i].id)
      if (rowEl) {
        const rect = rowEl.getBoundingClientRect()
        const midY = rect.top + rect.height / 2
        if (clientY > midY) {
          // Count how many non-dragged items we've passed
          targetIndex = i + 1
        }
      }
    }

    return targetIndex
  }, [])

  // Move items to new position
  const moveItemsToPosition = useCallback((draggedItemIds: string[], targetIdx: number) => {
    const currentItems = itemsRef.current
    if (draggedItemIds.length === 0) return

    const firstDraggedIndex = currentItems.findIndex(item => item.id === draggedItemIds[0])

    // Don't move if we're dropping in the same spot
    if (targetIdx === firstDraggedIndex ||
        targetIdx === firstDraggedIndex + draggedItemIds.length) {
      return
    }

    // Extract dragged items in order
    const draggedItems = draggedItemIds
      .map(id => currentItems.find(item => item.id === id))
      .filter((item): item is ListItem => item !== undefined)

    // Remove dragged items
    const remaining = currentItems.filter(item => !draggedItemIds.includes(item.id))

    // Calculate insertion point
    let insertAt = targetIdx
    if (firstDraggedIndex < targetIdx) {
      insertAt = targetIdx - draggedItemIds.length
    }
    insertAt = Math.max(0, Math.min(insertAt, remaining.length))

    // Insert at new position
    const newItems = [
      ...remaining.slice(0, insertAt),
      ...draggedItems,
      ...remaining.slice(insertAt),
    ]

    setItems(newItems)
    saveItems(newItems)
  }, [saveItems])

  // Unified drag start handler
  const startDrag = useCallback((id: string, clientX: number, clientY: number) => {
    const currentItems = itemsRef.current
    const ids = getItemWithChildren(id, currentItems)
    const startIndex = currentItems.findIndex(item => item.id === id)
    const item = currentItems.find(i => i.id === id)

    dragStateRef.current = {
      draggedIds: ids,
      startIndex,
      startX: clientX,
      startY: clientY,
      startIndent: item?.indent ?? 0,
      mode: 'undecided',
    }
    setDraggedIds(ids)
  }, [getItemWithChildren])

  // Unified drag move handler
  const moveDrag = useCallback((clientX: number, clientY: number) => {
    const dragState = dragStateRef.current
    if (!dragState) return

    const deltaX = clientX - dragState.startX
    const deltaY = clientY - dragState.startY

    // Determine mode based on which direction has more movement
    if (dragState.mode === 'undecided') {
      const threshold = 10 // pixels before deciding direction
      if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
        dragState.mode = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
      }
    }

    if (dragState.mode === 'vertical') {
      // Vertical reordering
      const target = calculateDropTarget(clientY)
      setDropTargetIndex(target)
      setSwipeState(null)
    } else if (dragState.mode === 'horizontal') {
      // Horizontal indentation
      setDropTargetIndex(null)
      const parentId = dragState.draggedIds[0]
      setSwipeState({ id: parentId, offset: deltaX })
    }
  }, [calculateDropTarget])

  // Unified drag end handler
  const endDrag = useCallback(() => {
    const dragState = dragStateRef.current
    if (!dragState) {
      setDraggedIds([])
      setDropTargetIndex(null)
      setSwipeState(null)
      return
    }

    if (dragState.mode === 'vertical') {
      // Apply vertical reordering
      const targetIndex = dropTargetRef.current
      if (targetIndex !== null) {
        moveItemsToPosition(dragState.draggedIds, targetIndex)
      }
    } else if (dragState.mode === 'horizontal') {
      // Apply horizontal indentation using ref for latest value
      const currentSwipe = swipeStateRef.current
      if (currentSwipe) {
        const indentDelta = Math.round(currentSwipe.offset / SWIPE_THRESHOLD)
        if (indentDelta !== 0) {
          const newIndent = Math.max(0, Math.min(MAX_INDENT, dragState.startIndent + indentDelta))
          setItemIndent(currentSwipe.id, newIndent)
        }
      }
    }

    dragStateRef.current = null
    dropTargetRef.current = null
    swipeStateRef.current = null
    setDraggedIds([])
    setDropTargetIndex(null)
    setSwipeState(null)
  }, [moveItemsToPosition, setItemIndent])

  // Mouse handlers
  const handleGripMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()

    startDrag(id, e.clientX, e.clientY)

    const onMouseMove = (e: MouseEvent) => {
      moveDrag(e.clientX, e.clientY)
    }

    const onMouseUp = () => {
      endDrag()
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [startDrag, moveDrag, endDrag])

  // Touch handlers
  const handleGripTouchStart = useCallback((e: React.TouchEvent, id: string) => {
    e.stopPropagation()
    const touch = e.touches[0]
    startDrag(id, touch.clientX, touch.clientY)

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      moveDrag(touch.clientX, touch.clientY)
    }

    const onTouchEnd = () => {
      endDrag()
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }

    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
  }, [startDrag, moveDrag, endDrag])

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
    <div ref={containerRef} className="space-y-1">
      {/* Unchecked items */}
      {uncheckedItems.map((item, index) => {
        const isBeingDragged = draggedIds.includes(item.id)
        const itemIndex = items.findIndex(i => i.id === item.id)
        const showDropBefore = dropTargetIndex === itemIndex && !isBeingDragged

        return (
          <div key={item.id}>
            {showDropBefore && (
              <div className="h-1 bg-primary-500 rounded-full mx-2 my-1" />
            )}
            <ListItemRow
              item={item}
              rowRef={el => {
                if (el) rowRefs.current.set(item.id, el)
                else rowRefs.current.delete(item.id)
              }}
              inputRef={el => {
                if (el) inputRefs.current.set(item.id, el)
                else inputRefs.current.delete(item.id)
              }}
              onToggle={() => updateItem(item.id, { checked: !item.checked })}
              onTextChange={text => updateItem(item.id, { text })}
              onKeyDown={e => handleKeyDown(e, item.id)}
              onDelete={() => deleteItem(item.id)}
                            isDragging={isBeingDragged}
              swipeOffset={swipeState?.id === item.id ? swipeState.offset : 0}
              onGripMouseDown={e => handleGripMouseDown(e, item.id)}
              onGripTouchStart={e => handleGripTouchStart(e, item.id)}
            />
            {/* Show drop indicator after last unchecked item */}
            {index === uncheckedItems.length - 1 &&
             dropTargetIndex !== null &&
             dropTargetIndex >= items.filter(i => !i.checked).length &&
             !isBeingDragged && (
              <div className="h-1 bg-primary-500 rounded-full mx-2 my-1" />
            )}
          </div>
        )
      })}

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
          {checkedItems.map(item => {
            const isBeingDragged = draggedIds.includes(item.id)

            return (
              <ListItemRow
                key={item.id}
                item={item}
                rowRef={el => {
                  if (el) rowRefs.current.set(item.id, el)
                  else rowRefs.current.delete(item.id)
                }}
                inputRef={el => {
                  if (el) inputRefs.current.set(item.id, el)
                  else inputRefs.current.delete(item.id)
                }}
                onToggle={() => updateItem(item.id, { checked: !item.checked })}
                onTextChange={text => updateItem(item.id, { text })}
                onKeyDown={e => handleKeyDown(e, item.id)}
                onDelete={() => deleteItem(item.id)}
                                isDragging={isBeingDragged}
                swipeOffset={swipeState?.id === item.id ? swipeState.offset : 0}
                onGripMouseDown={e => handleGripMouseDown(e, item.id)}
                onGripTouchStart={e => handleGripTouchStart(e, item.id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

interface ListItemRowProps {
  item: ListItem
  rowRef: (el: HTMLDivElement | null) => void
  inputRef: (el: HTMLTextAreaElement | null) => void
  onToggle: () => void
  onTextChange: (text: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onDelete: () => void
  isDragging: boolean
  swipeOffset: number
  onGripMouseDown: (e: React.MouseEvent) => void
  onGripTouchStart: (e: React.TouchEvent) => void
}

function ListItemRow({
  item,
  rowRef,
  inputRef,
  onToggle,
  onTextChange,
  onKeyDown,
  onDelete,
  isDragging,
  swipeOffset,
  onGripMouseDown,
  onGripTouchStart,
}: ListItemRowProps) {
  const indent = item.indent ?? 0

  return (
    <div
      ref={rowRef}
      className={`flex items-start gap-2 group rounded-lg transition-all ${
        isDragging ? 'opacity-40 bg-gray-100 dark:bg-gray-800 scale-95' : ''
      }`}
      style={{
        paddingLeft: `${indent * 24 + Math.max(-SWIPE_THRESHOLD, Math.min(SWIPE_THRESHOLD, swipeOffset))}px`,
        transition: swipeOffset === 0 && !isDragging ? 'padding-left 0.15s ease-out' : 'none'
      }}
    >
      {/* Grip handle for dragging (vertical) and swiping (horizontal) */}
      <div
        data-grip
        className="w-6 h-6 mt-0.5 flex items-center justify-center text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none select-none"
        onMouseDown={onGripMouseDown}
        onTouchStart={onGripTouchStart}
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Custom checkbox */}
      <button
        onClick={onToggle}
        className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          item.checked
            ? 'bg-primary-600 border-primary-600 text-white'
            : 'border-gray-300 dark:border-gray-500 bg-transparent hover:border-gray-400 dark:hover:border-gray-400'
        }`}
        type="button"
      >
        {item.checked && <Check className="w-3 h-3" strokeWidth={3} />}
      </button>

      <textarea
        ref={(el) => {
          inputRef(el)
          // Auto-resize on mount and when content changes
          if (el) {
            el.style.height = 'auto'
            el.style.height = `${el.scrollHeight}px`
          }
        }}
        value={item.text}
        onChange={e => {
          onTextChange(e.target.value)
          // Auto-resize on change
          e.target.style.height = 'auto'
          e.target.style.height = `${e.target.scrollHeight}px`
        }}
        onKeyDown={onKeyDown}
        placeholder="List item"
        rows={1}
        className={`flex-1 bg-transparent border-0 focus:outline-none focus:ring-0 p-1 text-sm resize-none overflow-hidden ${
          item.checked
            ? 'text-gray-400 dark:text-gray-500 line-through'
            : 'text-gray-900 dark:text-gray-100'
        } placeholder-gray-400 dark:placeholder-gray-500`}
      />

      <button
        onClick={onDelete}
        className="p-1 mt-0.5 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        type="button"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
