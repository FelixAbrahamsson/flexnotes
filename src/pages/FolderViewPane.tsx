import type {
  ComponentProps,
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import { DndContext } from "@dnd-kit/core";
import { FolderTreeView } from "@/components/folders/FolderTreeView";
import { NoteEditorPane } from "@/components/notes/NoteEditorPane";
import { useNoteStore } from "@/stores/noteStore";
import { useFolderStore } from "@/stores/folderStore";
import { hapticLight } from "@/hooks/useCapacitor";
import { MESSAGES } from "@/constants";
import type { Note, NewNote } from "@/types";

interface FolderViewPaneProps {
  sensors: ComponentProps<typeof DndContext>["sensors"];
  isMobile: boolean;
  sidebarWidth: number;
  searchQuery: string;
  reorderMode: boolean;
  folderViewSelectedNoteId: string | null;
  notes: Note[];
  isMobileRef: MutableRefObject<boolean>;
  modalStackRef: MutableRefObject<string[]>;
  paneFlushSaveRef: ComponentProps<typeof NoteEditorPane>["flushSaveRef"];
  paneDirtyRef: ComponentProps<typeof NoteEditorPane>["dirtyRef"];
  onResizeStart: (e: React.MouseEvent | React.TouchEvent) => void;
  setActiveNote: (id: string | null) => void;
  setFolderViewSelectedNoteId: Dispatch<SetStateAction<string | null>>;
  setNoteInUrl: (id: string) => void;
  setFolderPickerNoteId: Dispatch<SetStateAction<string | null>>;
  setShareNoteId: Dispatch<SetStateAction<string | null>>;
  createNote: (note?: NewNote) => Promise<Note | null>;
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>;
  trashNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  duplicateNote: (id: string) => Promise<Note | null>;
  showToast: (toast: { message: string; onUndo?: () => void }) => void;
}

/**
 * Desktop/mobile folder view: the split-pane with the folder tree (left) and
 * the inline note editor (right, desktop only), plus the drag-drop wiring for
 * moving notes/folders. Extracted from NotesPage so the folder-view logic is
 * cohesive and unit-testable via NotesPage.test.tsx's folder-view cases.
 */
export function FolderViewPane({
  sensors,
  isMobile,
  sidebarWidth,
  searchQuery,
  reorderMode,
  folderViewSelectedNoteId,
  notes,
  isMobileRef,
  modalStackRef,
  paneFlushSaveRef,
  paneDirtyRef,
  onResizeStart,
  setActiveNote,
  setFolderViewSelectedNoteId,
  setNoteInUrl,
  setFolderPickerNoteId,
  setShareNoteId,
  createNote,
  updateNote,
  trashNote,
  restoreNote,
  duplicateNote,
  showToast,
}: FolderViewPaneProps) {
  return (
    <main className="flex h-[calc(100vh-120px)]">
      {/* Tree Panel */}
      <div
        className="flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
        style={{ width: isMobile ? "100%" : sidebarWidth }}
      >
        <DndContext
          sensors={sensors}
          onDragEnd={(event) => {
            const { active, over } = event;
            if (!over) return;

            const dragData = active.data.current;
            const overId = over.id.toString();

            // Handle dropping note onto folder
            if (dragData?.type === "note" && overId.startsWith("folder-")) {
              const folderId = overId.replace("folder-", "");
              const noteId = dragData.note.id;
              hapticLight();
              useNoteStore
                .getState()
                .moveNoteToFolder(noteId, folderId === "root" ? null : folderId);
            }

            // Handle dropping folder onto another folder
            if (dragData?.type === "folder" && overId.startsWith("folder-")) {
              const targetFolderId = overId.replace("folder-", "");
              const sourceFolderId = dragData.folder.id;

              // Don't drop onto self
              if (targetFolderId === sourceFolderId) return;

              hapticLight();
              useFolderStore
                .getState()
                .moveFolder(
                  sourceFolderId,
                  targetFolderId === "root" ? null : targetFolderId,
                );
            }
          }}
        >
          <FolderTreeView
            selectedNoteId={isMobile ? null : folderViewSelectedNoteId}
            searchQuery={searchQuery}
            reorderMode={reorderMode}
            onSelectNote={(noteId) => {
              hapticLight();
              if (isMobileRef.current) {
                // On mobile, open in modal
                setActiveNote(noteId);
                // Push to history stack so back button closes the note
                modalStackRef.current.push("note");
                window.history.pushState({ modal: "note" }, "");
              } else {
                // On desktop, show in pane (close any modal first)
                setActiveNote(null);
                setFolderViewSelectedNoteId(noteId);
              }
              setNoteInUrl(noteId);
            }}
            onCreateNote={async (folderId) => {
              hapticLight();
              const note = await createNote({ folder_id: folderId });
              if (note) {
                if (isMobileRef.current) {
                  setActiveNote(note.id);
                  // Push to history stack so back button closes the note
                  modalStackRef.current.push("note");
                  window.history.pushState({ modal: "note" }, "");
                } else {
                  // On desktop, show in pane (close any modal first)
                  setActiveNote(null);
                  setFolderViewSelectedNoteId(note.id);
                }
                setNoteInUrl(note.id);
              }
            }}
            onMoveNote={(noteId) => {
              hapticLight();
              setFolderPickerNoteId(noteId);
            }}
            onShareNote={(noteId) => {
              hapticLight();
              setShareNoteId(noteId);
            }}
            onArchiveNote={(noteId) => {
              const isArchived = notes.find((n) => n.id === noteId)?.is_archived;
              hapticLight();
              updateNote(noteId, { is_archived: !isArchived });
              if (!isArchived) {
                showToast({
                  message: "Note archived",
                  onUndo: () => updateNote(noteId, { is_archived: false }),
                });
              }
            }}
            onDeleteNote={(noteId) => {
              hapticLight();
              trashNote(noteId);
              showToast({
                message: MESSAGES.noteMovedToTrash,
                onUndo: () => restoreNote(noteId),
              });
            }}
            onPinNote={(noteId) => {
              hapticLight();
              updateNote(noteId, {
                is_pinned: !notes.find((n) => n.id === noteId)?.is_pinned,
              });
            }}
            onDuplicateNote={(noteId) => {
              hapticLight();
              duplicateNote(noteId);
            }}
          />
        </DndContext>
      </div>

      {/* Resize Handle - Desktop only */}
      {!isMobile && (
        <div
          className="w-1 bg-gray-200 dark:bg-gray-700 hover:bg-primary-400 dark:hover:bg-primary-600 cursor-col-resize flex-shrink-0 transition-colors"
          onMouseDown={onResizeStart}
          onTouchStart={onResizeStart}
        />
      )}

      {/* Editor Panel - Desktop only */}
      {!isMobile && (
        <div className="flex-1 min-w-0 overflow-hidden">
          <NoteEditorPane
            noteId={folderViewSelectedNoteId || ""}
            onMoveToFolder={() => {
              if (folderViewSelectedNoteId) {
                setFolderPickerNoteId(folderViewSelectedNoteId);
              }
            }}
            hideTags
            flushSaveRef={paneFlushSaveRef}
            dirtyRef={paneDirtyRef}
          />
        </div>
      )}
    </main>
  );
}
