import { useState, useEffect, useCallback, useRef, type MutableRefObject } from "react";
import { X, Maximize2, Minimize2 } from "lucide-react";
import { useNoteStore } from "@/stores/noteStore";
import { useNoteUIStore } from "@/stores/noteUIStore";
import { useImageStore } from "@/stores/imageStore";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { NoteEditorCore, useNoteEditorContent } from "./NoteEditorCore";

interface NoteEditorProps {
  noteId: string;
  onClose: () => void;
  hideTags?: boolean;
  /** Parent ref that will be kept in sync with the editor's flush function */
  flushSaveRef?: MutableRefObject<() => void>;
  /** Parent ref that will be kept in sync with the editor's dirty state */
  dirtyRef?: MutableRefObject<boolean>;
}

/**
 * Modal wrapper for note editing.
 * Uses NoteEditorCore for the actual editing functionality.
 */
export function NoteEditor({
  noteId: _noteId,
  onClose,
  hideTags = false,
  flushSaveRef: parentFlushSaveRef,
  dirtyRef: parentDirtyRef,
}: NoteEditorProps) {
  const { notes } = useNoteStore();
  const { getActiveNote } = useNoteUIStore();
  const note = getActiveNote(notes);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [modalWidth, setModalWidth] = useState<number | null>(null);
  const [fullscreenContentWidth, setFullscreenContentWidth] = useState<number | null>(null);
  const { contentRef, flushSaveRef, dirtyRef, setContent } = useNoteEditorContent();

  // Resize handling for desktop modal / fullscreen content width
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);
  const resizeSide = useRef<"left" | "right">("right");
  const resizeTarget = useRef<"modal" | "content">("modal");

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, side: "left" | "right") => {
      e.preventDefault();
      e.stopPropagation();
      isResizing.current = true;
      resizeSide.current = side;
      resizeStartX.current = e.clientX;
      resizeTarget.current = isFullscreen ? "content" : "modal";
      resizeStartWidth.current = isFullscreen
        ? (fullscreenContentWidth ?? 896)
        : (modalWidth ?? Math.min(672, window.innerWidth));
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [isFullscreen, modalWidth, fullscreenContentWidth]
  );

  useEffect(() => {
    const handleResizeMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = e.clientX - resizeStartX.current;
      const direction = resizeSide.current === "right" ? 1 : -1;
      // Multiply by 2 because both modal and fullscreen content are centered
      const newWidth = resizeStartWidth.current + delta * direction * 2;
      const clamped = Math.min(Math.max(newWidth, 400), window.innerWidth - 48);
      if (resizeTarget.current === "content") {
        setFullscreenContentWidth(clamped);
      } else {
        setModalWidth(clamped);
      }
    };

    const handleResizeEnd = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };
  }, []);

  // Keep parent refs in sync so external close paths (e.g. popstate) can flush
  useEffect(() => {
    if (parentFlushSaveRef) parentFlushSaveRef.current = flushSaveRef.current;
    if (parentDirtyRef) parentDirtyRef.current = dirtyRef.current;
    return () => {
      if (parentFlushSaveRef) parentFlushSaveRef.current = () => {};
      if (parentDirtyRef) parentDirtyRef.current = false;
    };
  });

  const handleClose = useCallback(async () => {
    // Flush any pending save so the store has the latest content
    // before onClose triggers deleteNoteIfEmpty
    flushSaveRef.current();
    // Clean up any images that were removed from markdown content
    if (note && note.note_type === "markdown") {
      await useImageStore
        .getState()
        .cleanupOrphanedImages(note.id, contentRef.current);
    }
    onClose();
  }, [note, contentRef, flushSaveRef, onClose]);

  useEscapeKey(handleClose);

  if (!note) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50"
      onMouseDown={handleClose}
    >
      <div
        className={`absolute bg-white dark:bg-gray-800 shadow-xl flex flex-col overflow-hidden ${
          isFullscreen
            ? "inset-0 sm:inset-0"
            : "inset-x-0 bottom-0 top-0 sm:top-12 sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:max-h-[calc(100vh-6rem)] sm:rounded-xl"
        }`}
        style={!isFullscreen && modalWidth ? { width: modalWidth, maxWidth: "calc(100vw - 48px)" } : !isFullscreen ? { maxWidth: 672 } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Resize handles - desktop only */}
        {(() => {
          if (isFullscreen) {
            // In fullscreen, position handles at edges of content column
            const w = fullscreenContentWidth ?? 896;
            return (
              <>
                <div
                  className="hidden sm:block absolute top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-primary-400/50 transition-colors"
                  style={{ left: `calc(50% - ${w / 2}px)` }}
                  onMouseDown={(e) => handleResizeStart(e, "left")}
                />
                <div
                  className="hidden sm:block absolute top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-primary-400/50 transition-colors"
                  style={{ right: `calc(50% - ${w / 2}px)` }}
                  onMouseDown={(e) => handleResizeStart(e, "right")}
                />
              </>
            );
          }
          return (
            <>
              <div
                className="hidden sm:block absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-primary-400/50 transition-colors"
                onMouseDown={(e) => handleResizeStart(e, "left")}
              />
              <div
                className="hidden sm:block absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-primary-400/50 transition-colors"
                onMouseDown={(e) => handleResizeStart(e, "right")}
              />
            </>
          );
        })()}
        <NoteEditorCore
          note={note}
          hideTags={hideTags}
          deleteMode="delete"
          isFullscreen={isFullscreen}
          fullscreenContentWidth={fullscreenContentWidth ?? undefined}
          onAfterArchive={onClose}
          onAfterDelete={onClose}
          onContentChange={setContent}
          flushSaveRef={flushSaveRef}
          dirtyRef={dirtyRef}
          headerLeft={
            <button onClick={handleClose} className="btn btn-ghost p-2 -ml-2">
              <X className="w-5 h-5" />
            </button>
          }
          headerRight={
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="btn btn-ghost p-2 hidden sm:block"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="w-5 h-5" />
              ) : (
                <Maximize2 className="w-5 h-5" />
              )}
            </button>
          }
        />
      </div>
    </div>
  );
}
