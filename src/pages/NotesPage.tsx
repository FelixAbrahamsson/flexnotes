import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import {
  Plus,
  Search,
  Settings,
  Trash,
  ArrowUpDown,
  RefreshCw,
  X,
  Share2,
  Users,
} from "lucide-react";
import { DndContext } from "@dnd-kit/core";
import { hapticLight } from "@/hooks/useCapacitor";
import { useNoteEditorLifecycle } from "@/hooks/useNoteEditorLifecycle";
import { useNoteDragAndDrop } from "@/hooks/useNoteDragAndDrop";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useResizableSidebar } from "@/hooks/useResizableSidebar";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useNoteFromUrl } from "@/hooks/useNoteFromUrl";
import { useNoteStore } from "@/stores/noteStore";
import { useNoteUIStore } from "@/stores/noteUIStore";
import { useTagStore } from "@/stores/tagStore";
import { useSyncStore } from "@/stores/syncStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useFolderStore } from "@/stores/folderStore";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { NoteEditorPane } from "@/components/notes/NoteEditorPane";
import { NoteGrid } from "@/components/notes/NoteGrid";
import { SharedWithMeView } from "@/components/notes/SharedWithMeView";
import { TagFilter } from "@/components/tags/TagFilter";
import { SyncStatus } from "@/components/SyncStatus";
import { SettingsModal } from "@/components/SettingsModal";
import { ShareModal } from "@/components/sharing/ShareModal";
import { ViewSwitcher } from "@/components/ui/ViewSwitcher";
import { FolderTreeView } from "@/components/folders/FolderTreeView";
import { FolderPicker } from "@/components/folders/FolderPicker";
import { FolderManager } from "@/components/folders/FolderManager";
import { removeSavedShare } from "@/services/share";

export function NotesPage() {
  // Data store
  const {
    notes,
    loading,
    sharedNoteIds,
    sharedWithMeNotes,
    sharedWithMeLoading,
    fetchNotes,
    createNote,
    updateNote,
    trashNote,
    restoreNote,
    permanentlyDeleteNote,
    emptyTrash,
    duplicateNote,
    fetchSharedNoteIds,
    fetchSharedWithMeNotes,
    removeSharedWithMeNote,
    getTrashCount,
    getNotesInFolder,
  } = useNoteStore();

  // UI store
  const {
    activeNoteId,
    showArchived,
    showTrash,
    showShared,
    sharedTab,
    searchQuery,
    selectedTagIds,
    setActiveNote,
    setShowArchived,
    setShowTrash,
    setShowShared,
    setSharedTab,
    setSearchQuery,
    loadMoreNotes,
    getPaginatedNotes,
    hasMoreNotes,
  } = useNoteUIStore();

  const { tags, fetchTags, fetchNoteTags, getTagsForNote, addTagToNote } =
    useTagStore();
  const { subscribeToChanges, refreshPendingCount, sync } = useSyncStore();
  const { notesPerRow, viewMode, setViewMode } = usePreferencesStore();
  const { selectedFolderId, fetchFolders, getFolderById } = useFolderStore();
  const confirm = useConfirm();

  // Update browser tab title based on active note
  const activeNoteTitle = useMemo(() => {
    if (!activeNoteId) return null;
    const note = notes.find((n) => n.id === activeNoteId);
    return note?.title || null;
  }, [activeNoteId, notes]);
  useDocumentTitle(activeNoteTitle);

  // Track if we're on mobile for folder view behavior
  // Defined early so it can be shared between hooks
  const isMobileRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      isMobileRef.current = mobile;
      setIsMobile(mobile);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Sync open note with URL (allows each tab to remember its own note)
  const { noteIdFromUrl, setNoteInUrl, clearNoteFromUrl } = useNoteFromUrl({
    onNoteIdChange: useCallback((noteId: string | null) => {
      if (noteId) {
        // In folder view desktop, show in pane; otherwise show in modal
        if (viewMode === "folder" && !isMobileRef.current) {
          setActiveNote(null); // Close any modal
          setFolderViewSelectedNoteId(noteId);
        } else {
          setActiveNote(noteId);
        }
      }
    }, [setActiveNote, viewMode]),
    validateNoteExists: useCallback((noteId: string) => {
      return notes.some((n) => n.id === noteId && !n.is_deleted);
    }, [notes]),
    isLoading: loading,
    hasNotes: notes.length > 0,
  });

  const [showSettings, setShowSettings] = useState(false);
  const [shareNoteId, setShareNoteId] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [folderPickerNoteId, setFolderPickerNoteId] = useState<string | null>(
    null,
  );
  const [showFolderManager, setShowFolderManager] = useState(false);
  const [folderViewSelectedNoteId, setFolderViewSelectedNoteId] = useState<
    string | null
  >(null);

  // Resizable sidebar
  const { width: sidebarWidth, handleResizeStart } = useResizableSidebar({
    defaultWidth: 320,
    minWidth: 200,
    maxWidth: 600,
  });

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    await sync();
    await fetchNotes();
    await fetchSharedNoteIds();
    await fetchSharedWithMeNotes();
  }, [sync, fetchNotes, fetchSharedNoteIds, fetchSharedWithMeNotes]);

  const {
    pullDistance,
    isRefreshing,
    containerRef: pullToRefreshRef,
  } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: reorderMode,
  });

  // Editor lifecycle: modal stack, popstate, beforeunload, close handling
  const {
    modalStackRef,
    activeNoteIdRef,
    editorFlushSaveRef,
    editorDirtyRef,
    paneFlushSaveRef,
    paneDirtyRef,
    openModal,
    closeModalNormally,
    handleCloseEditor,
  } = useNoteEditorLifecycle({
    clearNoteFromUrl,
    onCloseSettings: useCallback(() => setShowSettings(false), []),
    isMobileRef,
  });

  // Track previous noteIdFromUrl to detect back navigation
  const prevNoteIdFromUrlRef = useRef(noteIdFromUrl);

  // Safety net: if URL changes from having a note ID to not having one,
  // but note is still open on mobile, close it.
  useEffect(() => {
    const hadNoteId = prevNoteIdFromUrlRef.current;
    const hasNoteId = noteIdFromUrl;

    if (hadNoteId && !hasNoteId && activeNoteId && isMobileRef.current) {
      setActiveNote(null);
    }

    prevNoteIdFromUrlRef.current = noteIdFromUrl;
  }, [noteIdFromUrl, activeNoteId, setActiveNote]);

  // Initialize data and subscriptions
  useEffect(() => {
    fetchNotes();
    fetchTags();
    fetchNoteTags();
    fetchFolders();
    fetchSharedNoteIds();
    fetchSharedWithMeNotes();
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
    fetchSharedNoteIds,
    fetchSharedWithMeNotes,
    subscribeToChanges,
    refreshPendingCount,
  ]);

  // Fetch shared data when entering shared view or switching tabs
  useEffect(() => {
    if (showShared) {
      if (sharedTab === 'by_me') {
        fetchSharedNoteIds();
      } else {
        fetchSharedWithMeNotes();
      }
    }
  }, [showShared, sharedTab, fetchSharedNoteIds, fetchSharedWithMeNotes]);

  // Note: Note restoration is now handled by useNoteFromUrl via URL query param
  // for both list view modals and folder view pane selection

  // Get displayed notes based on view mode
  const displayedNotes = useMemo(() => {
    if (viewMode === "folder" && !showArchived && !showTrash && !showShared) {
      // In folder view, show notes in the selected folder
      return getNotesInFolder(selectedFolderId, showArchived);
    }
    // In list view or special views, use standard paginated notes
    return getPaginatedNotes(notes, sharedNoteIds);
  }, [
    viewMode,
    showArchived,
    showTrash,
    showShared,
    selectedFolderId,
    searchQuery,
    selectedTagIds,
    getPaginatedNotes,
    getNotesInFolder,
    notes,
    sharedNoteIds,
  ]);

  const pinnedNotes = displayedNotes.filter((n: { is_pinned: boolean }) => n.is_pinned && !showTrash);
  const unpinnedNotes = displayedNotes.filter((n: { is_pinned: boolean }) => !n.is_pinned || showTrash);
  const trashCount = getTrashCount();
  const canLoadMore = viewMode === "list" && hasMoreNotes(notes, sharedNoteIds);

  // Drag and drop
  const { sensors, draggingNoteId, handleDragStart, handleDragEnd } =
    useNoteDragAndDrop({
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
    });

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
      setActiveNote(note.id);
      setNoteInUrl(note.id);
      // Push to history stack on mobile so back button closes the note
      if (isMobileRef.current) {
        modalStackRef.current.push("note");
        window.history.pushState({ modal: "note" }, "");
      }
    }
  }, [
    createNote,
    setActiveNote,
    selectedTagIds,
    addTagToNote,
    viewMode,
    selectedFolderId,
    setNoteInUrl,
  ]);

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
      setNoteInUrl(noteId);
      // Push to history stack on mobile so back button closes the note
      if (isMobileRef.current) {
        modalStackRef.current.push("note");
        window.history.pushState({ modal: "note" }, "");
      }
    },
    [setActiveNote, setNoteInUrl],
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

  const handleDuplicate = useCallback(
    async (noteId: string) => {
      hapticLight();
      await duplicateNote(noteId);
    },
    [duplicateNote],
  );

  const handleCloseShare = useCallback(() => {
    setShareNoteId(null);
  }, []);

  const handleMoveToFolder = useCallback((noteId: string) => {
    hapticLight();
    setFolderPickerNoteId(noteId);
  }, []);

  const handleRemoveSharedWithMe = useCallback(async (savedShareId: string) => {
    hapticLight();
    const { error } = await removeSavedShare(savedShareId);
    if (!error) {
      removeSharedWithMeNote(savedShareId);
    }
  }, [removeSharedWithMeNote]);

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

  // Grid classes based on notesPerRow setting
  const gridClasses = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
  }[notesPerRow];

  return (
    <div
      ref={pullToRefreshRef}
      className="min-h-screen bg-gray-50 dark:bg-gray-900"
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
              {showTrash ? "Trash" : showArchived ? "Archive" : showShared ? "Shared" : "Notes"}
            </h1>
            <SyncStatus />
          </div>

          <div className="flex items-center gap-1">
            {/* Reorder mode toggle - only show on mobile in main notes view */}
            {!showArchived && !showTrash && !showShared && (
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
              showShared={showShared}
              onShowArchived={setShowArchived}
              onShowTrash={setShowTrash}
              onShowShared={setShowShared}
              archiveCount={notes.filter(n => !n.is_deleted && n.is_archived).length}
              trashCount={trashCount}
              sharedCount={sharedWithMeNotes.length + notes.filter(n => !n.is_deleted && sharedNoteIds.has(n.id)).length}
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
      {viewMode === "folder" && !showArchived && !showTrash && !showShared ? (
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
                if (
                  dragData?.type === "note" &&
                  overId.startsWith("folder-")
                ) {
                  const folderId = overId.replace("folder-", "");
                  const noteId = dragData.note.id;
                  hapticLight();
                  useNoteStore
                    .getState()
                    .moveNoteToFolder(
                      noteId,
                      folderId === "root" ? null : folderId,
                    );
                }

                // Handle dropping folder onto another folder
                if (
                  dragData?.type === "folder" &&
                  overId.startsWith("folder-")
                ) {
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
                flushSaveRef={paneFlushSaveRef}
                dirtyRef={paneDirtyRef}
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

            {/* Shared tabs */}
            {showShared && (
              <div className="flex gap-1 mb-4 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <button
                  onClick={() => setSharedTab('with_me')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    sharedTab === 'with_me'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Shared with me
                </button>
                <button
                  onClick={() => setSharedTab('by_me')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    sharedTab === 'by_me'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  <Share2 className="w-4 h-4" />
                  Shared by me
                </button>
              </div>
            )}

            {/* Shared with me content */}
            {showShared && sharedTab === 'with_me' ? (
              <SharedWithMeView
                notes={sharedWithMeNotes}
                loading={sharedWithMeLoading}
                gridClasses={gridClasses}
                onRemove={handleRemoveSharedWithMe}
              />
            ) : loading && displayedNotes.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
              </div>
            ) : displayedNotes.length === 0 ? (
              <div className="text-center py-12">
                <div className="mb-4">
                  {showTrash ? (
                    <Trash className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
                  ) : showShared ? (
                    <Share2 className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
                  ) : null}
                </div>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  {showTrash
                    ? "Trash is empty"
                    : showArchived
                      ? "No archived notes"
                      : showShared
                        ? "You haven't shared any notes yet"
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
                {showShared && sharedTab === 'by_me' && (
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    Share a note to see it here
                  </p>
                )}
                {!showArchived &&
                  !showTrash &&
                  !showShared &&
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
              <NoteGrid
                pinnedNotes={pinnedNotes}
                unpinnedNotes={unpinnedNotes}
                gridClasses={gridClasses}
                showTrash={showTrash}
                showArchived={showArchived}
                reorderMode={reorderMode}
                searchQuery={searchQuery}
                selectedTagIds={selectedTagIds}
                viewMode={viewMode}
                draggingNoteId={draggingNoteId}
                canLoadMore={canLoadMore}
                loading={loading}
                getTagsForNote={getTagsForNote}
                getFolderById={getFolderById}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onOpenNote={handleOpenNote}
                onPin={handlePin}
                onArchive={handleArchive}
                onDelete={handleDelete}
                onRestore={handleRestore}
                onPermanentDelete={handlePermanentDelete}
                onShare={handleShare}
                onDuplicate={handleDuplicate}
                onMoveToFolder={handleMoveToFolder}
                onLoadMore={loadMoreNotes}
              />
            )}
          </div>
        </main>
      )}

      {/* Floating action button - hide in folder view on desktop (tree has create buttons) */}
      {!showArchived && !showTrash && !showShared && (viewMode === "list" || isMobile) && (
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
          flushSaveRef={editorFlushSaveRef}
          dirtyRef={editorDirtyRef}
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
