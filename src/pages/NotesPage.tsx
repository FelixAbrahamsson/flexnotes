import { useEffect } from 'react'
import { Plus, Search, Archive, LogOut } from 'lucide-react'
import { useNoteStore } from '@/stores/noteStore'
import { useAuthStore } from '@/stores/authStore'
import { useTagStore } from '@/stores/tagStore'
import { useSyncStore } from '@/stores/syncStore'
import { NoteCard } from '@/components/notes/NoteCard'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { TagFilter } from '@/components/tags/TagFilter'
import { SyncStatus } from '@/components/SyncStatus'

export function NotesPage() {
  const { user, signOut } = useAuthStore()
  const {
    loading,
    activeNoteId,
    showArchived,
    searchQuery,
    selectedTagIds,
    fetchNotes,
    createNote,
    setActiveNote,
    setShowArchived,
    setSearchQuery,
    getFilteredNotes,
  } = useNoteStore()

  const { tags, fetchTags, fetchNoteTags, getTagsForNote } = useTagStore()
  const { subscribeToChanges, refreshPendingCount } = useSyncStore()

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
  const pinnedNotes = filteredNotes.filter(n => n.is_pinned)
  const unpinnedNotes = filteredNotes.filter(n => !n.is_pinned)

  const handleCreateNote = async () => {
    await createNote()
  }

  const handleCloseEditor = () => {
    setActiveNote(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <h1 className="text-xl font-semibold text-gray-900 flex-shrink-0">Notes</h1>

          {/* Sync status */}
          <SyncStatus />

          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-100 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>

          {/* Archive toggle */}
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`btn btn-ghost p-2 ${showArchived ? 'bg-gray-200' : ''}`}
            title={showArchived ? 'Show active notes' : 'Show archived notes'}
          >
            <Archive className="w-5 h-5" />
          </button>

          {/* User menu */}
          <button
            onClick={signOut}
            className="btn btn-ghost p-2"
            title={`Sign out (${user?.email})`}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Tag filter */}
        {tags.length > 0 && (
          <div className="max-w-4xl mx-auto px-4 pb-3">
            <TagFilter />
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {loading && filteredNotes.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">
              {showArchived
                ? 'No archived notes'
                : searchQuery
                  ? 'No notes match your search'
                  : selectedTagIds.length > 0
                    ? 'No notes with selected tags'
                    : 'No notes yet'}
            </p>
            {!showArchived && !searchQuery && selectedTagIds.length === 0 && (
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
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Pinned
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {pinnedNotes.map(note => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      tags={getTagsForNote(note.id)}
                      onClick={() => setActiveNote(note.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Other notes */}
            {unpinnedNotes.length > 0 && (
              <section>
                {pinnedNotes.length > 0 && (
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Others
                  </h2>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {unpinnedNotes.map(note => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      tags={getTagsForNote(note.id)}
                      onClick={() => setActiveNote(note.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* Floating action button */}
      {!showArchived && (
        <button
          onClick={handleCreateNote}
          className="fixed bottom-6 right-6 w-14 h-14 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center justify-center"
          title="Create new note"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Note editor modal */}
      {activeNoteId && (
        <NoteEditor noteId={activeNoteId} onClose={handleCloseEditor} />
      )}
    </div>
  )
}
