# Project Context for AI Agents

This document provides context for AI agents working on the FlexNotes codebase. It explains the architecture, patterns, and conventions used throughout the project.

## Overview

FlexNotes is a note-taking application built as a Google Keep alternative. It's a local-first Progressive Web App (PWA) that syncs to Supabase when online. The app supports multiple note types, dual organization (tags and folders), image attachments, sharing, and works offline.

**Key characteristics:**
- Local-first: All data operations happen on IndexedDB first, then sync to server
- Offline-capable: Full functionality without internet connection
- Real-time sync: Uses Supabase Realtime for cross-device updates
- Cross-platform: Web, iOS, and Android via Capacitor
- Dual organization: Tags (list view) and folders (folder view) as separate systems

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI Framework | React 19 | Component-based UI |
| Language | TypeScript | Type safety |
| Build Tool | Vite | Fast dev server and bundling |
| Styling | Tailwind CSS | Utility-first CSS with dark mode |
| State | Zustand | Lightweight state management |
| Rich Text | TipTap | ProseMirror-based WYSIWYG editor |
| Local DB | Dexie.js | IndexedDB wrapper |
| Backend | Supabase | Auth, PostgreSQL, Storage, Realtime |
| Mobile | Capacitor | Native iOS/Android wrapper |
| PWA | Workbox | Service worker and caching |

## Architecture

### Data Flow

```
User Action → Zustand Store → IndexedDB (Dexie) → Queue Change → Sync to Supabase
                                                         ↑
Supabase Realtime ← Server Change ← Other Device ────────┘
```

1. **User performs action** (e.g., creates note)
2. **Store updates UI state** optimistically
3. **Dexie saves to IndexedDB** with `_syncStatus: 'pending'`
4. **Change queued** in `pendingChanges` table
5. **Sync service** processes queue when online
6. **Supabase Realtime** notifies other devices of changes

### State Management Pattern

Each entity has a Zustand store that follows this pattern:

```typescript
// stores/exampleStore.ts
export const useExampleStore = create<ExampleState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  // Load from IndexedDB first (instant)
  loadFromLocal: async () => { ... },

  // Then sync from server (background)
  syncFromServer: async () => { ... },

  // Combined fetch
  fetchItems: async () => {
    await get().loadFromLocal()
    await get().syncFromServer()
  },

  // Create with optimistic update
  createItem: async (data) => {
    // 1. Generate local ID
    // 2. Save to IndexedDB with _syncStatus: 'pending'
    // 3. Queue change for sync
    // 4. Update UI state
    // 5. Trigger sync if online
  },

  // Update with optimistic update
  updateItem: async (id, updates) => {
    // 1. Optimistic UI update
    // 2. Update IndexedDB
    // 3. Queue change
    // 4. Sync
  },
}))
```

## File Structure

```
src/
├── components/           # React components
│   ├── folders/         # FolderTreeView, FolderPicker, FolderBadge, FolderManager
│   ├── images/          # ImageGallery, ImageViewer
│   ├── import/          # GoogleKeepImport
│   ├── notes/           # NoteCard, NoteEditor, NoteEditorPane, TextEditor, ListEditor, MarkdownEditor
│   ├── sharing/         # ShareModal
│   ├── tags/            # TagBadge, TagFilter, TagPicker, TagManager
│   ├── ui/              # Reusable UI (ConfirmDialog, DropdownMenu, ViewSwitcher)
│   ├── SettingsModal.tsx  # Theme, layout, tags, folders, import, password, logout
│   └── SyncStatus.tsx
│
├── hooks/               # Custom React hooks
│   ├── useCapacitor.ts  # Native platform utilities (haptics, etc.)
│   ├── useImageUpload.ts # Image upload handling with drag & drop
│   └── usePullToRefresh.ts # Pull-to-refresh gesture for mobile
│
├── pages/               # Page-level components
│   ├── AuthPage.tsx     # Login/signup
│   ├── NotesPage.tsx    # Main notes view with list/folder modes, shared view tabs
│   └── SharedNotePage.tsx # Public shared note view, auto-saves to "shared with me"
│
├── services/            # Business logic (no React)
│   ├── db.ts            # Dexie.js setup, LocalNote/LocalTag/LocalFolder types
│   ├── googleKeepImport.ts # Google Keep ZIP parser
│   ├── imageProcessor.ts # Image compression/WebP conversion
│   ├── share.ts         # Share link generation, "shared with me" tracking
│   ├── supabase.ts      # Supabase client instance
│   └── sync.ts          # Sync queue processing, conflict resolution
│
├── stores/              # Zustand state stores
│   ├── authStore.ts     # User authentication (email/password, Google SSO)
│   ├── folderStore.ts   # Folders CRUD, hierarchy navigation
│   ├── imageStore.ts    # Note images state
│   ├── noteStore.ts     # Notes CRUD, trash, filters, folder assignment
│   ├── preferencesStore.ts # Theme, layout, view mode preferences
│   ├── shareStore.ts    # Share links state
│   ├── syncStore.ts     # Sync status, online/offline, visibility-based sync
│   └── tagStore.ts      # Tags CRUD, reordering, note-tag relationships
│
├── types/               # TypeScript type definitions
│   └── index.ts         # Note, Tag, NoteTag, Folder, etc.
│
├── utils/               # Utility functions
│   └── formatters.ts    # Date formatting, content preview generation
│
├── App.tsx              # Router setup
├── main.tsx             # Entry point
└── index.css            # Tailwind + custom styles
```

## Key Files Explained

### `src/services/db.ts`
Dexie.js database setup. Defines:
- `LocalNote`, `LocalTag`, `LocalNoteTag` types (with sync metadata)
- `PendingChange` type for sync queue
- Database schema and migrations
- Helper functions: `generateLocalId()`, `getCurrentTimestamp()`

### `src/services/sync.ts`
Handles syncing between local and server:
- `queueChange()` - Add operation to sync queue
- `processPendingChanges()` - Push local changes to server
- `fullSync()` / `incrementalSync()` - Pull changes from server
- `resolveConflict()` - Handle version conflicts
- Handles edge case where note exists locally but not on server (creates instead of updates)

### `src/services/googleKeepImport.ts`
Parses Google Keep Takeout exports:
- `parseGoogleKeepZip()` - Extracts and parses notes from ZIP
- `parseKeepJSON()` - Parses current JSON format with `textContent`, `listContent`, `labels`
- `parseKeepHTML()` - Parses legacy HTML format
- `convertImportedNote()` - Converts to app's note format, preserving list items

### `src/stores/noteStore.ts`
Main note operations:
- CRUD operations with optimistic updates
- Trash/restore/permanent delete
- Filters: archived, trash, shared, search, tags
- `deleteNoteIfEmpty()` - Auto-cleanup empty notes
- `duplicateNote()` - Create a copy of a note with its content and tags
- `reorderNotes()` - Drag-and-drop reordering with sort_order persistence
- `moveNoteToFolder()` - Move note to a folder or root
- `getNotesInFolder()` - Get notes in a specific folder (or root)
- Pagination: `getPaginatedNotes()`, `loadMoreNotes()`, `hasMoreNotes()`
- Shared view: `sharedTab` ('by_me' | 'with_me'), `sharedWithMeNotes`, `fetchSharedWithMeNotes()`
- `setSharedTab()` - Switch between "Shared by me" and "Shared with me" tabs

### `src/stores/folderStore.ts`
Folder management:
- CRUD operations for folders with optimistic updates
- Hierarchical support via `parent_folder_id`
- `selectedFolderId` - Currently viewed folder in folder view
- `getChildFolders()` - Get subfolders of a folder
- `getFolderPath()` - Get breadcrumb path to a folder
- Syncs to Supabase with realtime updates

### `src/stores/preferencesStore.ts`
User preferences with persistence:
- Theme: 'light' | 'dark' | 'system'
- Layout: notes per row (1, 2, or 3)
- View mode: 'list' | 'folder'
- `lastOpenedNoteId` - Remembers the note open in modal (restored on page load)
- `lastFolderViewNoteId` - Remembers the note selected in folder view pane (desktop)
- Persisted to localStorage
- `applyTheme()` updates document class

### `src/components/notes/NoteEditor.tsx`
Modal for editing a note:
- Title input
- Tag picker
- Type switcher (text/list/markdown)
- Image upload/gallery
- Auto-save on changes (500ms debounce)
- Tracks `lastNoteId` to prevent sync from overwriting local edits

### `src/components/notes/ListEditor.tsx`
List/checklist editor with mobile-friendly interactions:
- Touch and mouse drag support for reordering
- Swipe gestures for indentation changes
- Uses refs (`itemsRef`, `dragStateRef`, `dropTargetRef`) to avoid stale closures
- Direction detection: first 10px of movement determines vertical vs horizontal mode
- Hierarchical drag: moving a parent moves all children
- Hierarchical checkbox: checking a parent checks all children via `toggleChecked()`
- Multi-line support: textarea input with Shift+Enter (desktop) or newline button (mobile)
- Tracks `lastSavedContentRef` to prevent content prop from resetting local state
- Bulk actions: "Uncheck all" and "Clear completed" with confirmation dialogs via `useConfirm()`
- Text splitting: Enter key splits text at cursor position, moving text after cursor to new item via `splitItem()`
- Item merging: Backspace at start of item merges with previous via `mergeWithPreviousItem()`
- Full arrow key navigation: All four arrow keys navigate between unchecked items when cursor is at text boundaries
- Drop indicator: Only shows for unchecked items, uses index within unchecked array for accurate positioning

### `src/components/notes/MarkdownEditor.tsx`
TipTap-based rich text editor:
- Toolbar with formatting buttons
- Image drag & drop and paste handling
- Exposes `insertImage()` via ref

### `src/components/ui/ConfirmDialog.tsx`
Context-based confirmation dialog system:
- `ConfirmProvider` wraps app to provide `useConfirm()` hook
- `useConfirm()` returns async function that resolves to boolean
- Supports variants: 'danger' (red), 'warning' (yellow), 'default' (primary)
- Customizable title, message, and button text
- Replaces browser's `window.confirm()` with themed dialogs

### `src/components/tags/TagManager.tsx`
Tag management in settings:
- Drag-to-reorder tags using dnd-kit
- Edit tag name and color
- Custom color picker with presets and color wheel
- `getTagColor()` generates consistent color from tag name when no color set

### `src/components/folders/FolderTreeView.tsx`
Tree-based file browser for folder view:
- Hierarchical display of folders and notes
- Expandable/collapsible folders
- Drag-drop notes onto folders to move them
- Context menus for folders (new note, new subfolder, delete)
- Context menus for notes (pin/unpin, share, move, archive, delete)
- Search filtering across all notes
- Selected note highlighting

### `src/components/notes/NoteEditorPane.tsx`
Inline note editor for split-pane layout (desktop folder view):
- Similar to NoteEditor but without modal wrapper
- Displays empty state when no note selected
- `hideTags` prop to hide tag management in folder view
- Auto-save with debouncing

### `src/components/ui/ViewSwitcher.tsx`
Dropdown menu for view switching:
- Switch between list view and folder view
- Access archive, trash, and shared views
- Trash count and shared count badges shown in dropdown
- Uses portal-based DropdownMenu for proper positioning

## Database Schema

### Local (IndexedDB via Dexie)

```typescript
// Notes with sync metadata
interface LocalNote extends Note {
  _syncStatus: 'synced' | 'pending' | 'conflict'
  _localUpdatedAt: string
  _serverUpdatedAt?: string
}

// Folders with sync metadata
interface LocalFolder extends Folder {
  _syncStatus: 'synced' | 'pending' | 'conflict'
  _localUpdatedAt: string
  _serverUpdatedAt?: string
}

// Sync queue
interface PendingChange {
  id: string
  entityType: 'note' | 'tag' | 'noteTag' | 'folder'
  entityId: string
  operation: 'create' | 'update' | 'delete'
  data?: Record<string, unknown>
  timestamp: string
  retryCount: number
}
```

### Server (Supabase PostgreSQL)

```sql
-- Main tables
notes (id, owner_id, title, content, note_type, is_pinned, is_archived, folder_id, sort_order, version, created_at, updated_at)
folders (id, owner_id, name, color, parent_folder_id, sort_order, created_at, updated_at)
tags (id, owner_id, name, color, sort_order, created_at)
note_tags (note_id, tag_id)
note_images (id, note_id, storage_path, filename, size, width, height, created_at)
note_shares (id, note_id, share_token, permission, created_at, expires_at)
saved_shares (id, user_id, share_token, note_id, saved_at)  -- Tracks "shared with me" notes
profiles (id, email, display_name, created_at)
```

**Note:** `is_deleted` and `deleted_at` are local-only fields for trash functionality. They are stripped before syncing to Supabase. The `sort_order` field uses negative timestamps for default ordering (newest first) and supports fractional values for inserting between notes. Tag `sort_order` is local-only for custom tag ordering in the UI.

## Patterns & Conventions

### Optimistic Updates
All mutations update UI immediately, then persist:
```typescript
// 1. Update UI state
set(state => ({ items: [...state.items, newItem] }))

// 2. Persist to IndexedDB
await db.items.add(newItem)

// 3. Queue for sync
await queueChange('item', id, 'create')
```

### Dark Mode
Uses Tailwind's class-based dark mode:
```tsx
<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
```
Theme is applied by adding/removing `dark` class on `<html>`.

### Modal Dismissal
All modals support:
- ESC key to close
- Click outside (backdrop) to close
- Nested modals close innermost first

### Local-Only Fields
Fields prefixed with `_` or specific fields like `is_deleted` are local-only:
```typescript
const { _syncStatus, _localUpdatedAt, is_deleted, deleted_at, ...serverData } = localNote
```

### ID Generation
Local IDs use UUID v4 via `crypto.randomUUID()` with a fallback for non-HTTPS contexts:
```typescript
export function generateLocalId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for HTTP (e.g., local network testing)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ...)
}
```

### Avoiding Stale Closures in Event Handlers
When attaching event handlers to `document` (e.g., for drag/drop), use refs to access current state:
```typescript
const itemsRef = useRef(items)
useEffect(() => { itemsRef.current = items }, [items])

// In event handler attached to document:
const currentItems = itemsRef.current // Always current
```

## Common Tasks

### Adding a New Feature to Notes

1. Update `types/index.ts` if new fields needed
2. Update `services/db.ts` schema (increment version, add migration)
3. Update `stores/noteStore.ts` with new actions
4. Update `services/sync.ts` if field syncs to server (or strip if local-only)
5. Update UI components

### Adding a New Store

1. Create `stores/newStore.ts` following the pattern
2. Include `loadFromLocal()` and `syncFromServer()` if data syncs
3. Use optimistic updates for mutations
4. Queue changes via `queueChange()` for sync

### Adding Dark Mode to a Component

Add `dark:` variants for all color classes:
```tsx
// Before
<div className="bg-white text-gray-900 border-gray-200">

// After
<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700">
```

### Handling Images

Images flow through:
1. `imageProcessor.ts` - Compression, WebP conversion, dimension extraction
2. `imageStore.ts` - Upload to Supabase Storage, track in `note_images`
3. `MarkdownEditor` - Insert at cursor position via `insertImage()`
4. `ImageGallery` - Display attached images (text notes only, not markdown)

Image cleanup:
- `cleanupOrphanedImages()` - Deletes images from storage that are no longer referenced in markdown content
- Called when converting from markdown to other types to remove deleted images
- `isNoteEmpty()` checks for attached images before deleting empty notes

## Testing Locally

```bash
npm run dev          # Start dev server at localhost:5173
npm run build        # Production build
npm run preview      # Preview production build
```

### Testing on Mobile via Local Network

To test on a phone connected to the same WiFi:

```bash
npm run dev -- --host
```

This exposes the dev server on your local IP (e.g., `http://192.168.0.120:5173`). Note that `crypto.randomUUID()` won't work over HTTP, but the app has a fallback.

## Environment Variables

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## Key Dependencies

- `@tiptap/react` - Rich text editor
- `@tiptap/extension-code-block-lowlight` - Syntax highlighting for code blocks
- `lowlight` - Syntax highlighting engine
- `@dnd-kit/core`, `@dnd-kit/sortable` - Drag-and-drop for note reordering
- `dexie` - IndexedDB wrapper
- `zustand` - State management
- `@supabase/supabase-js` - Backend client
- `jszip` - ZIP file handling for imports
- `lucide-react` - Icons

## Gotchas

1. **Sync fields**: Never send `_syncStatus`, `_localUpdatedAt`, `is_deleted`, `deleted_at` to Supabase
2. **TipTap drops**: Use `editorProps.handleDrop`, not React `onDrop` (TipTap intercepts events)
3. **Theme persistence**: Theme is read from localStorage before React hydrates to prevent flash
4. **Empty notes**: Auto-deleted on close - check `isNoteEmpty()` in noteStore. Deletion also syncs to server if note was previously synced.
5. **Trash**: Local-only feature. Trashed notes are deleted from server immediately
6. **Sync race conditions**: NoteEditor and ListEditor track their own state to prevent `loadFromLocal()` from overwriting user edits during sync
7. **crypto.randomUUID**: Only available in secure contexts (HTTPS/localhost). Use `generateLocalId()` which has a fallback.
8. **Touch events on mobile**: HTML5 drag API doesn't work on mobile. Use manual touch handlers with `touchstart`, `touchmove`, `touchend`.
9. **Stale closures**: Event handlers attached to `document` capture variables at attachment time. Use refs to access current state.
10. **Google Keep import**: Modern exports use JSON format, not HTML. The importer handles both.
11. **Mobile drag-to-reorder**: On mobile, `touch-action: none` is required for dragging but blocks scrolling. Solution: use a "reorder mode" toggle that only enables drag when explicitly activated. The button is hidden on desktop (`sm:hidden`) where dragging works without conflicts.
12. **Share links for anonymous users**: RLS blocks anonymous queries to `note_shares`. Use the `get_shared_note_with_permission()` database function with `SECURITY DEFINER` to bypass RLS for share lookups.
13. **Tag sort_order**: Tag ordering is local-only. The `sort_order` field is preserved during sync from server to maintain user's custom order.
14. **Confirmation dialogs**: Use `useConfirm()` hook instead of `window.confirm()`. Must be used within `ConfirmProvider`.
15. **Multi-line list items**: ListEditor uses `<textarea>` instead of `<input>` to support newlines. Enter creates new item, Shift+Enter adds newline (desktop), newline button for mobile.
16. **Hierarchical checkbox**: When checking a parent list item, use `toggleChecked()` which calls `getItemWithChildren()` to find and check all descendants.
17. **Folder view vs List view**: Tags and folders are separate organization systems. Tags are hidden in folder view, folders are hidden in list view. View mode is persisted in preferences.
18. **Folder deletion**: When a folder is deleted, its notes are moved to the parent folder (or root if no parent). Subfolders are also moved to the parent.
19. **Split-pane layout**: Folder view uses split-pane on desktop (tree left, editor right) but opens notes in modal on mobile. Width is resizable via drag.
20. **DropdownMenu positioning**: Uses React Portal to render at document body level, avoiding overflow issues in scrollable containers. Auto-detects space above/below to position optimally.
21. **Remember last opened note**: `lastOpenedNoteId` and `lastFolderViewNoteId` in preferencesStore persist the currently open note. On page load, these are restored after notes are fetched, using `hasRestoredRef` to prevent duplicate restoration.
22. **Note card preview for lists**: `getContentPreview()` in formatters.ts filters out checked items for list notes, showing only unchecked items in the card preview.
23. **Pin from note cards**: Pin/unpin is available in the note card dropdown menu (both list view and folder view), not in the note editor header. This keeps the editor UI cleaner.
24. **Shared with me**: When a logged-in user views a shared note (not their own), it's automatically saved to `saved_shares` table. The SharedNotePage handles this auto-save on load.
25. **Shared view tabs**: The shared view has two tabs - "Shared with me" (notes others shared) and "Shared by me" (notes I've shared). These use different data sources: `sharedWithMeNotes` from saved_shares vs `sharedNoteIds` from note_shares.
26. **List editor text splitting**: `splitItem()` handles Enter key by splitting text at cursor position atomically - it updates the current item's text AND creates a new item with the remaining text in a single state update to avoid stale closure issues.
27. **List editor merging**: `mergeWithPreviousItem()` handles Backspace at start of item by combining text with the previous unchecked item, placing cursor at the merge point.
28. **List editor arrow navigation**: All four arrow keys navigate between items when cursor is at the boundary (start for ArrowUp/ArrowLeft, end for ArrowDown/ArrowRight) and only navigate to unchecked items.
29. **Duplicate note**: `duplicateNote()` creates a copy with "(Copy)" suffix, copies content/type/folder/tags, but NOT pinned status, archived status, or share links. Available from note card context menu.
30. **List editor drop indicator**: Uses indices within the unchecked items array only, not the full items array. This prevents the indicator from appearing incorrectly when cursor is over checked items.
