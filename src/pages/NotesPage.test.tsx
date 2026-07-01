import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Note } from '@/types'

/**
 * NotesPage is a page-level orchestrator wired to six Zustand stores, several
 * custom hooks, providers and a router. To unit test it we mock that boundary
 * here and drive the page through controllable state, asserting on observable
 * behavior (headings, prop-driven child stubs, spy calls). This is the safety
 * net for decomposing NotesPage into smaller pieces.
 */

// Mutable mock state, hoisted so the vi.mock factories below can read it.
const h = vi.hoisted(() => {
  const note = {
    notes: [] as Note[],
    loading: false,
    sharedNoteIds: new Set<string>(),
    sharedWithMeNotes: [] as unknown[],
    sharedWithMeLoading: false,
    fetchNotes: vi.fn(),
    createNote: vi.fn(async () => null),
    updateNote: vi.fn(),
    trashNote: vi.fn(),
    restoreNote: vi.fn(),
    permanentlyDeleteNote: vi.fn(),
    emptyTrash: vi.fn(),
    duplicateNote: vi.fn(),
    fetchSharedNoteIds: vi.fn(),
    fetchSharedWithMeNotes: vi.fn(),
    removeSharedWithMeNote: vi.fn(),
    moveNoteToFolder: vi.fn(),
    getTrashCount: vi.fn(() => 0),
    getNotesInFolder: vi.fn(() => [] as Note[]),
  }
  const ui = {
    activeNoteId: null as string | null,
    showArchived: false,
    showTrash: false,
    showShared: false,
    sharedTab: 'with_me' as 'with_me' | 'by_me',
    searchQuery: '',
    selectedTagIds: [] as string[],
    displayLimit: 20,
    setActiveNote: vi.fn(),
    setShowArchived: vi.fn(),
    setShowTrash: vi.fn(),
    setShowShared: vi.fn(),
    setSharedTab: vi.fn(),
    setSearchQuery: vi.fn(),
    loadMoreNotes: vi.fn(),
    getPaginatedNotes: vi.fn((notes: Note[]) => notes),
    hasMoreNotes: vi.fn(() => false),
  }
  const tag = {
    tags: [] as unknown[],
    fetchTags: vi.fn(),
    fetchNoteTags: vi.fn(),
    getTagsForNote: vi.fn(() => []),
    addTagToNote: vi.fn(),
  }
  const sync = {
    subscribeToChanges: vi.fn(() => () => {}),
    refreshPendingCount: vi.fn(),
    sync: vi.fn(),
  }
  const prefs = {
    notesPerRow: 2 as 1 | 2 | 3,
    viewMode: 'list' as 'list' | 'folder',
    setViewMode: vi.fn(),
  }
  const folder = {
    selectedFolderId: null as string | null,
    fetchFolders: vi.fn(),
    getFolderById: vi.fn(() => undefined),
  }
  const confirmFn = vi.fn(async () => true)
  const toastFn = vi.fn()
  return { note, ui, tag, sync, prefs, folder, confirmFn, toastFn }
})

vi.mock('@/stores/noteStore', () => ({
  useNoteStore: Object.assign(() => h.note, { getState: () => h.note }),
}))
vi.mock('@/stores/noteUIStore', () => ({ useNoteUIStore: () => h.ui }))
vi.mock('@/stores/tagStore', () => ({ useTagStore: () => h.tag }))
vi.mock('@/stores/syncStore', () => ({ useSyncStore: () => h.sync }))
vi.mock('@/stores/preferencesStore', () => ({ usePreferencesStore: () => h.prefs }))
vi.mock('@/stores/folderStore', () => ({
  useFolderStore: Object.assign(() => h.folder, { getState: () => h.folder }),
}))
vi.mock('@/components/ui/ConfirmDialog', () => ({ useConfirm: () => h.confirmFn }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => h.toastFn }))
vi.mock('@/hooks/useCapacitor', () => ({ hapticLight: vi.fn() }))
vi.mock('@/hooks/useNoteEditorLifecycle', () => ({
  useNoteEditorLifecycle: () => ({
    modalStackRef: { current: [] },
    editorFlushSaveRef: { current: null },
    editorDirtyRef: { current: false },
    paneFlushSaveRef: { current: null },
    paneDirtyRef: { current: false },
    openModal: vi.fn(),
    closeModalNormally: vi.fn(),
    handleCloseEditor: vi.fn(),
  }),
}))
vi.mock('@/hooks/useNoteDragAndDrop', () => ({
  useNoteDragAndDrop: () => ({
    sensors: [],
    draggingNoteId: null,
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
    handleDragCancel: vi.fn(),
  }),
}))
vi.mock('@/hooks/usePullToRefresh', () => ({
  usePullToRefresh: () => ({ pullDistance: 0, isRefreshing: false, containerRef: { current: null } }),
}))
vi.mock('@/hooks/useResizableSidebar', () => ({
  useResizableSidebar: () => ({ width: 320, handleResizeStart: vi.fn() }),
}))
vi.mock('@/hooks/useNoteFromUrl', () => ({
  useNoteFromUrl: () => ({ noteIdFromUrl: null, setNoteInUrl: vi.fn(), clearNoteFromUrl: vi.fn() }),
}))
vi.mock('@/hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }))
vi.mock('@/services/share', () => ({ removeSavedShare: vi.fn(async () => ({})) }))

// Heavy children -> identifiable, prop-driven stubs.
vi.mock('@/components/notes/NoteGrid', () => ({
  NoteGrid: ({ pinnedNotes, unpinnedNotes, onDelete, onOpenNote }: {
    pinnedNotes: Note[]; unpinnedNotes: Note[]; onDelete: (id: string) => void; onOpenNote: (id: string) => void
  }) => (
    <div data-testid="note-grid">
      {[...pinnedNotes, ...unpinnedNotes].map((n) => (
        <div key={n.id}>
          <span>{n.title}</span>
          <button onClick={() => onOpenNote(n.id)}>open-{n.id}</button>
          <button onClick={() => onDelete(n.id)}>delete-{n.id}</button>
        </div>
      ))}
    </div>
  ),
}))
vi.mock('@/components/notes/SharedWithMeView', () => ({ SharedWithMeView: () => <div data-testid="shared-with-me" /> }))
vi.mock('@/components/folders/FolderTreeView', () => ({ FolderTreeView: () => <div data-testid="folder-tree" /> }))
vi.mock('@/components/notes/NoteEditorPane', () => ({ NoteEditorPane: () => <div data-testid="editor-pane" /> }))
vi.mock('@/components/notes/NoteEditor', () => ({ NoteEditor: () => <div data-testid="note-editor" /> }))
vi.mock('@/components/SettingsModal', () => ({ SettingsModal: () => <div data-testid="settings-modal" /> }))
vi.mock('@/components/sharing/ShareModal', () => ({ ShareModal: () => <div data-testid="share-modal" /> }))
vi.mock('@/components/folders/FolderPicker', () => ({ FolderPicker: () => <div data-testid="folder-picker" /> }))
vi.mock('@/components/folders/FolderManager', () => ({ FolderManager: () => <div data-testid="folder-manager" /> }))
vi.mock('@/components/ui/ViewSwitcher', () => ({ ViewSwitcher: () => <div data-testid="view-switcher" /> }))
vi.mock('@/components/tags/TagFilter', () => ({ TagFilter: () => <div data-testid="tag-filter" /> }))
vi.mock('@/components/SyncStatus', () => ({ SyncStatus: () => <div data-testid="sync-status" /> }))

// Import NotesPage AFTER the mocks are declared.
import { NotesPage } from './NotesPage'

const makeNote = (over: Partial<Note>): Note => ({
  id: 'n1', owner_id: 'u1', title: 'Note', content: '', note_type: 'text',
  is_pinned: false, is_archived: false, is_deleted: false, deleted_at: null,
  folder_id: null, created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z', version: 1, sort_order: 0, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  h.note.notes = []
  h.note.loading = false
  h.note.sharedNoteIds = new Set()
  h.note.sharedWithMeNotes = []
  h.note.getTrashCount.mockReturnValue(0)
  h.note.getNotesInFolder.mockReturnValue([])
  h.note.createNote.mockResolvedValue(null)
  h.ui.activeNoteId = null
  h.ui.showArchived = false
  h.ui.showTrash = false
  h.ui.showShared = false
  h.ui.sharedTab = 'with_me'
  h.ui.searchQuery = ''
  h.ui.selectedTagIds = []
  h.ui.getPaginatedNotes.mockImplementation((notes: Note[]) => notes)
  h.ui.hasMoreNotes.mockReturnValue(false)
  h.prefs.viewMode = 'list'
  h.prefs.notesPerRow = 2
  h.folder.selectedFolderId = null
  h.sync.subscribeToChanges.mockReturnValue(() => {})
  h.confirmFn.mockResolvedValue(true)
})

describe('NotesPage', () => {
  it('renders the "Notes" header and note titles in list view', () => {
    h.note.notes = [makeNote({ id: 'a', title: 'First' }), makeNote({ id: 'b', title: 'Second' })]
    render(<NotesPage />)
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument()
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  it('shows the view-specific header title for trash/archive/shared', () => {
    h.ui.showTrash = true
    const { unmount } = render(<NotesPage />)
    expect(screen.getByRole('heading', { name: 'Trash' })).toBeInTheDocument()
    unmount()

    h.ui.showTrash = false
    h.ui.showArchived = true
    const { unmount: u2 } = render(<NotesPage />)
    expect(screen.getByRole('heading', { name: 'Archive' })).toBeInTheDocument()
    u2()

    h.ui.showArchived = false
    h.ui.showShared = true
    render(<NotesPage />)
    expect(screen.getByRole('heading', { name: 'Shared' })).toBeInTheDocument()
  })

  it('creates a note when the floating action button is clicked', () => {
    render(<NotesPage />)
    fireEvent.click(screen.getByTitle('Create new note'))
    expect(h.note.createNote).toHaveBeenCalledWith({ folder_id: null })
  })

  it('trashes a note and shows an undo toast when a card is deleted', () => {
    h.note.notes = [makeNote({ id: 'a', title: 'First' })]
    render(<NotesPage />)
    fireEvent.click(screen.getByText('delete-a'))
    expect(h.note.trashNote).toHaveBeenCalledWith('a')
    expect(h.toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('trash') })
    )
  })

  it('opens a note via the card open action', () => {
    h.note.notes = [makeNote({ id: 'a', title: 'First' })]
    render(<NotesPage />)
    fireEvent.click(screen.getByText('open-a'))
    expect(h.ui.setActiveNote).toHaveBeenCalledWith('a')
  })

  it('empties the trash after confirmation', async () => {
    h.ui.showTrash = true
    h.note.getTrashCount.mockReturnValue(3)
    h.note.notes = [makeNote({ id: 'a', title: 'Trashed', is_deleted: true })]
    render(<NotesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }))
    await waitFor(() => expect(h.note.emptyTrash).toHaveBeenCalled())
  })

  it('shows the empty-state message when there are no notes', () => {
    render(<NotesPage />)
    expect(screen.getByText('No notes yet')).toBeInTheDocument()
  })

  it('renders the folder tree in folder view', () => {
    h.prefs.viewMode = 'folder'
    render(<NotesPage />)
    expect(screen.getByTestId('folder-tree')).toBeInTheDocument()
  })
})
