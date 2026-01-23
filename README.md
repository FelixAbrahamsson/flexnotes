# Felix Notes

A modern, cross-platform note-taking app with offline support and real-time sync. Built as a Google Keep alternative with additional features like markdown editing and shareable notes.

## Features

- **Multiple Note Types**: Plain text, checklists, and rich markdown with WYSIWYG editing
- **Tag Organization**: Create tags to organize and filter your notes
- **Image Support**: Attach images with automatic compression and WebP conversion
- **Offline-First**: Works without internet, syncs when back online
- **Real-Time Sync**: Changes sync across devices instantly via Supabase Realtime
- **Shareable Notes**: Generate links to share notes with read or write access
- **Pin & Archive**: Pin important notes and archive completed ones
- **Search**: Full-text search across note titles and content
- **Cross-Platform**: Web, iOS, and Android via Capacitor

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
│   ├── notes/          # Note editors (text, list, markdown)
│   ├── sharing/        # Share modal
│   └── tags/           # Tag picker and filter
├── hooks/              # Custom React hooks
├── pages/              # Page components
├── services/           # API and business logic
│   ├── db.ts           # Dexie.js IndexedDB setup
│   ├── imageProcessor.ts # Image compression
│   ├── share.ts        # Sharing service
│   ├── supabase.ts     # Supabase client
│   └── sync.ts         # Offline sync logic
├── stores/             # Zustand state stores
│   ├── authStore.ts    # Authentication state
│   ├── imageStore.ts   # Image state
│   ├── noteStore.ts    # Notes state
│   ├── shareStore.ts   # Sharing state
│   ├── syncStore.ts    # Sync state
│   └── tagStore.ts     # Tags state
└── types/              # TypeScript types
```

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
