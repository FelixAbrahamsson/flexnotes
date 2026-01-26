import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import {
  Plus,
  Search,
  Settings,
  Trash,
  ArrowUpDown,
  RefreshCw,
  X,
  Archive,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { hapticLight } from "@/hooks/useCapacitor";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useNoteStore } from "@/stores/noteStore";
import { useTagStore } from "@/stores/tagStore";
import { useSyncStore } from "@/stores/syncStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useFolderStore } from "@/stores/folderStore";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { NoteCard } from "@/components/notes/NoteCard";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { NoteEditorPane } from "@/components/notes/NoteEditorPane";
import { TagFilter } from "@/components/tags/TagFilter";
import { SyncStatus } from "@/components/SyncStatus";
import { SettingsModal } from "@/components/SettingsModal";
import { ShareModal } from "@/components/sharing/ShareModal";
import { ViewSwitcher } from "@/components/ui/ViewSwitcher";
import { FolderTreeView } from "@/components/folders/FolderTreeView";
import { FolderPicker } from "@/components/folders/FolderPicker";
import { FolderManager } from "@/components/folders/FolderManager";
import type { Note, Tag, Folder } from "@/types";

// Sortable wrapper for NoteCard
interface SortableNoteCardProps {
  note: Note;
  tags: Tag[];
  folder?: Folder | null;
  onClick: () => void;
  onPin?: () => void;
  onArchive?: () => void;
  onDelete: () => void;
  onRestore?: () => void;
  onShare?: () => void;
  onMoveToFolder?: () => void;
  showRestore?: boolean;
  showFolder?: boolean;
  isDragDisabled?: boolean;
  reorderMode?: boolean;
}

function SortableNoteCard({
  note,
  tags,
  folder,
  onClick,
  onPin,
  onArchive,
  onDelete,
  onRestore,
  onShare,
  onMoveToFolder,
  showRestore,
  showFolder,
  isDragDisabled,
  reorderMode,
}: SortableNoteCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id, disabled: isDragDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : "auto",
    // Only disable touch scrolling when in reorder mode (mobile) or when dragging
    touchAction: reorderMode && !isDragDisabled ? "none" : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragDisabled ? "" : "cursor-grab active:cursor-grabbing"}
      {...attributes}
      {...listeners}
    >
      <NoteCard
        note={note}
        tags={tags}
        folder={folder}
        onClick={onClick}
        onPin={onPin}
        onArchive={onArchive}
        onDelete={onDelete}
        onRestore={onRestore}
        onShare={onShare}
        onMoveToFolder={onMoveToFolder}
        showRestore={showRestore}
        showFolder={showFolder}
      />
    </div>
  );
}

// Drop zone for archive/trash actions during drag
interface ActionDropZoneProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  variant: "archive" | "trash";
}

function ActionDropZone({ id, icon, label, variant }: ActionDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  const baseClasses =
    "flex flex-col items-center justify-center gap-2 py-4 px-6 rounded-xl transition-all duration-200";
  const variantClasses =
    variant === "trash"
      ? isOver
        ? "bg-red-500 text-white scale-110"
        : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
      : isOver
        ? "bg-amber-500 text-white scale-110"
        : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400";

  return (
    <div ref={setNodeRef} className={`${baseClasses} ${variantClasses}`}>
      <div className={`transition-transform ${isOver ? "scale-125" : ""}`}>
        {icon}
      </div>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

// Custom collision detection: requires pointer to be directly over action drop zones,
// but uses closestCenter for sortable items (notes reordering)
const customCollisionDetection: CollisionDetection = (args) => {
  // First check if pointer is directly over an action drop zone
  const pointerCollisions = pointerWithin(args);
  const actionZoneCollision = pointerCollisions.find(
    (collision) =>
      collision.id === "drop-archive" || collision.id === "drop-trash"
  );

  // If pointer is over an action zone, only return that collision
  if (actionZoneCollision) {
    return [actionZoneCollision];
  }

  // Otherwise, use closestCenter for sortable items (exclude action zones)
  const centerCollisions = closestCenter(args);
  return centerCollisions.filter(
    (collision) =>
      collision.id !== "drop-archive" && collision.id !== "drop-trash"
  );
};

type ModalType = "note" | "settings";

export function NotesPage() {
  const {
    notes, // Subscribe to notes array for reactivity
    loading,
    activeNoteId,
    showArchived,
    showTrash,
    searchQuery,
    selectedTagIds,
    fetchNotes,
    createNote,
    updateNote,
    trashNote,
    restoreNote,
    permanentlyDeleteNote,
    emptyTrash,
    setActiveNote,
    setShowArchived,
    setShowTrash,
    setSearchQuery,
    getPaginatedNotes,
    getTrashCount,
    deleteNoteIfEmpty,
    loadMoreNotes,
    hasMoreNotes,
    reorderNotes,
    getNotesInFolder, // Get reactively from hook
  } = useNoteStore();

  const { tags, fetchTags, fetchNoteTags, getTagsForNote, addTagToNote } =
    useTagStore();
  const { subscribeToChanges, refreshPendingCount, sync } = useSyncStore();
  const { notesPerRow, viewMode, setViewMode } = usePreferencesStore();
  const { selectedFolderId, fetchFolders, getFolderById } = useFolderStore();
  const confirm = useConfirm();

  const [showSettings, setShowSettings] = useState(false);
  const [shareNoteId, setShareNoteId] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [folderPickerNoteId, setFolderPickerNoteId] = useState<string | null>(
    null,
  );
  const [showFolderManager, setShowFolderManager] = useState(false);
  const [folderViewSelectedNoteId, setFolderViewSelectedNoteId] = useState<
    string | null
  >(null);

  // Track if we're on mobile for folder view behavior
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(320); // Default 320px (w-80)
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      isResizing.current = true;
      startX.current = "touches" in e ? e.touches[0].clientX : e.clientX;
      startWidth.current = sidebarWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [sidebarWidth],
  );

  useEffect(() => {
    const handleResizeMove = (e: MouseEvent | TouchEvent) => {
      if (!isResizing.current) return;
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const delta = clientX - startX.current;
      const newWidth = Math.min(Math.max(startWidth.current + delta, 200), 600); // Min 200px, max 600px
      setSidebarWidth(newWidth);
    };

    const handleResizeEnd = () => {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
    document.addEventListener("touchmove", handleResizeMove);
    document.addEventListener("touchend", handleResizeEnd);

    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
      document.removeEventListener("touchmove", handleResizeMove);
      document.removeEventListener("touchend", handleResizeEnd);
    };
  }, []);

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    await sync();
    await fetchNotes();
  }, [sync, fetchNotes]);

  const {
    pullDistance,
    isRefreshing,
    handlers: pullHandlers,
  } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: reorderMode,
  });

  // Track modal stack for back button handling
  const modalStackRef = useRef<ModalType[]>([]);

  // Push modal to history stack
  const openModal = useCallback((modalType: ModalType) => {
    modalStackRef.current.push(modalType);
    window.history.pushState({ modal: modalType }, "");
  }, []);

  // Close modal and clean up history (when closing via UI, not back button)
  const closeModalNormally = useCallback((modalType: ModalType) => {
    const index = modalStackRef.current.lastIndexOf(modalType);
    if (index !== -1) {
      modalStackRef.current.splice(index, 1);
      window.history.back();
    }
  }, []);

  // Handle back button / swipe back
  useEffect(() => {
    const handlePopState = () => {
      const topModal = modalStackRef.current.pop();
      if (topModal === "note") {
        // Close note editor
        if (activeNoteId) {
          deleteNoteIfEmpty(activeNoteId);
        }
        setActiveNote(null);
      } else if (topModal === "settings") {
        setShowSettings(false);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activeNoteId, deleteNoteIfEmpty, setActiveNote]);

  // Initialize data and subscriptions
  useEffect(() => {
    fetchNotes();
    fetchTags();
    fetchNoteTags();
    fetchFolders();
    refreshPendingCount();

    // Subscribe to realtime changes
    const unsubscribe = subscribeToChanges();

    return () => {
      unsubscribe();
    };
  }, [
    fetchNotes,
    fetchTags,
    fetchNoteTags,
    fetchFolders,
    subscribeToChanges,
    refreshPendingCount,
  ]);

  // Get displayed notes based on view mode
  const displayedNotes = useMemo(() => {
    if (viewMode === "folder" && !showArchived && !showTrash) {
      // In folder view, show notes in the selected folder
      return getNotesInFolder(selectedFolderId);
    }
    // In list view or special views, use standard paginated notes
    return getPaginatedNotes();
  }, [
    viewMode,
    showArchived,
    showTrash,
    selectedFolderId,
    searchQuery,
    selectedTagIds,
    getPaginatedNotes,
    getNotesInFolder,
    notes,
  ]);

  const pinnedNotes = displayedNotes.filter((n) => n.is_pinned && !showTrash);
  const unpinnedNotes = displayedNotes.filter((n) => !n.is_pinned || showTrash);
  const trashCount = getTrashCount();
  const canLoadMore = viewMode === "list" && hasMoreNotes(); // Only paginate in list view

  // Ref for infinite scroll sentinel
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && canLoadMore && !loading) {
          loadMoreNotes();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore, loading, loadMoreNotes]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150, // Short delay since user explicitly enabled reorder mode
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Exit reorder mode when switching views
  useEffect(() => {
    if (showArchived || showTrash) {
      setReorderMode(false);
    }
  }, [showArchived, showTrash]);

  // Handle drag start - give haptic feedback and track dragging state
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      // Check if dragging is disabled
      const isDragDisabled =
        showTrash || searchQuery.length > 0 || selectedTagIds.length > 0;
      if (isDragDisabled) return;

      // On mobile (below sm breakpoint), only allow dragging in reorder mode
      const isMobile = window.matchMedia("(max-width: 639px)").matches;
      if (isMobile && !reorderMode) return;

      hapticLight();
      setDraggingNoteId(event.active.id as string);
    },
    [showTrash, searchQuery, selectedTagIds, reorderMode],
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const noteId = active.id as string;

      setDraggingNoteId(null);

      if (!over) return;

      // Handle drop on action zones
      if (over.id === "drop-archive") {
        hapticLight();
        const note = getPaginatedNotes().find((n) => n.id === noteId);
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

      // Handle reordering
      if (active.id !== over.id) {
        hapticLight();
        reorderNotes(noteId, over.id as string);
      }
    },
    [reorderNotes, getPaginatedNotes, updateNote, trashNote],
  );

  const handleCreateNote = useCallback(async () => {
    hapticLight();
    // In folder view, create note in selected folder
    const folderId = viewMode === "folder" ? selectedFolderId : null;
    const note = await createNote({ folder_id: folderId });
    if (note) {
      // Add currently filtered tags to the new note (only in list view)
      if (viewMode === "list") {
        for (const tagId of selectedTagIds) {
          await addTagToNote(note.id, tagId);
        }
      }
      openModal("note");
    }
  }, [
    createNote,
    openModal,
    selectedTagIds,
    addTagToNote,
    viewMode,
    selectedFolderId,
  ]);

  const handleCloseEditor = useCallback(async () => {
    if (activeNoteId) {
      // Delete the note if it's empty
      await deleteNoteIfEmpty(activeNoteId);
    }
    setActiveNote(null);
    closeModalNormally("note");
  }, [activeNoteId, deleteNoteIfEmpty, setActiveNote, closeModalNormally]);

  const handleArchive = useCallback(
    (noteId: string, isArchived: boolean) => {
      hapticLight();
      updateNote(noteId, { is_archived: !isArchived });
    },
    [updateNote],
  );

  const handlePin = useCallback(
    (noteId: string, isPinned: boolean) => {
      hapticLight();
      updateNote(noteId, { is_pinned: !isPinned });
    },
    [updateNote],
  );

  const handleDelete = useCallback(
    (noteId: string) => {
      hapticLight();
      trashNote(noteId);
    },
    [trashNote],
  );

  const handleRestore = useCallback(
    (noteId: string) => {
      hapticLight();
      restoreNote(noteId);
    },
    [restoreNote],
  );

  const handlePermanentDelete = useCallback(
    async (noteId: string) => {
      const confirmed = await confirm({
        title: "Delete permanently",
        message: "Permanently delete this note? This cannot be undone.",
        confirmText: "Delete",
        variant: "danger",
      });
      if (confirmed) {
        hapticLight();
        permanentlyDeleteNote(noteId);
      }
    },
    [permanentlyDeleteNote, confirm],
  );

  const handleEmptyTrash = useCallback(async () => {
    const confirmed = await confirm({
      title: "Empty trash",
      message: `Permanently delete all ${trashCount} notes in trash? This cannot be undone.`,
      confirmText: "Empty trash",
      variant: "danger",
    });
    if (confirmed) {
      hapticLight();
      emptyTrash();
    }
  }, [emptyTrash, trashCount, confirm]);

  const handleOpenNote = useCallback(
    (noteId: string) => {
      setActiveNote(noteId);
      openModal("note");
    },
    [setActiveNote, openModal],
  );

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true);
    openModal("settings");
  }, [openModal]);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
    closeModalNormally("settings");
  }, [closeModalNormally]);

  const handleShare = useCallback((noteId: string) => {
    hapticLight();
    setShareNoteId(noteId);
  }, []);

  const handleCloseShare = useCallback(() => {
    setShareNoteId(null);
  }, []);

  const handleMoveToFolder = useCallback((noteId: string) => {
    hapticLight();
    setFolderPickerNoteId(noteId);
  }, []);

  const handleFolderSelected = useCallback(
    async (folderId: string | null) => {
      if (folderPickerNoteId) {
        const { moveNoteToFolder } = useNoteStore.getState();
        await moveNoteToFolder(folderPickerNoteId, folderId);
        setFolderPickerNoteId(null);
      }
    },
    [folderPickerNoteId],
  );

  // Grid classes based on notesPerRow setting (respects setting on all screen sizes)
  const gridClasses = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
  }[notesPerRow];

  return (
    <div
      className="min-h-screen bg-gray-50 dark:bg-gray-900"
      onTouchStart={pullHandlers.onTouchStart}
      onTouchMove={pullHandlers.onTouchMove}
      onTouchEnd={pullHandlers.onTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className="fixed top-0 left-0 right-0 flex justify-center z-50 pointer-events-none"
          style={{
            transform: `translateY(${Math.min(pullDistance, 80) - 40}px)`,
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-full p-2 shadow-lg">
            <RefreshCw
              className={`w-5 h-5 text-primary-600 dark:text-primary-400 ${isRefreshing ? "animate-spin" : ""}`}
              style={{
                transform: isRefreshing
                  ? undefined
                  : `rotate(${pullDistance * 3}deg)`,
              }}
            />
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        {/* Top row: Title and actions */}
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              {showTrash ? "Trash" : showArchived ? "Archive" : "Notes"}
            </h1>
            <SyncStatus />
          </div>

          <div className="flex items-center gap-1">
            {/* Reorder mode toggle - only show on mobile in main notes view */}
            {!showArchived && !showTrash && (
              <button
                onClick={() => setReorderMode(!reorderMode)}
                className={`btn p-2 sm:hidden ${
                  reorderMode
                    ? "bg-primary-100 hover:bg-primary-200 dark:bg-primary-900 dark:hover:bg-primary-800 text-primary-700 dark:text-primary-300"
                    : "btn-ghost"
                }`}
                title={reorderMode ? "Exit reorder mode" : "Reorder notes"}
              >
                <ArrowUpDown className="w-5 h-5" />
              </button>
            )}

            {/* View switcher (includes view mode, archive, trash) */}
            <ViewSwitcher
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              showArchived={showArchived}
              showTrash={showTrash}
              onShowArchived={setShowArchived}
              onShowTrash={setShowTrash}
              trashCount={trashCount}
            />

            {/* Settings */}
            <button
              onClick={handleOpenSettings}
              className="btn btn-ghost p-2"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search row */}
        <div className="max-w-4xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-9 py-2 bg-gray-100 dark:bg-gray-700 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 ${searchQuery ? "pr-9" : "pr-3"}`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tag filter - hidden in folder view */}
        {tags.length > 0 && !showTrash && viewMode === "list" && (
          <div className="max-w-4xl mx-auto px-4 pb-3">
            <TagFilter />
          </div>
        )}
      </header>

      {/* Main content */}
      {/* Folder View - Split Pane Layout */}
      {viewMode === "folder" && !showArchived && !showTrash ? (
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

                // Handle dropping note onto folder
                const dragData = active.data.current;
                if (
                  dragData?.type === "note" &&
                  over.id.toString().startsWith("folder-")
                ) {
                  const folderId = over.id.toString().replace("folder-", "");
                  const noteId = dragData.note.id;
                  hapticLight();
                  useNoteStore
                    .getState()
                    .moveNoteToFolder(
                      noteId,
                      folderId === "root" ? null : folderId,
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
                  if (isMobile) {
                    // On mobile, open in modal
                    setActiveNote(noteId);
                    openModal("note");
                  } else {
                    // On desktop, show in pane
                    setFolderViewSelectedNoteId(noteId);
                  }
                }}
                onCreateNote={async (folderId) => {
                  hapticLight();
                  const note = await createNote({ folder_id: folderId });
                  if (note) {
                    if (isMobile) {
                      openModal("note");
                    } else {
                      setFolderViewSelectedNoteId(note.id);
                    }
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
                  hapticLight();
                  updateNote(noteId, {
                    is_archived: !notes.find((n) => n.id === noteId)
                      ?.is_archived,
                  });
                }}
                onPinNote={(noteId) => {
                  hapticLight();
                  updateNote(noteId, {
                    is_pinned: !notes.find((n) => n.id === noteId)?.is_pinned,
                  });
                }}
              />
            </DndContext>
          </div>

          {/* Resize Handle - Desktop only */}
          {!isMobile && (
            <div
              className="w-1 bg-gray-200 dark:bg-gray-700 hover:bg-primary-400 dark:hover:bg-primary-600 cursor-col-resize flex-shrink-0 transition-colors"
              onMouseDown={handleResizeStart}
              onTouchStart={handleResizeStart}
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
              />
            </div>
          )}
        </main>
      ) : (
        /* List View and Archive/Trash */
        <main className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex-1 min-w-0">
            {/* Reorder mode banner */}
            {reorderMode && (
              <div className="flex items-center justify-between mb-4 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
                <p className="text-sm text-primary-800 dark:text-primary-200">
                  Drag notes to reorder them
                </p>
                <button
                  onClick={() => setReorderMode(false)}
                  className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
                >
                  Done
                </button>
              </div>
            )}

            {/* Trash header */}
            {showTrash && trashCount > 0 && (
              <div className="flex items-center justify-between mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Notes in trash are automatically deleted after 30 days
                </p>
                <button
                  onClick={handleEmptyTrash}
                  className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium"
                >
                  Empty trash
                </button>
              </div>
            )}

            {loading && displayedNotes.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
              </div>
            ) : displayedNotes.length === 0 ? (
              <div className="text-center py-12">
                <div className="mb-4">
                  {showTrash ? (
                    <Trash className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
                  ) : null}
                </div>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  {showTrash
                    ? "Trash is empty"
                    : showArchived
                      ? "No archived notes"
                      : searchQuery
                        ? "No notes match your search"
                        : selectedTagIds.length > 0
                          ? "No notes with selected tags"
                          : viewMode === "folder"
                            ? selectedFolderId
                              ? "No notes in this folder"
                              : "No notes without a folder"
                            : "No notes yet"}
                </p>
                {!showArchived &&
                  !showTrash &&
                  !searchQuery &&
                  selectedTagIds.length === 0 && (
                    <button
                      onClick={handleCreateNote}
                      className="btn btn-primary"
                    >
                      {viewMode === "folder" && selectedFolderId
                        ? "Create note in this folder"
                        : "Create your first note"}
                    </button>
                  )}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={customCollisionDetection}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
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
                              tags={
                                viewMode === "list"
                                  ? getTagsForNote(note.id)
                                  : []
                              }
                              folder={
                                note.folder_id
                                  ? getFolderById(note.folder_id)
                                  : null
                              }
                              onClick={() => handleOpenNote(note.id)}
                              onPin={() => handlePin(note.id, note.is_pinned)}
                              onArchive={() =>
                                handleArchive(note.id, note.is_archived)
                              }
                              onDelete={() => handleDelete(note.id)}
                              onShare={() => handleShare(note.id)}
                              onMoveToFolder={() => handleMoveToFolder(note.id)}
                              showFolder={false}
                              isDragDisabled={
                                searchQuery.length > 0 ||
                                selectedTagIds.length > 0
                              }
                              reorderMode={reorderMode}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </section>
                  )}

                  {/* Other notes / Trash notes */}
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
                                note.folder_id
                                  ? getFolderById(note.folder_id)
                                  : null
                              }
                              onClick={() =>
                                !showTrash && handleOpenNote(note.id)
                              }
                              onPin={
                                !showTrash
                                  ? () => handlePin(note.id, note.is_pinned)
                                  : undefined
                              }
                              onArchive={
                                !showTrash
                                  ? () =>
                                      handleArchive(note.id, note.is_archived)
                                  : undefined
                              }
                              onDelete={
                                showTrash
                                  ? () => handlePermanentDelete(note.id)
                                  : () => handleDelete(note.id)
                              }
                              onRestore={
                                showTrash
                                  ? () => handleRestore(note.id)
                                  : undefined
                              }
                              onShare={
                                !showTrash
                                  ? () => handleShare(note.id)
                                  : undefined
                              }
                              onMoveToFolder={
                                !showTrash
                                  ? () => handleMoveToFolder(note.id)
                                  : undefined
                              }
                              showRestore={showTrash}
                              showFolder={false}
                              isDragDisabled={
                                showTrash ||
                                searchQuery.length > 0 ||
                                selectedTagIds.length > 0
                              }
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
            )}
          </div>
        </main>
      )}

      {/* Floating action button - hide in folder view on desktop (tree has create buttons) */}
      {!showArchived && !showTrash && (viewMode === "list" || isMobile) && (
        <button
          onClick={handleCreateNote}
          className="fixed right-6 w-14 h-14 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 active:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-900 flex items-center justify-center transition-transform active:scale-95 native-fab bottom-6"
          title="Create new note"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Note editor modal */}
      {activeNoteId && (
        <NoteEditor
          noteId={activeNoteId}
          onClose={handleCloseEditor}
          hideTags={viewMode === "folder"}
        />
      )}

      {/* Settings modal */}
      {showSettings && <SettingsModal onClose={handleCloseSettings} />}

      {/* Share modal */}
      {shareNoteId && (
        <ShareModal
          noteId={shareNoteId}
          noteTitle={
            displayedNotes.find((n) => n.id === shareNoteId)?.title || null
          }
          onClose={handleCloseShare}
        />
      )}

      {/* Folder picker modal */}
      {folderPickerNoteId && (
        <FolderPicker
          open={true}
          onClose={() => setFolderPickerNoteId(null)}
          onSelect={handleFolderSelected}
          currentFolderId={
            displayedNotes.find((n) => n.id === folderPickerNoteId)?.folder_id
          }
          title="Move to folder"
        />
      )}

      {/* Folder manager modal */}
      <FolderManager
        open={showFolderManager}
        onClose={() => setShowFolderManager(false)}
      />
    </div>
  );
}
