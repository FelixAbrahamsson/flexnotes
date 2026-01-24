# Felix Notes

A modern, cross-platform note-taking app with offline support and real-time sync. Built as a Google Keep alternative with additional features like markdown editing and shareable notes.

## Features

### Note Management
- **Multiple Note Types**: Plain text, checklists, and rich markdown with WYSIWYG editing
- **Tag Organization**: Create, edit, and delete tags to organize and filter your notes
- **Image Support**: Attach images via button, drag & drop, or paste with automatic compression
- **Pin & Archive**: Pin important notes and archive completed ones
- **Trash Bin**: Deleted notes go to trash with 30-day retention before permanent deletion
- **Quick Actions**: Archive or delete notes directly from the note card
- **Auto-Cleanup**: Empty notes are automatically deleted when closed
- **Search**: Full-text search across note titles and content

### List Notes
- **Touch-Friendly Reordering**: Drag items up/down to reorder on mobile and desktop
- **Swipe to Indent**: Swipe left/right on the grip handle to change indentation
- **Hierarchical Drag**: Dragging a parent item moves all its children too
- **Nested Lists**: Support for up to 5 levels of indentation
- **Keyboard Shortcuts**: Tab/Shift+Tab to indent, Enter to add item, Backspace on empty to outdent/delete

### Sync & Storage
- **Offline-First**: Works without internet, syncs when back online
- **Real-Time Sync**: Changes sync across devices instantly via Supabase Realtime
- **Shareable Notes**: Generate links to share notes with read or write access

### User Experience
- **Dark/Light Theme**: Toggle between dark, light, or system-based theme
- **Configurable Layout**: Choose 1, 2, or 3 notes per row in the grid view
- **Keyboard Shortcuts**: Press ESC to close modals, click outside to dismiss
- **Google Keep Import**: Import notes from Google Takeout export (supports both JSON and HTML formats)
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
│   ├── images/         # Image gallery and viewer
│   ├── import/         # Google Keep importer
│   ├── notes/          # Note editors (text, list, markdown)
│   ├── sharing/        # Share modal
│   └── tags/           # Tag picker, filter, and manager
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
│   ├── imageStore.ts   # Image state
│   ├── noteStore.ts    # Notes state
│   ├── preferencesStore.ts # User preferences (theme, layout)
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
- `notes` - Notes with content, type, and metadata
- `tags` - User-created tags
- `note_tags` - Many-to-many relationship between notes and tags
- `note_images` - Image attachments for notes
- `note_shares` - Share links with permissions

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
