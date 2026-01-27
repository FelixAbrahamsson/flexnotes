import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { ListItemRow } from "./ListItemRow";
import type { ListItem, ListContent } from "@/types";

interface ListEditorProps {
  content: string;
  onChange: (content: string) => void;
}

const MAX_INDENT = 5;
const SWIPE_THRESHOLD = 40; // pixels to swipe for one indent level

interface DragState {
  draggedIds: string[];
  startIndex: number;
  startX: number;
  startY: number;
  startIndent: number;
  mode: "undecided" | "vertical" | "horizontal";
}

export function ListEditor({ content, onChange }: ListEditorProps) {
  const confirm = useConfirm();
  const [items, setItems] = useState<ListItem[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [draggedIds, setDraggedIds] = useState<string[]>([]);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [swipeState, setSwipeState] = useState<{
    id: string;
    offset: number;
  } | null>(null);

  const inputRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Use refs to avoid stale closure issues
  const itemsRef = useRef(items);
  const dragStateRef = useRef<DragState | null>(null);
  const dropTargetRef = useRef<number | null>(null);
  const swipeStateRef = useRef(swipeState);

  // Track the last content we saved to avoid resetting items from our own changes
  const lastSavedContentRef = useRef<string>("");

  // Track if Shift+Enter was just pressed (to allow newlines on desktop)
  const shiftEnterPressedRef = useRef(false);

  // Track if paste just occurred (to allow pasting text with newlines)
  const pasteOccurredRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    dropTargetRef.current = dropTargetIndex;
  }, [dropTargetIndex]);

  useEffect(() => {
    swipeStateRef.current = swipeState;
  }, [swipeState]);

  // Parse content on mount and when it changes externally
  // Skip if the content matches what we just saved (avoid resetting our own changes)
  useEffect(() => {
    if (content === lastSavedContentRef.current) {
      return; // Skip - this is our own change coming back from the store
    }

    try {
      const parsed: ListContent = JSON.parse(content || '{"items":[]}');
      const itemsWithIndent = (parsed.items || []).map((item) => ({
        ...item,
        indent: item.indent ?? 0,
      }));
      setItems(itemsWithIndent);
    } catch {
      setItems([]);
    }
  }, [content]);

  const saveItems = useCallback(
    (newItems: ListItem[]) => {
      const newContent: ListContent = { items: newItems };
      const contentStr = JSON.stringify(newContent);
      lastSavedContentRef.current = contentStr;
      onChange(contentStr);
    },
    [onChange],
  );

  // Get an item and all its children (items with higher indent that follow it)
  const getItemWithChildren = useCallback(
    (itemId: string, itemList: ListItem[]): string[] => {
      const index = itemList.findIndex((item) => item.id === itemId);
      if (index === -1) return [];

      const parentIndent = itemList[index].indent ?? 0;
      const ids = [itemId];

      for (let i = index + 1; i < itemList.length; i++) {
        const itemIndent = itemList[i].indent ?? 0;
        if (itemIndent > parentIndent) {
          ids.push(itemList[i].id);
        } else {
          break;
        }
      }

      return ids;
    },
    [],
  );

  const addItem = (afterId?: string, initialText?: string) => {
    const newItem: ListItem = {
      id: `item-${Date.now()}`,
      text: initialText ?? "",
      checked: false,
      indent: 0,
    };

    let newItems: ListItem[];
    if (afterId) {
      const index = items.findIndex((item) => item.id === afterId);
      const currentItem = items[index];
      newItem.indent = currentItem?.indent ?? 0;
      newItems = [
        ...items.slice(0, index + 1),
        newItem,
        ...items.slice(index + 1),
      ];
    } else {
      newItems = [...items, newItem];
    }

    setItems(newItems);
    saveItems(newItems);
    setFocusedId(newItem.id);
  };

  const updateItem = (id: string, updates: Partial<ListItem>) => {
    const newItems = items.map((item) =>
      item.id === id ? { ...item, ...updates } : item,
    );
    setItems(newItems);
    saveItems(newItems);
  };

  // Split an item at cursor position - keeps text before cursor, creates new item with text after
  const splitItem = (id: string, textBefore: string, textAfter: string) => {
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return;

    const currentItem = items[index];
    const newItem: ListItem = {
      id: `item-${Date.now()}`,
      text: textAfter,
      checked: false,
      indent: currentItem.indent ?? 0,
    };

    const newItems = [
      ...items.slice(0, index),
      { ...currentItem, text: textBefore },
      newItem,
      ...items.slice(index + 1),
    ];

    setItems(newItems);
    saveItems(newItems);
    setFocusedId(newItem.id);
  };

  // Merge current item with the previous item (backspace at start)
  const mergeWithPreviousItem = (id: string) => {
    const index = items.findIndex((item) => item.id === id);
    if (index <= 0) return;

    const currentItem = items[index];
    const prevItem = items[index - 1];
    const cursorPosition = prevItem.text.length; // Where to place cursor after merge

    const newItems = [
      ...items.slice(0, index - 1),
      { ...prevItem, text: prevItem.text + currentItem.text },
      ...items.slice(index + 1),
    ];

    setItems(newItems);
    saveItems(newItems);
    setFocusedId(prevItem.id);

    // Set cursor position at the join point after focus
    setTimeout(() => {
      const textarea = inputRefs.current.get(prevItem.id);
      if (textarea) {
        textarea.selectionStart = cursorPosition;
        textarea.selectionEnd = cursorPosition;
      }
    }, 0);
  };

  // Toggle checked state - when checking, also check all children
  const toggleChecked = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const newChecked = !item.checked;

    if (newChecked) {
      // Checking - also check all children
      const idsToCheck = getItemWithChildren(id, items);
      const newItems = items.map((i) =>
        idsToCheck.includes(i.id) ? { ...i, checked: true } : i,
      );
      setItems(newItems);
      saveItems(newItems);
    } else {
      // Unchecking - only uncheck this item
      updateItem(id, { checked: false });
    }
  };

  const deleteItem = (id: string) => {
    const index = items.findIndex((item) => item.id === id);
    const newItems = items.filter((item) => item.id !== id);
    setItems(newItems);
    saveItems(newItems);

    if (newItems.length > 0) {
      const newFocusIndex = Math.max(0, index - 1);
      setFocusedId(newItems[newFocusIndex]?.id ?? null);
    }
  };

  const indentItem = (id: string, direction: 1 | -1) => {
    const newItems = items.map((item) => {
      if (item.id === id) {
        const newIndent = Math.max(
          0,
          Math.min(MAX_INDENT, (item.indent ?? 0) + direction),
        );
        return { ...item, indent: newIndent };
      }
      return item;
    });
    setItems(newItems);
    saveItems(newItems);
  };

  const setItemIndent = (id: string, indent: number) => {
    const newItems = items.map((item) => {
      if (item.id === id) {
        const newIndent = Math.max(0, Math.min(MAX_INDENT, indent));
        return { ...item, indent: newIndent };
      }
      return item;
    });
    setItems(newItems);
    saveItems(newItems);
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    // Enter key - split text at cursor and create new item (Shift+Enter for newline on desktop)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();

      // Get cursor position and split text
      const textarea = e.target as HTMLTextAreaElement;
      const cursorPos = textarea.selectionStart;
      const textBefore = item.text.slice(0, cursorPos);
      const textAfter = item.text.slice(cursorPos);

      // Split the item - update current with text before, create new with text after
      splitItem(id, textBefore, textAfter);
      return;
    }

    // Track Shift+Enter so handleTextChange doesn't treat it as mobile Enter
    if (e.key === "Enter" && e.shiftKey) {
      shiftEnterPressedRef.current = true;
    }

    // Backspace at start of item - merge with previous item
    if (e.key === "Backspace") {
      const textarea = e.target as HTMLTextAreaElement;
      const cursorPos = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;

      // Only handle if cursor is at the very start with no selection
      if (cursorPos === 0 && selectionEnd === 0) {
        const index = items.findIndex((i) => i.id === id);

        // If this is the first item and it's empty, just delete it
        if (index === 0) {
          if (item.text.trim() === "") {
            e.preventDefault();
            deleteItem(id);
          }
          return;
        }

        // Find the previous unchecked item to merge with
        // (we only show unchecked items together, so merge within that group)
        const prevItem = items[index - 1];
        if (prevItem && !prevItem.checked) {
          e.preventDefault();
          mergeWithPreviousItem(id);
        }
        return;
      }

      // Backspace on empty item - delete it (fallback for non-start positions)
      if (item.text.trim() === "") {
        e.preventDefault();
        deleteItem(id);
        return;
      }
    }

    // Tab for indentation
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        indentItem(id, -1);
      } else {
        indentItem(id, 1);
      }
      return;
    }

    // Arrow keys for navigation between items
    // Only navigate to another item when at the very edge of the current item
    if (e.key === "ArrowDown") {
      const textarea = e.target as HTMLTextAreaElement;
      const { selectionStart, selectionEnd, value } = textarea;

      // Check if cursor is on the last line AND at the end of the text
      const textAfterCursor = value.substring(selectionStart);
      const isOnLastLine = !textAfterCursor.includes('\n');
      const isAtEnd = selectionStart === value.length && selectionStart === selectionEnd;

      // Only navigate to next item if we're at the very end
      if (isOnLastLine && isAtEnd) {
        // Find next unchecked item
        const uncheckedItems = items.filter((i) => !i.checked);
        const currentUncheckedIndex = uncheckedItems.findIndex((i) => i.id === id);

        if (currentUncheckedIndex < uncheckedItems.length - 1) {
          e.preventDefault();
          const nextItem = uncheckedItems[currentUncheckedIndex + 1];
          setFocusedId(nextItem.id);
          // Put cursor at the start of the next item
          setTimeout(() => {
            const nextTextarea = inputRefs.current.get(nextItem.id);
            if (nextTextarea) {
              nextTextarea.selectionStart = 0;
              nextTextarea.selectionEnd = 0;
            }
          }, 0);
        }
      }
      // Otherwise, let the textarea handle normal cursor movement
      return;
    }

    if (e.key === "ArrowUp") {
      const textarea = e.target as HTMLTextAreaElement;
      const { selectionStart, selectionEnd, value } = textarea;

      // Check if cursor is on the first line AND at the start of the text
      const textBeforeCursor = value.substring(0, selectionStart);
      const isOnFirstLine = !textBeforeCursor.includes('\n');
      const isAtStart = selectionStart === 0 && selectionEnd === 0;

      // Only navigate to previous item if we're at the very start
      if (isOnFirstLine && isAtStart) {
        // Find previous unchecked item
        const uncheckedItems = items.filter((i) => !i.checked);
        const currentUncheckedIndex = uncheckedItems.findIndex((i) => i.id === id);

        if (currentUncheckedIndex > 0) {
          e.preventDefault();
          const prevItem = uncheckedItems[currentUncheckedIndex - 1];
          setFocusedId(prevItem.id);
          // Put cursor at the end of the previous item
          setTimeout(() => {
            const prevTextarea = inputRefs.current.get(prevItem.id);
            if (prevTextarea) {
              const endPos = prevItem.text.length;
              prevTextarea.selectionStart = endPos;
              prevTextarea.selectionEnd = endPos;
            }
          }, 0);
        }
      }
      // Otherwise, let the textarea handle normal cursor movement
    }

    if (e.key === "ArrowLeft") {
      const textarea = e.target as HTMLTextAreaElement;
      const { selectionStart, selectionEnd } = textarea;

      // Only navigate to previous item if cursor is at the very start
      const isAtStart = selectionStart === 0 && selectionEnd === 0;

      if (isAtStart) {
        // Find previous unchecked item
        const uncheckedItems = items.filter((i) => !i.checked);
        const currentUncheckedIndex = uncheckedItems.findIndex((i) => i.id === id);

        if (currentUncheckedIndex > 0) {
          e.preventDefault();
          const prevItem = uncheckedItems[currentUncheckedIndex - 1];
          setFocusedId(prevItem.id);
          // Put cursor at the end of the previous item
          setTimeout(() => {
            const prevTextarea = inputRefs.current.get(prevItem.id);
            if (prevTextarea) {
              const endPos = prevItem.text.length;
              prevTextarea.selectionStart = endPos;
              prevTextarea.selectionEnd = endPos;
            }
          }, 0);
        }
      }
    }

    if (e.key === "ArrowRight") {
      const textarea = e.target as HTMLTextAreaElement;
      const { selectionStart, selectionEnd, value } = textarea;

      // Only navigate to next item if cursor is at the very end
      const isAtEnd = selectionStart === value.length && selectionStart === selectionEnd;

      if (isAtEnd) {
        // Find next unchecked item
        const uncheckedItems = items.filter((i) => !i.checked);
        const currentUncheckedIndex = uncheckedItems.findIndex((i) => i.id === id);

        if (currentUncheckedIndex < uncheckedItems.length - 1) {
          e.preventDefault();
          const nextItem = uncheckedItems[currentUncheckedIndex + 1];
          setFocusedId(nextItem.id);
          // Put cursor at the start of the next item
          setTimeout(() => {
            const nextTextarea = inputRefs.current.get(nextItem.id);
            if (nextTextarea) {
              nextTextarea.selectionStart = 0;
              nextTextarea.selectionEnd = 0;
            }
          }, 0);
        }
      }
    }
  };

  // Handle text changes - also catches mobile Enter key as fallback
  const handleTextChange = (id: string, newText: string, oldText: string) => {
    // Check if Shift+Enter was pressed (allow newline on desktop)
    if (shiftEnterPressedRef.current) {
      shiftEnterPressedRef.current = false;
      updateItem(id, { text: newText });
      return;
    }

    // Check if paste just occurred (allow pasting text with newlines)
    if (pasteOccurredRef.current) {
      pasteOccurredRef.current = false;
      updateItem(id, { text: newText });
      return;
    }

    // Check if a newline was just typed (mobile fallback for Enter key)
    // Count newlines in old vs new text
    const oldNewlines = (oldText.match(/\n/g) || []).length;
    const newNewlines = (newText.match(/\n/g) || []).length;

    // Only treat as Enter key if exactly one newline was added
    // (multiple newlines means paste)
    if (newNewlines === oldNewlines + 1) {
      // Find where the new newline was inserted
      const newlineIndex = newText.indexOf("\n", oldText.lastIndexOf("\n") + 1);

      if (newlineIndex !== -1) {
        // Split text at the newline - text before stays, text after goes to new item
        const textBefore = newText.slice(0, newlineIndex);
        const textAfter = newText.slice(newlineIndex + 1);

        splitItem(id, textBefore, textAfter);
        return;
      }
    }

    updateItem(id, { text: newText });
  };

  // Insert a newline at cursor position (for mobile)
  const insertNewline = (id: string, cursorPos: number) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const newText =
      item.text.slice(0, cursorPos) + "\n" + item.text.slice(cursorPos);
    updateItem(id, { text: newText });

    // Set cursor position after the newline
    setTimeout(() => {
      const textarea = inputRefs.current.get(id);
      if (textarea) {
        textarea.selectionStart = cursorPos + 1;
        textarea.selectionEnd = cursorPos + 1;
      }
    }, 0);
  };

  // Calculate drop target based on Y position (only considers unchecked items)
  const calculateDropTarget = useCallback((clientY: number): number => {
    const currentItems = itemsRef.current;
    const dragState = dragStateRef.current;
    if (!dragState) return 0;

    // Only consider unchecked items for drop targets
    const uncheckedItems = currentItems.filter((item) => !item.checked);
    let targetIndex = 0;

    // Find which unchecked item we're hovering over
    for (let i = 0; i < uncheckedItems.length; i++) {
      const item = uncheckedItems[i];
      // Skip items being dragged
      if (dragState.draggedIds.includes(item.id)) continue;

      const rowEl = rowRefs.current.get(item.id);
      if (rowEl) {
        const rect = rowEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (clientY > midY) {
          // targetIndex is the position in uncheckedItems array
          targetIndex = i + 1;
        }
      }
    }

    return targetIndex;
  }, []);

  // Move items to new position (targetIdx is index within unchecked items)
  const moveItemsToPosition = useCallback(
    (draggedItemIds: string[], targetIdx: number) => {
      const currentItems = itemsRef.current;
      if (draggedItemIds.length === 0) return;

      // Get unchecked items (excluding dragged ones) to map targetIdx to actual position
      const uncheckedItems = currentItems.filter((item) => !item.checked);
      const uncheckedExcludingDragged = uncheckedItems.filter(
        (item) => !draggedItemIds.includes(item.id),
      );

      // Find the index in uncheckedItems of the first dragged item
      const firstDraggedUncheckedIdx = uncheckedItems.findIndex(
        (item) => item.id === draggedItemIds[0],
      );

      // Don't move if we're dropping in the same spot
      if (
        targetIdx === firstDraggedUncheckedIdx ||
        targetIdx === firstDraggedUncheckedIdx + draggedItemIds.length
      ) {
        return;
      }

      // Extract dragged items in order
      const draggedItems = draggedItemIds
        .map((id) => currentItems.find((item) => item.id === id))
        .filter((item): item is ListItem => item !== undefined);

      // Remove dragged items from the full array
      const remaining = currentItems.filter(
        (item) => !draggedItemIds.includes(item.id),
      );

      // Find where to insert in the full array
      // targetIdx is the position in unchecked items (after removing dragged)
      // We need to find the corresponding position in the remaining array
      let insertAt: number;
      if (targetIdx >= uncheckedExcludingDragged.length) {
        // Insert after all unchecked items - find last unchecked item in remaining
        let lastUncheckedIdx = -1;
        for (let i = remaining.length - 1; i >= 0; i--) {
          if (!remaining[i].checked) {
            lastUncheckedIdx = i;
            break;
          }
        }
        insertAt = lastUncheckedIdx === -1 ? 0 : lastUncheckedIdx + 1;
      } else {
        // Find the item at targetIdx in uncheckedExcludingDragged
        const targetItem = uncheckedExcludingDragged[targetIdx];
        insertAt = remaining.findIndex((item) => item.id === targetItem.id);
      }

      insertAt = Math.max(0, Math.min(insertAt, remaining.length));

      // Insert at new position
      const newItems = [
        ...remaining.slice(0, insertAt),
        ...draggedItems,
        ...remaining.slice(insertAt),
      ];

      setItems(newItems);
      saveItems(newItems);
    },
    [saveItems],
  );

  // Unified drag start handler
  const startDrag = useCallback(
    (id: string, clientX: number, clientY: number) => {
      const currentItems = itemsRef.current;
      const ids = getItemWithChildren(id, currentItems);
      const startIndex = currentItems.findIndex((item) => item.id === id);
      const item = currentItems.find((i) => i.id === id);

      dragStateRef.current = {
        draggedIds: ids,
        startIndex,
        startX: clientX,
        startY: clientY,
        startIndent: item?.indent ?? 0,
        mode: "undecided",
      };
      setDraggedIds(ids);
    },
    [getItemWithChildren],
  );

  // Unified drag move handler
  const moveDrag = useCallback(
    (clientX: number, clientY: number) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const deltaX = clientX - dragState.startX;
      const deltaY = clientY - dragState.startY;

      // Determine mode based on which direction has more movement
      if (dragState.mode === "undecided") {
        const threshold = 10; // pixels before deciding direction
        if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
          dragState.mode =
            Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
        }
      }

      if (dragState.mode === "vertical") {
        // Vertical reordering
        const target = calculateDropTarget(clientY);
        setDropTargetIndex(target);
        setSwipeState(null);
      } else if (dragState.mode === "horizontal") {
        // Horizontal indentation
        setDropTargetIndex(null);
        const parentId = dragState.draggedIds[0];
        setSwipeState({ id: parentId, offset: deltaX });
      }
    },
    [calculateDropTarget],
  );

  // Unified drag end handler
  const endDrag = useCallback(() => {
    const dragState = dragStateRef.current;
    if (!dragState) {
      setDraggedIds([]);
      setDropTargetIndex(null);
      setSwipeState(null);
      return;
    }

    if (dragState.mode === "vertical") {
      // Apply vertical reordering
      const targetIndex = dropTargetRef.current;
      if (targetIndex !== null) {
        moveItemsToPosition(dragState.draggedIds, targetIndex);
      }
    } else if (dragState.mode === "horizontal") {
      // Apply horizontal indentation using ref for latest value
      const currentSwipe = swipeStateRef.current;
      if (currentSwipe) {
        const indentDelta = Math.round(currentSwipe.offset / SWIPE_THRESHOLD);
        if (indentDelta !== 0) {
          const newIndent = Math.max(
            0,
            Math.min(MAX_INDENT, dragState.startIndent + indentDelta),
          );
          setItemIndent(currentSwipe.id, newIndent);
        }
      }
    }

    dragStateRef.current = null;
    dropTargetRef.current = null;
    swipeStateRef.current = null;
    setDraggedIds([]);
    setDropTargetIndex(null);
    setSwipeState(null);
  }, [moveItemsToPosition, setItemIndent]);

  // Mouse handlers
  const handleGripMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();

      startDrag(id, e.clientX, e.clientY);

      const onMouseMove = (e: MouseEvent) => {
        moveDrag(e.clientX, e.clientY);
      };

      const onMouseUp = () => {
        endDrag();
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [startDrag, moveDrag, endDrag],
  );

  // Touch handlers
  const handleGripTouchStart = useCallback(
    (e: React.TouchEvent, id: string) => {
      e.stopPropagation();
      const touch = e.touches[0];
      startDrag(id, touch.clientX, touch.clientY);

      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        const touch = e.touches[0];
        moveDrag(touch.clientX, touch.clientY);
      };

      const onTouchEnd = () => {
        endDrag();
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
      };

      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", onTouchEnd);
    },
    [startDrag, moveDrag, endDrag],
  );

  // Focus management - also scroll into view for mobile keyboards
  useEffect(() => {
    if (focusedId) {
      const input = inputRefs.current.get(focusedId);
      if (input) {
        input.focus();
        // On mobile, scroll the input into view after a short delay
        // to account for the keyboard appearing
        setTimeout(() => {
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    }
  }, [focusedId]);

  const uncheckedItems = items.filter((item) => !item.checked);
  const checkedItems = items.filter((item) => item.checked);

  const removeCompleted = async () => {
    const completedCount = items.filter((item) => item.checked).length;
    if (completedCount === 0) return;

    const confirmed = await confirm({
      title: "Clear completed items",
      message: `Remove ${completedCount} completed item${completedCount === 1 ? "" : "s"}? This cannot be undone.`,
      confirmText: "Clear",
      variant: "danger",
    });

    if (confirmed) {
      const newItems = items.filter((item) => !item.checked);
      setItems(newItems);
      saveItems(newItems);
    }
  };

  const uncheckAll = async () => {
    const checkedCount = items.filter((item) => item.checked).length;
    if (checkedCount === 0) return;

    const confirmed = await confirm({
      title: "Uncheck all items",
      message: `Uncheck ${checkedCount} item${checkedCount === 1 ? "" : "s"}?`,
      confirmText: "Uncheck all",
      variant: "default",
    });

    if (confirmed) {
      const newItems = items.map((item) => ({ ...item, checked: false }));
      setItems(newItems);
      saveItems(newItems);
    }
  };

  return (
    <div ref={containerRef} className="space-y-1">
      {/* Unchecked items */}
      {uncheckedItems.map((item, index) => {
        const isBeingDragged = draggedIds.includes(item.id);
        // dropTargetIndex is now based on uncheckedItems array, so compare with index
        const showDropBefore = dropTargetIndex === index && !isBeingDragged;

        return (
          <div key={item.id}>
            {showDropBefore && (
              <div className="h-1 bg-primary-500 rounded-full mx-2 my-1" />
            )}
            <ListItemRow
              item={item}
              rowRef={(el) => {
                if (el) rowRefs.current.set(item.id, el);
                else rowRefs.current.delete(item.id);
              }}
              inputRef={(el) => {
                if (el) inputRefs.current.set(item.id, el);
                else inputRefs.current.delete(item.id);
              }}
              onToggle={() => toggleChecked(item.id)}
              onTextChange={(text, oldText) =>
                handleTextChange(item.id, text, oldText)
              }
              onKeyDown={(e) => handleKeyDown(e, item.id)}
              onPaste={() => {
                pasteOccurredRef.current = true;
              }}
              onDelete={() => deleteItem(item.id)}
              onInsertNewline={(cursorPos) => insertNewline(item.id, cursorPos)}
              isDragging={isBeingDragged}
              swipeOffset={swipeState?.id === item.id ? swipeState.offset : 0}
              onGripMouseDown={(e) => handleGripMouseDown(e, item.id)}
              onGripTouchStart={(e) => handleGripTouchStart(e, item.id)}
            />
            {/* Show drop indicator after last unchecked item */}
            {index === uncheckedItems.length - 1 &&
              dropTargetIndex !== null &&
              dropTargetIndex === uncheckedItems.length &&
              !isBeingDragged && (
                <div className="h-1 bg-primary-500 rounded-full mx-2 my-1" />
              )}
          </div>
        );
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
                title="Remove completed items"
              >
                <Trash2 className="w-3 h-3" />
                Remove
              </button>
            </div>
          </div>
          {checkedItems.map((item) => {
            const isBeingDragged = draggedIds.includes(item.id);

            return (
              <ListItemRow
                key={item.id}
                item={item}
                rowRef={(el) => {
                  if (el) rowRefs.current.set(item.id, el);
                  else rowRefs.current.delete(item.id);
                }}
                inputRef={(el) => {
                  if (el) inputRefs.current.set(item.id, el);
                  else inputRefs.current.delete(item.id);
                }}
                onToggle={() => toggleChecked(item.id)}
                onTextChange={(text, oldText) =>
                  handleTextChange(item.id, text, oldText)
                }
                onKeyDown={(e) => handleKeyDown(e, item.id)}
                onPaste={() => {
                  pasteOccurredRef.current = true;
                }}
                onDelete={() => deleteItem(item.id)}
                onInsertNewline={(cursorPos) =>
                  insertNewline(item.id, cursorPos)
                }
                isDragging={isBeingDragged}
                swipeOffset={swipeState?.id === item.id ? swipeState.offset : 0}
                onGripMouseDown={(e) => handleGripMouseDown(e, item.id)}
                onGripTouchStart={(e) => handleGripTouchStart(e, item.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
