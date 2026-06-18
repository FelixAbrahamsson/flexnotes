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
  onArchive: (noteId: string, isArchived: boolean) => void;
  onDelete: (noteId: string) => void;
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
  onArchive,
  onDelete,
}: UseNoteDragAndDropOptions) {
  const { reorderNotes } = useNoteStore();
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
      // Dragging is still allowed while a search/tag filter is active so notes
      // can be dropped on the archive/trash zones; only reordering is blocked
      // (handled in handleDragEnd). Trash has no drop zones, so disable there.
      if (showTrash) return;

      const isMobile = window.matchMedia("(max-width: 639px)").matches;
      if (isMobile && !reorderMode) return;

      hapticLight();
      setDraggingNoteId(event.active.id as string);
    },
    [showTrash, reorderMode],
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
          onArchive(noteId, note.is_archived);
        }
        return;
      }

      if (over.id === "drop-trash") {
        hapticLight();
        onDelete(noteId);
        return;
      }

      // Reordering doesn't apply to a filtered/searched view (sort order is
      // ambiguous when only a subset of notes is shown), so only persist a
      // reorder when no filter is active.
      const reorderDisabled =
        searchQuery.length > 0 || selectedTagIds.length > 0;
      if (!reorderDisabled && active.id !== over.id) {
        hapticLight();
        reorderNotes(noteId, over.id as string, showArchived, showTrash);
      }
    },
    [
      reorderNotes,
      getPaginatedNotes,
      onArchive,
      onDelete,
      notes,
      sharedNoteIds,
      showArchived,
      showTrash,
      searchQuery,
      selectedTagIds,
    ],
  );

  const handleDragCancel = useCallback(() => {
    setDraggingNoteId(null);
  }, []);

  return {
    sensors,
    draggingNoteId,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}
