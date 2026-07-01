import { useCallback } from "react";
import type { RefObject } from "react";
import type { ListItem } from "@/types";

interface ListKeyboardParams {
  itemsRef: RefObject<ListItem[]>;
  inputRefs: RefObject<Map<string, HTMLTextAreaElement>>;
  shiftEnterPressedRef: RefObject<boolean>;
  setFocusedId: (id: string | null) => void;
  splitItem: (id: string, textBefore: string, textAfter: string) => void;
  deleteItem: (id: string) => void;
  mergeWithPreviousItem: (id: string) => void;
  indentItem: (id: string, direction: 1 | -1) => void;
}

/**
 * Keyboard handling for the list editor, extracted from ListEditor so the
 * dense key logic (Enter split, Backspace merge, Tab indent, arrow navigation)
 * lives on its own and is covered by ListEditor.test.tsx. Returns the
 * `onKeyDown` handler each row wires up as `(e) => handleKeyDown(e, item.id)`.
 *
 * Reads current items via `itemsRef` (not a snapshot) to stay correct across
 * rapid edits, matching the surrounding stale-closure-avoidance pattern.
 */
export function useListKeyboardHandling({
  itemsRef,
  inputRefs,
  shiftEnterPressedRef,
  setFocusedId,
  splitItem,
  deleteItem,
  mergeWithPreviousItem,
  indentItem,
}: ListKeyboardParams) {
  return useCallback(
    (e: React.KeyboardEvent, id: string) => {
      const currentItems = itemsRef.current;
      const item = currentItems.find((i) => i.id === id);
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
          const index = currentItems.findIndex((i) => i.id === id);

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
          const prevItem = currentItems[index - 1];
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
        const isOnLastLine = !textAfterCursor.includes("\n");
        const isAtEnd =
          selectionStart === value.length && selectionStart === selectionEnd;

        // Only navigate to next item if we're at the very end
        if (isOnLastLine && isAtEnd) {
          // Find next unchecked item
          const uncheckedItems = currentItems.filter((i) => !i.checked);
          const currentUncheckedIndex = uncheckedItems.findIndex(
            (i) => i.id === id,
          );

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
        const isOnFirstLine = !textBeforeCursor.includes("\n");
        const isAtStart = selectionStart === 0 && selectionEnd === 0;

        // Only navigate to previous item if we're at the very start
        if (isOnFirstLine && isAtStart) {
          // Find previous unchecked item
          const uncheckedItems = currentItems.filter((i) => !i.checked);
          const currentUncheckedIndex = uncheckedItems.findIndex(
            (i) => i.id === id,
          );

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
          const uncheckedItems = currentItems.filter((i) => !i.checked);
          const currentUncheckedIndex = uncheckedItems.findIndex(
            (i) => i.id === id,
          );

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
        const isAtEnd =
          selectionStart === value.length && selectionStart === selectionEnd;

        if (isAtEnd) {
          // Find next unchecked item
          const uncheckedItems = currentItems.filter((i) => !i.checked);
          const currentUncheckedIndex = uncheckedItems.findIndex(
            (i) => i.id === id,
          );

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
    },
    // Matches the original callback's deps; refs/setters are stable identities.
    [
      itemsRef,
      inputRefs,
      shiftEnterPressedRef,
      setFocusedId,
      splitItem,
      deleteItem,
      mergeWithPreviousItem,
      indentItem,
    ],
  );
}
