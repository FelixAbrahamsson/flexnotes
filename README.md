# Felix Notes

A modern, cross-platform note-taking app with offline support and real-time sync. Built as a Google Keep alternative with additional features like markdown editing and shareable notes.

## Features

### Note Management
- **Multiple Note Types**: Plain text, checklists, and rich markdown with WYSIWYG editing and syntax-highlighted code blocks
- **Dual Organization Systems**: Tags (list view) and folders (folder view) for flexible organization
- **Tag Organization**: Create, edit, and reorder tags with custom colors (presets or color wheel)
- **Smart Tag Filtering**: New notes automatically get the currently filtered tags applied
- **Folder Organization**: Hierarchical folders with unlimited nesting, drag-drop notes into folders
- **Image Support**: Attach images via button, drag & drop, or paste with automatic compression
- **Pin & Archive**: Pin important notes from the note card menu, archive completed ones
- **Trash Bin**: Deleted notes go to trash with 30-day retention before permanent deletion
- **Quick Actions**: Pin, archive, delete, share, or move to folder directly from note card menus
- **Drag-to-Archive/Trash**: When dragging notes, drop zones appear to quickly archive or trash
- **Auto-Cleanup**: Empty notes are automatically deleted when closed
- **Search**: Full-text search works in both list and folder views
- **Drag-to-Reorder**: Drag notes to reorder them (desktop: drag directly, mobile: tap reorder button first)
- **Fullscreen Mode**: Expand notes to fullscreen on desktop for distraction-free editing
- **Infinite Scroll**: Notes load progressively as you scroll for better performance
- **Remember Last Note**: Automatically reopens the last viewed note when returning to the app

### Folder View
- **Tree-Based Browser**: File explorer-style navigation with folders and notes in a tree structure
- **Split-Pane Layout**: Desktop shows tree on left, editor on right; mobile opens notes fullscreen
- **Resizable Sidebar**: Drag to resize the folder tree panel width on desktop
- **Hierarchical Folders**: Create nested folders with subfolders
- **Drag-Drop Organization**: Drag notes onto folders to move them
- **Context Menus**: Right-click (or hamburger menu) on folders/notes for quick actions
- **Separate from Tags**: Folders and tags are independent - tags are hidden in folder view

### List Notes
- **Touch-Friendly Reordering**: Drag items up/down to reorder on mobile and desktop
- **Swipe to Indent**: Swipe left/right on the grip handle to change indentation
- **Hierarchical Drag**: Dragging a parent item moves all its children too
- **Hierarchical Checkbox**: Checking a parent item automatically checks all children
- **Multi-line Items**: Shift+Enter (desktop) or newline button (mobile) to add line breaks within items
- **Nested Lists**: Support for up to 5 levels of indentation
- **Smart Text Splitting**: Press Enter to split text at cursor - text after cursor moves to new item
- **Smart Merging**: Press Backspace at start of item to merge with previous item
- **Keyboard Navigation**: Arrow up/down to navigate between items (respects cursor position)
- **Keyboard Shortcuts**: Tab/Shift+Tab to indent, Enter to add/split item, Backspace to merge/delete
- **Bulk Actions**: "Uncheck all" to reset checkboxes, "Clear completed" to remove checked items
- **Smart Preview**: Note cards only show unchecked items in the preview

### Sync & Storage
- **Offline-First**: Works without internet, syncs when back online
- **Real-Time Sync**: Changes sync across devices instantly via Supabase Realtime
- **Visibility Sync**: App automatically syncs when you switch back to it
- **Pull-to-Refresh**: Pull down on mobile to manually trigger sync
- **Cross-Device Order**: Custom note ordering syncs across all your devices

### Sharing
- **Shareable Notes**: Generate links to share notes with read or write access
- **Shared with Me**: View notes others have shared with you in a dedicated tab
- **Shared by Me**: Track all notes you've shared with others
- **Permission Badges**: See at a glance if you can view or edit shared notes
- **Auto-Save Shares**: Opening a shared link automatically saves it to your "Shared with me" list
- **Cross-Device Sharing**: Shared notes sync across all your devices when logged in

### User Experience
- **Dark/Light Theme**: Toggle between dark, light, or system-based theme
- **Themed Dialogs**: Custom confirmation dialogs that match the app theme
- **Configurable Layout**: Choose 1, 2, or 3 notes per row in the grid view
- **View Switcher**: Quick dropdown to switch between list/folder view and access archive/trash
- **Keyboard Shortcuts**: Press ESC to close modals, click outside to dismiss
- **Google Keep Import**: Import notes from Google Takeout export (supports both JSON and HTML formats)
- **Authentication**: Email/password or Google SSO sign-in
- **Account Management**: Change password from settings
- **Mobile-Optimized**: Touch-friendly controls, visible action menus on mobile

### Cross-Platform
- **Web**: Modern PWA with offline support
- **iOS & Android**: Native apps via Capacitor

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Rich Text**: TipTap (ProseMirror-based)
- **Backend**: Supabase (Auth, PostgreSQL, Storage, Realtime)
- **Offline Storage**: Dexie.js (IndexedDB)
- **Mobile**: Capacitor for iOS/Android builds
- **PWA**: Workbox for service worker and caching

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase project (for backend)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/felix-notes.git
   cd felix-notes
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```

   Add your Supabase credentials:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Run the Supabase migrations (see `supabase/migrations/` folder)

5. Start the development server:
   ```bash
   npm run dev
   ```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run cap:sync` | Sync web assets to native platforms |
| `npm run cap:ios` | Build and open in Xcode |
| `npm run cap:android` | Build and open in Android Studio |

## Project Structure

```
src/
├── components/          # React components
│   ├── folders/        # Folder tree view, picker, badge, manager
│   ├── images/         # Image gallery and viewer
│   ├── import/         # Google Keep importer
│   ├── notes/          # Note editors (text, list, markdown, editor pane)
│   ├── sharing/        # Share modal
│   ├── tags/           # Tag picker, filter, and manager
│   └── ui/             # Reusable UI (dropdown menu, confirm dialog, view switcher)
├── hooks/              # Custom React hooks
├── pages/              # Page components
├── services/           # API and business logic
│   ├── db.ts           # Dexie.js IndexedDB setup
│   ├── googleKeepImport.ts # Google Keep import parser
│   ├── imageProcessor.ts # Image compression
│   ├── share.ts        # Sharing service
│   ├── supabase.ts     # Supabase client
│   └── sync.ts         # Offline sync logic
├── stores/             # Zustand state stores
│   ├── authStore.ts    # Authentication state
│   ├── folderStore.ts  # Folders state
│   ├── imageStore.ts   # Image state
│   ├── noteStore.ts    # Notes state
│   ├── preferencesStore.ts # User preferences (theme, layout, view mode)
│   ├── shareStore.ts   # Sharing state
│   ├── syncStore.ts    # Sync state
│   └── tagStore.ts     # Tags state
└── types/              # TypeScript types
```

## Importing from Google Keep

You can import your existing notes from Google Keep:

1. Go to [Google Takeout](https://takeout.google.com/)
2. Click "Deselect all", then select only **Google Keep**
3. Click "Next step" and choose your export options
4. Create the export and download the ZIP file
5. In Felix Notes, open **Settings** (gear icon)
6. Scroll to "Import from Google Keep" and select the ZIP file
7. Wait for the import to complete

The importer will:
- Import text notes and list notes (checklists preserved as lists)
- Support both JSON (current) and HTML (legacy) export formats
- Preserve titles, content, and timestamps
- Convert Keep labels to tags (creates new tags automatically)
- Skip trashed notes
- Show progress and any errors during import

## Database Schema

The app uses the following Supabase tables:

- `profiles` - User profiles
- `notes` - Notes with content, type, metadata, sort order, and folder_id
- `folders` - Hierarchical folders with parent_folder_id for nesting
- `tags` - User-created tags
- `note_tags` - Many-to-many relationship between notes and tags
- `note_images` - Image attachments for notes
- `note_shares` - Share links with permissions
- `saved_shares` - Tracks notes shared with each user (for "Shared with me" feature)

See `supabase/migrations/` for the complete schema.

## Offline Support

The app uses a local-first architecture:

1. All writes go to IndexedDB first via Dexie.js
2. Changes are queued for sync when offline
3. When online, changes sync to Supabase
4. Conflicts are resolved using version-based detection
5. Supabase Realtime provides live updates across devices

## Building for Mobile

### iOS

```bash
npm run cap:ios
```

This builds the web app and opens Xcode. From there:
1. Select your development team
2. Choose a simulator or connected device
3. Click Run (⌘R)

For App Store release:
1. Product → Archive
2. Distribute App → App Store Connect

### Android

```bash
npm run cap:android
```

This builds the web app and opens Android Studio. From there:
1. Select a device or emulator
2. Click Run (▶)

For Play Store release:
1. Build → Generate Signed Bundle/APK
2. Follow the signing wizard

## PWA Installation

The app can be installed as a PWA on any device:

- **Desktop Chrome**: Click the install icon in the address bar
- **iOS Safari**: Share → Add to Home Screen
- **Android Chrome**: Menu → Install app

## License

MIT
