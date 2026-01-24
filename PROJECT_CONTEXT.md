# Project Context for AI Agents

This document provides context for AI agents working on the Felix Notes codebase. It explains the architecture, patterns, and conventions used throughout the project.

## Overview

Felix Notes is a note-taking application built as a Google Keep alternative. It's a local-first Progressive Web App (PWA) that syncs to Supabase when online. The app supports multiple note types, tagging, image attachments, sharing, and works offline.

**Key characteristics:**
- Local-first: All data operations happen on IndexedDB first, then sync to server
- Offline-capable: Full functionality without internet connection
- Real-time sync: Uses Supabase Realtime for cross-device updates
- Cross-platform: Web, iOS, and Android via Capacitor

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
│   ├── images/          # ImageGallery, ImageViewer
│   ├── import/          # GoogleKeepImport
│   ├── notes/           # NoteCard, NoteEditor, TextEditor, ListEditor, MarkdownEditor
│   ├── sharing/         # ShareModal
│   ├── tags/            # TagBadge, TagFilter, TagPicker, TagManager
│   ├── SettingsModal.tsx  # Theme, layout, tags, import, password, logout
│   └── SyncStatus.tsx
│
├── hooks/               # Custom React hooks
│   └── useCapacitor.ts  # Native platform utilities (haptics, etc.)
│
├── pages/               # Page-level components
│   ├── AuthPage.tsx     # Login/signup
│   ├── NotesPage.tsx    # Main notes view
│   └── SharedNotePage.tsx # Public shared note view
│
├── services/            # Business logic (no React)
│   ├── db.ts            # Dexie.js setup, LocalNote/LocalTag types
│   ├── googleKeepImport.ts # Google Keep ZIP parser
│   ├── imageProcessor.ts # Image compression/WebP conversion
│   ├── share.ts         # Share link generation
│   ├── supabase.ts      # Supabase client instance
│   └── sync.ts          # Sync queue processing, conflict resolution
│
├── stores/              # Zustand state stores
│   ├── authStore.ts     # User authentication state
│   ├── imageStore.ts    # Note images state
│   ├── noteStore.ts     # Notes CRUD, trash, filters
│   ├── preferencesStore.ts # Theme, layout preferences
│   ├── shareStore.ts    # Share links state
│   ├── syncStore.ts     # Sync status, online/offline
│   └── tagStore.ts      # Tags and note-tag relationships
│
├── types/               # TypeScript type definitions
│   └── index.ts         # Note, Tag, NoteTag, etc.
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
- Filters: archived, trash, search, tags
- `deleteNoteIfEmpty()` - Auto-cleanup empty notes

### `src/stores/preferencesStore.ts`
User preferences with persistence:
- Theme: 'light' | 'dark' | 'system'
- Layout: notes per row (1, 2, or 3)
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
- Tracks `lastSavedContentRef` to prevent content prop from resetting local state

### `src/components/notes/MarkdownEditor.tsx`
TipTap-based rich text editor:
- Toolbar with formatting buttons
- Image drag & drop and paste handling
- Exposes `insertImage()` via ref

## Database Schema

### Local (IndexedDB via Dexie)

```typescript
// Notes with sync metadata
interface LocalNote extends Note {
  _syncStatus: 'synced' | 'pending' | 'conflict'
  _localUpdatedAt: string
  _serverUpdatedAt?: string
}

// Sync queue
interface PendingChange {
  id: string
  entityType: 'note' | 'tag' | 'noteTag'
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
notes (id, owner_id, title, content, note_type, is_pinned, is_archived, version, created_at, updated_at)
tags (id, owner_id, name, color, created_at)
note_tags (note_id, tag_id)
note_images (id, note_id, storage_path, filename, size, width, height, created_at)
note_shares (id, note_id, token, permission, created_at, expires_at)
profiles (id, email, display_name, created_at)
```

**Note:** `is_deleted` and `deleted_at` are local-only fields for trash functionality. They are stripped before syncing to Supabase.

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
4. `ImageGallery` - Display attached images

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
