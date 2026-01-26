import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, GripVertical, X, Check, CornerDownLeft, Trash2, RotateCcw } from 'lucide-react'
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

  // Track if Shift+Enter was just pressed (to allow newlines on desktop)
  const shiftEnterPressedRef = useRef(false)

  // Track if paste just occurred (to allow pasting text with newlines)
  const pasteOccurredRef = useRef(false)

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

  // Toggle checked state - when checking, also check all children
  const toggleChecked = (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return

    const newChecked = !item.checked

    if (newChecked) {
      // Checking - also check all children
      const idsToCheck = getItemWithChildren(id, items)
      const newItems = items.map(i =>
        idsToCheck.includes(i.id) ? { ...i, checked: true } : i
      )
      setItems(newItems)
      saveItems(newItems)
    } else {
      // Unchecking - only uncheck this item
      updateItem(id, { checked: false })
    }
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

    // Enter key - create new item (Shift+Enter for newline on desktop)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      addItem(id)
      return
    }

    // Track Shift+Enter so handleTextChange doesn't treat it as mobile Enter
    if (e.key === 'Enter' && e.shiftKey) {
      shiftEnterPressedRef.current = true
    }

    // Backspace on empty item - delete it
    if (e.key === 'Backspace' && item.text.trim() === '') {
      e.preventDefault()
      deleteItem(id)
      return
    }

    // Tab for indentation
    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        indentItem(id, -1)
      } else {
        indentItem(id, 1)
      }
      return
    }

    // Arrow keys for navigation
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const index = items.findIndex(i => i.id === id)
      if (index < items.length - 1) {
        setFocusedId(items[index + 1]?.id ?? null)
      }
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const index = items.findIndex(i => i.id === id)
      if (index > 0) {
        setFocusedId(items[index - 1]?.id ?? null)
      }
    }
  }

  // Handle text changes - also catches mobile Enter key as fallback
  const handleTextChange = (id: string, newText: string, oldText: string) => {
    // Check if Shift+Enter was pressed (allow newline on desktop)
    if (shiftEnterPressedRef.current) {
      shiftEnterPressedRef.current = false
      updateItem(id, { text: newText })
      return
    }

    // Check if paste just occurred (allow pasting text with newlines)
    if (pasteOccurredRef.current) {
      pasteOccurredRef.current = false
      updateItem(id, { text: newText })
      return
    }

    // Check if a newline was just typed (mobile fallback for Enter key)
    // Count newlines in old vs new text
    const oldNewlines = (oldText.match(/\n/g) || []).length
    const newNewlines = (newText.match(/\n/g) || []).length

    // Only treat as Enter key if exactly one newline was added at the end
    // (multiple newlines means paste, newline in middle means paste)
    if (newNewlines === oldNewlines + 1 && newText.endsWith('\n')) {
      // A single newline was typed at the end - on mobile this means Enter was pressed
      // Remove the newline and create a new item instead
      const cleanedText = newText.slice(0, -1) // Remove trailing newline
      updateItem(id, { text: cleanedText })
      addItem(id)
      return
    }

    updateItem(id, { text: newText })
  }

  // Insert a newline at cursor position (for mobile)
  const insertNewline = (id: string, cursorPos: number) => {
    const item = items.find(i => i.id === id)
    if (!item) return

    const newText = item.text.slice(0, cursorPos) + '\n' + item.text.slice(cursorPos)
    updateItem(id, { text: newText })

    // Set cursor position after the newline
    setTimeout(() => {
      const textarea = inputRefs.current.get(id)
      if (textarea) {
        textarea.selectionStart = cursorPos + 1
        textarea.selectionEnd = cursorPos + 1
      }
    }, 0)
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

  const removeCompleted = () => {
    const newItems = items.filter(item => !item.checked)
    setItems(newItems)
    saveItems(newItems)
  }

  const uncheckAll = () => {
    const newItems = items.map(item => ({ ...item, checked: false }))
    setItems(newItems)
    saveItems(newItems)
  }

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
              onToggle={() => toggleChecked(item.id)}
              onTextChange={(text, oldText) => handleTextChange(item.id, text, oldText)}
              onKeyDown={e => handleKeyDown(e, item.id)}
              onPaste={() => { pasteOccurredRef.current = true }}
              onDelete={() => deleteItem(item.id)}
              onInsertNewline={cursorPos => insertNewline(item.id, cursorPos)}
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
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {checkedItems.length} completed
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={uncheckAll}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                title="Uncheck all"
              >
                <RotateCcw className="w-3 h-3" />
                Uncheck
              </button>
              <button
                onClick={removeCompleted}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                title="Remove completed"
              >
                <Trash2 className="w-3 h-3" />
                Remove
              </button>
            </div>
          </div>
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
                onToggle={() => toggleChecked(item.id)}
                onTextChange={(text, oldText) => handleTextChange(item.id, text, oldText)}
                onKeyDown={e => handleKeyDown(e, item.id)}
                onPaste={() => { pasteOccurredRef.current = true }}
                onDelete={() => deleteItem(item.id)}
                onInsertNewline={cursorPos => insertNewline(item.id, cursorPos)}
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
  onTextChange: (text: string, oldText: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onPaste: () => void
  onDelete: () => void
  onInsertNewline: (cursorPos: number) => void
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
  onPaste,
  onDelete,
  onInsertNewline,
  isDragging,
  swipeOffset,
  onGripMouseDown,
  onGripTouchStart,
}: ListItemRowProps) {
  const indent = item.indent ?? 0
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

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
          textareaRef.current = el
          inputRef(el)
          // Auto-resize on mount and when content changes
          if (el) {
            el.style.height = 'auto'
            el.style.height = `${el.scrollHeight}px`
          }
        }}
        value={item.text}
        onChange={e => {
          onTextChange(e.target.value, item.text)
          // Auto-resize on change
          e.target.style.height = 'auto'
          e.target.style.height = `${e.target.scrollHeight}px`
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder="List item"
        rows={1}
        className={`flex-1 bg-transparent border-0 focus:outline-none focus:ring-0 p-1 text-sm resize-none overflow-hidden ${
          item.checked
            ? 'text-gray-400 dark:text-gray-500 line-through'
            : 'text-gray-900 dark:text-gray-100'
        } placeholder-gray-400 dark:placeholder-gray-500`}
      />

      {/* Newline button - visible on mobile/touch, hover on desktop */}
      <button
        onClick={() => {
          const cursorPos = textareaRef.current?.selectionStart ?? item.text.length
          onInsertNewline(cursorPos)
          // Refocus and resize after inserting
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus()
              textareaRef.current.style.height = 'auto'
              textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
            }
          }, 0)
        }}
        className="p-1 mt-0.5 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0"
        type="button"
        title="Insert line break"
      >
        <CornerDownLeft className="w-4 h-4" />
      </button>

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
