import { useEffect, useCallback, useState, useRef } from 'react'
import { Plus, Search, Archive, Trash2, Settings, Trash, ArrowUpDown, RefreshCw, X } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { hapticLight } from '@/hooks/useCapacitor'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { useNoteStore } from '@/stores/noteStore'
import { useTagStore } from '@/stores/tagStore'
import { useSyncStore } from '@/stores/syncStore'
import { usePreferencesStore } from '@/stores/preferencesStore'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { NoteCard } from '@/components/notes/NoteCard'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { TagFilter } from '@/components/tags/TagFilter'
import { SyncStatus } from '@/components/SyncStatus'
import { SettingsModal } from '@/components/SettingsModal'
import { ShareModal } from '@/components/sharing/ShareModal'
import type { Note, Tag } from '@/types'

// Sortable wrapper for NoteCard
interface SortableNoteCardProps {
  note: Note
  tags: Tag[]
  onClick: () => void
  onArchive?: () => void
  onDelete: () => void
  onRestore?: () => void
  onShare?: () => void
  showRestore?: boolean
  isDragDisabled?: boolean
  reorderMode?: boolean
}

function SortableNoteCard({
  note,
  tags,
  onClick,
  onArchive,
  onDelete,
  onRestore,
  onShare,
  showRestore,
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
  } = useSortable({ id: note.id, disabled: isDragDisabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
    // Only disable touch scrolling when in reorder mode (mobile) or when dragging
    touchAction: (reorderMode && !isDragDisabled) ? 'none' : 'auto',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragDisabled ? '' : 'cursor-grab active:cursor-grabbing'}
      {...attributes}
      {...listeners}
    >
      <NoteCard
        note={note}
        tags={tags}
        onClick={onClick}
        onArchive={onArchive}
        onDelete={onDelete}
        onRestore={onRestore}
        onShare={onShare}
        showRestore={showRestore}
      />
    </div>
  )
}

// Drop zone for archive/trash actions during drag
interface ActionDropZoneProps {
  id: string
  icon: React.ReactNode
  label: string
  variant: 'archive' | 'trash'
}

function ActionDropZone({ id, icon, label, variant }: ActionDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({ id })

  const baseClasses = 'flex flex-col items-center justify-center gap-2 py-4 px-6 rounded-xl transition-all duration-200'
  const variantClasses = variant === 'trash'
    ? isOver
      ? 'bg-red-500 text-white scale-110'
      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
    : isOver
      ? 'bg-amber-500 text-white scale-110'
      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'

  return (
    <div ref={setNodeRef} className={`${baseClasses} ${variantClasses}`}>
      <div className={`transition-transform ${isOver ? 'scale-125' : ''}`}>
        {icon}
      </div>
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

type ModalType = 'note' | 'settings'

export function NotesPage() {
  const {
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
  } = useNoteStore()

  const { tags, fetchTags, fetchNoteTags, getTagsForNote, addTagToNote } = useTagStore()
  const { subscribeToChanges, refreshPendingCount, sync } = useSyncStore()
  const { notesPerRow } = usePreferencesStore()
  const confirm = useConfirm()

  const [showSettings, setShowSettings] = useState(false)
  const [shareNoteId, setShareNoteId] = useState<string | null>(null)
  const [reorderMode, setReorderMode] = useState(false)
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null)

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    await sync()
    await fetchNotes()
  }, [sync, fetchNotes])

  const { pullDistance, isRefreshing, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: handleRefresh,
  })

  // Track modal stack for back button handling
  const modalStackRef = useRef<ModalType[]>([])

  // Push modal to history stack
  const openModal = useCallback((modalType: ModalType) => {
    modalStackRef.current.push(modalType)
    window.history.pushState({ modal: modalType }, '')
  }, [])

  // Close modal and clean up history (when closing via UI, not back button)
  const closeModalNormally = useCallback((modalType: ModalType) => {
    const index = modalStackRef.current.lastIndexOf(modalType)
    if (index !== -1) {
      modalStackRef.current.splice(index, 1)
      window.history.back()
    }
  }, [])

  // Handle back button / swipe back
  useEffect(() => {
    const handlePopState = () => {
      const topModal = modalStackRef.current.pop()
      if (topModal === 'note') {
        // Close note editor
        if (activeNoteId) {
          deleteNoteIfEmpty(activeNoteId)
        }
        setActiveNote(null)
      } else if (topModal === 'settings') {
        setShowSettings(false)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [activeNoteId, deleteNoteIfEmpty, setActiveNote])

  // Initialize data and subscriptions
  useEffect(() => {
    fetchNotes()
    fetchTags()
    fetchNoteTags()
    refreshPendingCount()

    // Subscribe to realtime changes
    const unsubscribe = subscribeToChanges()

    return () => {
      unsubscribe()
    }
  }, [fetchNotes, fetchTags, fetchNoteTags, subscribeToChanges, refreshPendingCount])

  const paginatedNotes = getPaginatedNotes()
  const pinnedNotes = paginatedNotes.filter(n => n.is_pinned && !showTrash)
  const unpinnedNotes = paginatedNotes.filter(n => !n.is_pinned || showTrash)
  const trashCount = getTrashCount()
  const canLoadMore = hasMoreNotes()

  // Ref for infinite scroll sentinel
  const loadMoreRef = useRef<HTMLDivElement>(null)

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = loadMoreRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && canLoadMore && !loading) {
          loadMoreNotes()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [canLoadMore, loading, loadMoreNotes])

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
    })
  )

  // Exit reorder mode when switching views
  useEffect(() => {
    if (showArchived || showTrash) {
      setReorderMode(false)
    }
  }, [showArchived, showTrash])

  // Handle drag start - give haptic feedback and track dragging state
  const handleDragStart = useCallback((event: DragStartEvent) => {
    // Check if dragging is disabled
    const isDragDisabled = showTrash || searchQuery.length > 0 || selectedTagIds.length > 0
    if (isDragDisabled) return

    // On mobile (below sm breakpoint), only allow dragging in reorder mode
    const isMobile = window.matchMedia('(max-width: 639px)').matches
    if (isMobile && !reorderMode) return

    hapticLight()
    setDraggingNoteId(event.active.id as string)
  }, [showTrash, searchQuery, selectedTagIds, reorderMode])

  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    const noteId = active.id as string

    setDraggingNoteId(null)

    if (!over) return

    // Handle drop on action zones
    if (over.id === 'drop-archive') {
      hapticLight()
      const note = getPaginatedNotes().find(n => n.id === noteId)
      if (note) {
        updateNote(noteId, { is_archived: !note.is_archived })
      }
      return
    }

    if (over.id === 'drop-trash') {
      hapticLight()
      trashNote(noteId)
      return
    }

    // Handle reordering
    if (active.id !== over.id) {
      hapticLight()
      reorderNotes(noteId, over.id as string)
    }
  }, [reorderNotes, getPaginatedNotes, updateNote, trashNote])

  const handleCreateNote = useCallback(async () => {
    hapticLight()
    const note = await createNote()
    if (note) {
      // Add currently filtered tags to the new note
      for (const tagId of selectedTagIds) {
        await addTagToNote(note.id, tagId)
      }
      openModal('note')
    }
  }, [createNote, openModal, selectedTagIds, addTagToNote])

  const handleCloseEditor = useCallback(async () => {
    if (activeNoteId) {
      // Delete the note if it's empty
      await deleteNoteIfEmpty(activeNoteId)
    }
    setActiveNote(null)
    closeModalNormally('note')
  }, [activeNoteId, deleteNoteIfEmpty, setActiveNote, closeModalNormally])

  const handleArchive = useCallback((noteId: string, isArchived: boolean) => {
    hapticLight()
    updateNote(noteId, { is_archived: !isArchived })
  }, [updateNote])

  const handleDelete = useCallback((noteId: string) => {
    hapticLight()
    trashNote(noteId)
  }, [trashNote])

  const handleRestore = useCallback((noteId: string) => {
    hapticLight()
    restoreNote(noteId)
  }, [restoreNote])

  const handlePermanentDelete = useCallback(async (noteId: string) => {
    const confirmed = await confirm({
      title: 'Delete permanently',
      message: 'Permanently delete this note? This cannot be undone.',
      confirmText: 'Delete',
      variant: 'danger',
    })
    if (confirmed) {
      hapticLight()
      permanentlyDeleteNote(noteId)
    }
  }, [permanentlyDeleteNote, confirm])

  const handleEmptyTrash = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Empty trash',
      message: `Permanently delete all ${trashCount} notes in trash? This cannot be undone.`,
      confirmText: 'Empty trash',
      variant: 'danger',
    })
    if (confirmed) {
      hapticLight()
      emptyTrash()
    }
  }, [emptyTrash, trashCount, confirm])

  const handleOpenNote = useCallback((noteId: string) => {
    setActiveNote(noteId)
    openModal('note')
  }, [setActiveNote, openModal])

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true)
    openModal('settings')
  }, [openModal])

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false)
    closeModalNormally('settings')
  }, [closeModalNormally])

  const handleShare = useCallback((noteId: string) => {
    hapticLight()
    setShareNoteId(noteId)
  }, [])

  const handleCloseShare = useCallback(() => {
    setShareNoteId(null)
  }, [])

  // Grid classes based on notesPerRow setting (respects setting on all screen sizes)
  const gridClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
  }[notesPerRow]

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
          style={{ transform: `translateY(${Math.min(pullDistance, 80) - 40}px)` }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-full p-2 shadow-lg">
            <RefreshCw
              className={`w-5 h-5 text-primary-600 dark:text-primary-400 ${isRefreshing ? 'animate-spin' : ''}`}
              style={{
                transform: isRefreshing ? undefined : `rotate(${pullDistance * 3}deg)`,
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
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {showTrash ? 'Trash' : showArchived ? 'Archive' : 'Notes'}
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
                    ? 'bg-primary-100 hover:bg-primary-200 dark:bg-primary-900 dark:hover:bg-primary-800 text-primary-700 dark:text-primary-300'
                    : 'btn-ghost'
                }`}
                title={reorderMode ? 'Exit reorder mode' : 'Reorder notes'}
              >
                <ArrowUpDown className="w-5 h-5" />
              </button>
            )}

            {/* Archive toggle */}
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`btn p-2 ${
                showArchived
                  ? 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100'
                  : 'btn-ghost'
              }`}
              title={showArchived ? 'Show active notes' : 'Show archived notes'}
            >
              <Archive className="w-5 h-5" />
            </button>

            {/* Trash toggle */}
            <button
              onClick={() => setShowTrash(!showTrash)}
              className={`btn p-2 relative ${
                showTrash
                  ? 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100'
                  : 'btn-ghost'
              }`}
              title={showTrash ? 'Show active notes' : 'Show trash'}
            >
              <Trash2 className="w-5 h-5" />
              {trashCount > 0 && !showTrash && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {trashCount > 9 ? '9+' : trashCount}
                </span>
              )}
            </button>

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
              onChange={e => setSearchQuery(e.target.value)}
              className={`w-full pl-9 py-2 bg-gray-100 dark:bg-gray-700 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 ${searchQuery ? 'pr-9' : 'pr-3'}`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tag filter */}
        {tags.length > 0 && !showTrash && (
          <div className="max-w-4xl mx-auto px-4 pb-3">
            <TagFilter />
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
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

        {loading && paginatedNotes.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : paginatedNotes.length === 0 ? (
          <div className="text-center py-12">
            <div className="mb-4">
              {showTrash ? (
                <Trash className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
              ) : null}
            </div>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {showTrash
                ? 'Trash is empty'
                : showArchived
                  ? 'No archived notes'
                  : searchQuery
                    ? 'No notes match your search'
                    : selectedTagIds.length > 0
                      ? 'No notes with selected tags'
                      : 'No notes yet'}
            </p>
            {!showArchived && !showTrash && !searchQuery && selectedTagIds.length === 0 && (
              <button onClick={handleCreateNote} className="btn btn-primary">
                Create your first note
              </button>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
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
                    items={pinnedNotes.map(n => n.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className={`grid gap-3 ${gridClasses}`}>
                      {pinnedNotes.map(note => (
                        <SortableNoteCard
                          key={note.id}
                          note={note}
                          tags={getTagsForNote(note.id)}
                          onClick={() => handleOpenNote(note.id)}
                          onArchive={() => handleArchive(note.id, note.is_archived)}
                          onDelete={() => handleDelete(note.id)}
                          onShare={() => handleShare(note.id)}
                          isDragDisabled={searchQuery.length > 0 || selectedTagIds.length > 0}
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
                    items={unpinnedNotes.map(n => n.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className={`grid gap-3 ${gridClasses}`}>
                      {unpinnedNotes.map(note => (
                        <SortableNoteCard
                          key={note.id}
                          note={note}
                          tags={getTagsForNote(note.id)}
                          onClick={() => !showTrash && handleOpenNote(note.id)}
                          onArchive={!showTrash ? () => handleArchive(note.id, note.is_archived) : undefined}
                          onDelete={showTrash ? () => handlePermanentDelete(note.id) : () => handleDelete(note.id)}
                          onRestore={showTrash ? () => handleRestore(note.id) : undefined}
                          onShare={!showTrash ? () => handleShare(note.id) : undefined}
                          showRestore={showTrash}
                          isDragDisabled={showTrash || searchQuery.length > 0 || selectedTagIds.length > 0}
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
              <div className="fixed bottom-6 left-0 right-0 flex justify-center gap-12 px-4 z-50 pointer-events-auto">
                <ActionDropZone
                  id="drop-archive"
                  icon={<Archive className="w-6 h-6" />}
                  label={showArchived ? 'Unarchive' : 'Archive'}
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
      </main>

      {/* Floating action button */}
      {!showArchived && !showTrash && (
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
        <NoteEditor noteId={activeNoteId} onClose={handleCloseEditor} />
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal onClose={handleCloseSettings} />
      )}

      {/* Share modal */}
      {shareNoteId && (
        <ShareModal
          noteId={shareNoteId}
          noteTitle={paginatedNotes.find(n => n.id === shareNoteId)?.title || null}
          onClose={handleCloseShare}
        />
      )}
    </div>
  )
}
