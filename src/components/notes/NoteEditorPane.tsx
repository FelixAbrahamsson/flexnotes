import { useEffect, useRef, type MutableRefObject } from "react";
import { FileText } from "lucide-react";
import { useNoteStore } from "@/stores/noteStore";
import { useImageStore } from "@/stores/imageStore";
import { NoteEditorCore, useNoteEditorContent } from "./NoteEditorCore";

interface NoteEditorPaneProps {
  noteId: string;
  onMoveToFolder?: () => void;
  hideTags?: boolean;
  /** Parent ref for flushing pending saves */
  flushSaveRef?: MutableRefObject<() => void>;
  /** Parent ref for tracking dirty state */
  dirtyRef?: MutableRefObject<boolean>;
}

/**
 * Inline note editor pane for split-view layouts.
 * Uses NoteEditorCore for the actual editing functionality.
 */
export function NoteEditorPane({
  noteId,
  onMoveToFolder,
  hideTags = false,
  flushSaveRef: parentFlushSaveRef,
  dirtyRef: parentDirtyRef,
}: NoteEditorPaneProps) {
  const { notes } = useNoteStore();
  const note = notes.find((n) => n.id === noteId);

  const { contentRef, flushSaveRef, dirtyRef, setContent } = useNoteEditorContent();

  // Keep parent refs in sync
  useEffect(() => {
    if (parentFlushSaveRef) parentFlushSaveRef.current = flushSaveRef.current;
    if (parentDirtyRef) parentDirtyRef.current = dirtyRef.current;
    return () => {
      if (parentFlushSaveRef) parentFlushSaveRef.current = () => {};
      if (parentDirtyRef) parentDirtyRef.current = false;
    };
  });

  // Track previous note for cleanup on switch
  const lastNoteIdRef = useRef<string | null>(null);
  const lastNoteTypeRef = useRef<string | null>(null);

  useEffect(() => {
    // Flush save for previous note before switching
    if (lastNoteIdRef.current && lastNoteIdRef.current !== noteId) {
      flushSaveRef.current();
    }

    // Clean up orphaned images from previous markdown note before switching
    if (
      lastNoteIdRef.current &&
      lastNoteIdRef.current !== noteId &&
      lastNoteTypeRef.current === "markdown"
    ) {
      useImageStore
        .getState()
        .cleanupOrphanedImages(lastNoteIdRef.current, contentRef.current);
    }

    if (note) {
      lastNoteIdRef.current = note.id;
      lastNoteTypeRef.current = note.note_type;
    }
  }, [noteId, note, contentRef, flushSaveRef]);

  if (!note) {
    return (
      <div className="flex-1 flex items-start justify-center pt-32 text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Select a note to view</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white dark:bg-gray-800">
      <NoteEditorCore
        note={note}
        hideTags={hideTags}
        deleteMode="trash"
        onMoveToFolder={onMoveToFolder}
        onContentChange={setContent}
        flushSaveRef={flushSaveRef}
        dirtyRef={dirtyRef}
      />
    </div>
  );
}
