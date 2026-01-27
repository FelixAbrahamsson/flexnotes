import { useRef } from "react";
import { GripVertical, X, Check, CornerDownLeft } from "lucide-react";
import type { ListItem } from "@/types";

const SWIPE_THRESHOLD = 40; // pixels to swipe for one indent level

export interface ListItemRowProps {
  item: ListItem;
  rowRef: (el: HTMLDivElement | null) => void;
  inputRef: (el: HTMLTextAreaElement | null) => void;
  onToggle: () => void;
  onTextChange: (text: string, oldText: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPaste: () => void;
  onDelete: () => void;
  onInsertNewline: (cursorPos: number) => void;
  isDragging: boolean;
  swipeOffset: number;
  onGripMouseDown: (e: React.MouseEvent) => void;
  onGripTouchStart: (e: React.TouchEvent) => void;
}

export function ListItemRow({
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
  const indent = item.indent ?? 0;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <div
      ref={rowRef}
      className={`flex items-start gap-2 group rounded-lg transition-all ${
        isDragging ? "opacity-40 bg-gray-100 dark:bg-gray-800 scale-95" : ""
      }`}
      style={{
        paddingLeft: `${indent * 24 + Math.max(-SWIPE_THRESHOLD, Math.min(SWIPE_THRESHOLD, swipeOffset))}px`,
        transition:
          swipeOffset === 0 && !isDragging
            ? "padding-left 0.15s ease-out"
            : "none",
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
            ? "bg-primary-600 border-primary-600 text-white"
            : "border-gray-300 dark:border-gray-500 bg-transparent hover:border-gray-400 dark:hover:border-gray-400"
        }`}
        type="button"
      >
        {item.checked && <Check className="w-3 h-3" strokeWidth={3} />}
      </button>

      <textarea
        ref={(el) => {
          textareaRef.current = el;
          inputRef(el);
          // Auto-resize on mount and when content changes
          if (el) {
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }
        }}
        value={item.text}
        onChange={(e) => {
          onTextChange(e.target.value, item.text);
          // Auto-resize on change
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder="List item"
        rows={1}
        className={`flex-1 bg-transparent border-0 focus:outline-none focus:ring-0 p-1 text-sm resize-none overflow-hidden ${
          item.checked
            ? "text-gray-400 dark:text-gray-500 line-through"
            : "text-gray-900 dark:text-gray-100"
        } placeholder-gray-400 dark:placeholder-gray-500`}
      />

      {/* Newline button - visible on mobile/touch, hover on desktop */}
      <button
        onClick={() => {
          const cursorPos =
            textareaRef.current?.selectionStart ?? item.text.length;
          onInsertNewline(cursorPos);
          // Refocus and resize after inserting
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              textareaRef.current.style.height = "auto";
              textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
            }
          }, 0);
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
  );
}
