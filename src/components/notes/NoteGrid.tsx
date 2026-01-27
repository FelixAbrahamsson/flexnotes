import { useRef, useEffect } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type CollisionDetection,
  closestCenter,
  pointerWithin,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Archive, Trash2 } from "lucide-react";
import { SortableNoteCard } from "./SortableNoteCard";
import { ActionDropZone } from "./ActionDropZone";
import type { Note, Tag, Folder } from "@/types";

// Custom collision detection for drop zones
const customCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  const actionZoneCollision = pointerCollisions.find(
    (collision) =>
      collision.id === "drop-archive" || collision.id === "drop-trash"
  );

  if (actionZoneCollision) {
    return [actionZoneCollision];
  }

  const centerCollisions = closestCenter(args);
  return centerCollisions.filter(
    (collision) =>
      collision.id !== "drop-archive" && collision.id !== "drop-trash"
  );
};

export interface NoteGridProps {
  pinnedNotes: Note[];
  unpinnedNotes: Note[];
  gridClasses: string;
  showTrash: boolean;
  showArchived: boolean;
  reorderMode: boolean;
  searchQuery: string;
  selectedTagIds: string[];
  viewMode: "list" | "folder";
  draggingNoteId: string | null;
  canLoadMore: boolean;
  loading: boolean;
  getTagsForNote: (noteId: string) => Tag[];
  getFolderById: (folderId: string) => Folder | undefined;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onOpenNote: (noteId: string) => void;
  onPin: (noteId: string, isPinned: boolean) => void;
  onArchive: (noteId: string, isArchived: boolean) => void;
  onDelete: (noteId: string) => void;
  onRestore: (noteId: string) => void;
  onPermanentDelete: (noteId: string) => void;
  onShare: (noteId: string) => void;
  onDuplicate: (noteId: string) => void;
  onMoveToFolder: (noteId: string) => void;
  onLoadMore: () => void;
}

/**
 * Sortable grid of notes with pinned/unpinned sections and drag-drop support.
 */
export function NoteGrid({
  pinnedNotes,
  unpinnedNotes,
  gridClasses,
  showTrash,
  showArchived,
  reorderMode,
  searchQuery,
  selectedTagIds,
  viewMode,
  draggingNoteId,
  canLoadMore,
  loading,
  getTagsForNote,
  getFolderById,
  onDragStart,
  onDragEnd,
  onOpenNote,
  onPin,
  onArchive,
  onDelete,
  onRestore,
  onPermanentDelete,
  onShare,
  onDuplicate,
  onMoveToFolder,
  onLoadMore,
}: NoteGridProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && canLoadMore && !loading) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore, loading, onLoadMore]);

  const isDragDisabled =
    showTrash || searchQuery.length > 0 || selectedTagIds.length > 0;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="space-y-6">
        {/* Pinned notes */}
        {pinnedNotes.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Pinned
            </h2>
            <SortableContext
              items={pinnedNotes.map((n) => n.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className={`grid gap-3 ${gridClasses}`}>
                {pinnedNotes.map((note) => (
                  <SortableNoteCard
                    key={note.id}
                    note={note}
                    tags={viewMode === "list" ? getTagsForNote(note.id) : []}
                    folder={
                      note.folder_id ? getFolderById(note.folder_id) : null
                    }
                    onClick={() => onOpenNote(note.id)}
                    onPin={() => onPin(note.id, note.is_pinned)}
                    onArchive={() => onArchive(note.id, note.is_archived)}
                    onDelete={() => onDelete(note.id)}
                    onShare={() => onShare(note.id)}
                    onDuplicate={() => onDuplicate(note.id)}
                    onMoveToFolder={() => onMoveToFolder(note.id)}
                    showFolder={false}
                    isDragDisabled={isDragDisabled}
                    reorderMode={reorderMode}
                  />
                ))}
              </div>
            </SortableContext>
          </section>
        )}

        {/* Unpinned notes / Trash notes */}
        {unpinnedNotes.length > 0 && (
          <section>
            {pinnedNotes.length > 0 && !showTrash && (
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Others
              </h2>
            )}
            <SortableContext
              items={unpinnedNotes.map((n) => n.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className={`grid gap-3 ${gridClasses}`}>
                {unpinnedNotes.map((note) => (
                  <SortableNoteCard
                    key={note.id}
                    note={note}
                    tags={
                      viewMode === "list" && !showTrash
                        ? getTagsForNote(note.id)
                        : []
                    }
                    folder={
                      note.folder_id ? getFolderById(note.folder_id) : null
                    }
                    onClick={() => onOpenNote(note.id)}
                    onPin={
                      !showTrash ? () => onPin(note.id, note.is_pinned) : undefined
                    }
                    onArchive={
                      !showTrash
                        ? () => onArchive(note.id, note.is_archived)
                        : undefined
                    }
                    onDelete={
                      showTrash
                        ? () => onPermanentDelete(note.id)
                        : () => onDelete(note.id)
                    }
                    onRestore={
                      showTrash ? () => onRestore(note.id) : undefined
                    }
                    onShare={!showTrash ? () => onShare(note.id) : undefined}
                    onDuplicate={
                      !showTrash ? () => onDuplicate(note.id) : undefined
                    }
                    onMoveToFolder={
                      !showTrash ? () => onMoveToFolder(note.id) : undefined
                    }
                    showRestore={showTrash}
                    showFolder={false}
                    isDragDisabled={isDragDisabled}
                    reorderMode={reorderMode}
                  />
                ))}
              </div>
            </SortableContext>
          </section>
        )}

        {/* Load more sentinel */}
        {canLoadMore && (
          <div
            ref={loadMoreRef}
            className="flex items-center justify-center py-8"
          >
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          </div>
        )}
      </div>

      {/* Drop zones for archive/trash - shown when dragging */}
      {draggingNoteId && !showTrash && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center gap-12 px-4 z-50 pointer-events-auto native-drop-zones">
          <ActionDropZone
            id="drop-archive"
            icon={<Archive className="w-6 h-6" />}
            label={showArchived ? "Unarchive" : "Archive"}
            variant="archive"
          />
          <ActionDropZone
            id="drop-trash"
            icon={<Trash2 className="w-6 h-6" />}
            label="Trash"
            variant="trash"
          />
        </div>
      )}
    </DndContext>
  );
}
