import { useEffect, useCallback, useState, useRef } from 'react'
import { Plus, Search, Archive, Trash2, Settings, Trash } from 'lucide-react'
import { hapticLight } from '@/hooks/useCapacitor'
import { useNoteStore } from '@/stores/noteStore'
import { useTagStore } from '@/stores/tagStore'
import { useSyncStore } from '@/stores/syncStore'
import { usePreferencesStore } from '@/stores/preferencesStore'
import { NoteCard } from '@/components/notes/NoteCard'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { TagFilter } from '@/components/tags/TagFilter'
import { SyncStatus } from '@/components/SyncStatus'
import { SettingsModal } from '@/components/SettingsModal'

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
    getFilteredNotes,
    getTrashCount,
    deleteNoteIfEmpty,
  } = useNoteStore()

  const { tags, fetchTags, fetchNoteTags, getTagsForNote } = useTagStore()
  const { subscribeToChanges, refreshPendingCount } = useSyncStore()
  const { notesPerRow } = usePreferencesStore()

  const [showSettings, setShowSettings] = useState(false)

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

  const filteredNotes = getFilteredNotes()
  const pinnedNotes = filteredNotes.filter(n => n.is_pinned && !showTrash)
  const unpinnedNotes = filteredNotes.filter(n => !n.is_pinned || showTrash)
  const trashCount = getTrashCount()

  const handleCreateNote = useCallback(async () => {
    hapticLight()
    const note = await createNote()
    if (note) {
      openModal('note')
    }
  }, [createNote, openModal])

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

  const handlePermanentDelete = useCallback((noteId: string) => {
    if (window.confirm('Permanently delete this note? This cannot be undone.')) {
      hapticLight()
      permanentlyDeleteNote(noteId)
    }
  }, [permanentlyDeleteNote])

  const handleEmptyTrash = useCallback(() => {
    if (window.confirm(`Permanently delete all ${trashCount} notes in trash? This cannot be undone.`)) {
      hapticLight()
      emptyTrash()
    }
  }, [emptyTrash, trashCount])

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

  // Grid classes based on notesPerRow setting (respects setting on all screen sizes)
  const gridClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
  }[notesPerRow]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
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
              className="w-full pl-9 pr-3 py-2 bg-gray-100 dark:bg-gray-700 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            />
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

        {loading && filteredNotes.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : filteredNotes.length === 0 ? (
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
          <div className="space-y-6">
            {/* Pinned notes */}
            {pinnedNotes.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Pinned
                </h2>
                <div className={`grid gap-3 ${gridClasses}`}>
                  {pinnedNotes.map(note => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      tags={getTagsForNote(note.id)}
                      onClick={() => handleOpenNote(note.id)}
                      onArchive={() => handleArchive(note.id, note.is_archived)}
                      onDelete={() => handleDelete(note.id)}
                    />
                  ))}
                </div>
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
                <div className={`grid gap-3 ${gridClasses}`}>
                  {unpinnedNotes.map(note => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      tags={getTagsForNote(note.id)}
                      onClick={() => !showTrash && handleOpenNote(note.id)}
                      onArchive={!showTrash ? () => handleArchive(note.id, note.is_archived) : undefined}
                      onDelete={showTrash ? () => handlePermanentDelete(note.id) : () => handleDelete(note.id)}
                      onRestore={showTrash ? () => handleRestore(note.id) : undefined}
                      showRestore={showTrash}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
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
    </div>
  )
}
