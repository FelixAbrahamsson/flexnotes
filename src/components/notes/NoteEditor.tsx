import { useState, useEffect, useCallback, type MutableRefObject } from "react";
import { X, Maximize2, Minimize2 } from "lucide-react";
import { useNoteStore } from "@/stores/noteStore";
import { useNoteUIStore } from "@/stores/noteUIStore";
import { useImageStore } from "@/stores/imageStore";
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
  const { contentRef, flushSaveRef, dirtyRef, setContent } = useNoteEditorContent();

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

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

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
            : "inset-x-0 bottom-0 top-0 sm:top-12 sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:max-w-2xl sm:max-h-[calc(100vh-6rem)] sm:rounded-xl"
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <NoteEditorCore
          note={note}
          hideTags={hideTags}
          deleteMode="delete"
          isFullscreen={isFullscreen}
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
