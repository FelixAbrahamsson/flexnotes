import { useState, useEffect, useCallback } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { hapticLight } from "@/hooks/useCapacitor";
import { useNoteStore } from "@/stores/noteStore";
import type { Note } from "@/types";

interface UseNoteDragAndDropOptions {
  showArchived: boolean;
  showTrash: boolean;
  showShared: boolean;
  searchQuery: string;
  selectedTagIds: string[];
  reorderMode: boolean;
  setReorderMode: (mode: boolean) => void;
  getPaginatedNotes: (notes: Note[], sharedNoteIds: Set<string>) => Note[];
  notes: Note[];
  sharedNoteIds: Set<string>;
}

export function useNoteDragAndDrop({
  showArchived,
  showTrash,
  showShared,
  searchQuery,
  selectedTagIds,
  reorderMode,
  setReorderMode,
  getPaginatedNotes,
  notes,
  sharedNoteIds,
}: UseNoteDragAndDropOptions) {
  const { updateNote, trashNote, reorderNotes } = useNoteStore();
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Exit reorder mode when switching views
  useEffect(() => {
    if (showArchived || showTrash || showShared) {
      setReorderMode(false);
    }
  }, [showArchived, showTrash, showShared, setReorderMode]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const isDragDisabled =
        showTrash || searchQuery.length > 0 || selectedTagIds.length > 0;
      if (isDragDisabled) return;

      const isMobile = window.matchMedia("(max-width: 639px)").matches;
      if (isMobile && !reorderMode) return;

      hapticLight();
      setDraggingNoteId(event.active.id as string);
    },
    [showTrash, searchQuery, selectedTagIds, reorderMode],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const noteId = active.id as string;

      setDraggingNoteId(null);

      if (!over) return;

      if (over.id === "drop-archive") {
        hapticLight();
        const note = getPaginatedNotes(notes, sharedNoteIds).find(
          (n: { id: string }) => n.id === noteId,
        );
        if (note) {
          updateNote(noteId, { is_archived: !note.is_archived });
        }
        return;
      }

      if (over.id === "drop-trash") {
        hapticLight();
        trashNote(noteId);
        return;
      }

      if (active.id !== over.id) {
        hapticLight();
        reorderNotes(noteId, over.id as string, showArchived, showTrash);
      }
    },
    [
      reorderNotes,
      getPaginatedNotes,
      updateNote,
      trashNote,
      notes,
      sharedNoteIds,
      showArchived,
      showTrash,
    ],
  );

  return {
    sensors,
    draggingNoteId,
    handleDragStart,
    handleDragEnd,
  };
}
