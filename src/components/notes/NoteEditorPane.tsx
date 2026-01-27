import { useEffect, useRef } from "react";
import { FileText } from "lucide-react";
import { useNoteStore } from "@/stores/noteStore";
import { useImageStore } from "@/stores/imageStore";
import { NoteEditorCore, useNoteEditorContent } from "./NoteEditorCore";

interface NoteEditorPaneProps {
  noteId: string;
  onMoveToFolder?: () => void;
  hideTags?: boolean;
}

/**
 * Inline note editor pane for split-view layouts.
 * Uses NoteEditorCore for the actual editing functionality.
 */
export function NoteEditorPane({
  noteId,
  onMoveToFolder,
  hideTags = false,
}: NoteEditorPaneProps) {
  const { notes } = useNoteStore();
  const note = notes.find((n) => n.id === noteId);

  const { contentRef, setContent } = useNoteEditorContent();

  // Track previous note for cleanup on switch
  const lastNoteIdRef = useRef<string | null>(null);
  const lastNoteTypeRef = useRef<string | null>(null);

  useEffect(() => {
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
  }, [noteId, note, contentRef]);

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
      />
    </div>
  );
}
