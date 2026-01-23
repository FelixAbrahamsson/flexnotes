# Felix Notes - Project Plan

A cross-platform note-taking app with offline support, tag-based organization, and note sharing.

## 1. Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS |
| State Management | Zustand (lightweight, good offline support) |
| Offline Storage | IndexedDB via Dexie.js |
| Rich Text Editor | TipTap (WYSIWYG with markdown support) |
| Image Processing | Browser Canvas API + browser-image-compression |
| Backend | Supabase (Auth, Database, Storage, Realtime) |
| Mobile Wrapper | Capacitor |

## 2. Database Schema (Supabase/PostgreSQL)

### Tables

```sql
-- Users table (managed by Supabase Auth, extended with profile)
create table profiles (
  id uuid references auth.users primary key,
  display_name text,
  created_at timestamptz default now()
);

-- Notes
create table notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) not null,
  title text,  -- optional
  content text not null default '',
  note_type text not null default 'text' check (note_type in ('text', 'list', 'markdown')),
  is_pinned boolean default false,
  is_archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  version integer default 1  -- for conflict detection
);

-- Tags
create table tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) not null,
  name text not null,
  color text,  -- optional hex color
  created_at timestamptz default now(),
  unique(owner_id, name)
);

-- Note-Tag relationship (many-to-many)
create table note_tags (
  note_id uuid references notes(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (note_id, tag_id)
);

-- Note images
create table note_images (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references notes(id) on delete cascade not null,
  storage_path text not null,  -- path in Supabase Storage
  position integer not null,   -- order in note
  created_at timestamptz default now()
);

-- Shared note access
create table note_shares (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references notes(id) on delete cascade not null,
  share_token text unique not null,  -- random token for URL
  permission text not null check (permission in ('read', 'write')),
  created_at timestamptz default now(),
  expires_at timestamptz  -- optional expiration
);

-- Offline sync queue (tracked server-side for conflict detection)
create table sync_log (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references notes(id) on delete cascade,
  user_id uuid references profiles(id),
  operation text not null check (operation in ('create', 'update', 'delete')),
  timestamp timestamptz default now()
);
```

### Row Level Security (RLS) Policies

```sql
-- Notes: owner can do everything, shared users based on permission
alter table notes enable row level security;

create policy "Owner full access" on notes
  for all using (owner_id = auth.uid());

create policy "Shared read access" on notes
  for select using (
    exists (
      select 1 from note_shares
      where note_shares.note_id = notes.id
      and note_shares.permission in ('read', 'write')
    )
  );

create policy "Shared write access" on notes
  for update using (
    exists (
      select 1 from note_shares
      where note_shares.note_id = notes.id
      and note_shares.permission = 'write'
    )
  );

-- Tags: owner only
alter table tags enable row level security;

create policy "Owner full access" on tags
  for all using (owner_id = auth.uid());

-- Similar policies for other tables...
```

## 3. Feature Breakdown

### Phase 1: Core Foundation
- [ ] Project setup (Vite + React + TypeScript + Tailwind)
- [ ] Supabase project setup and schema migration
- [ ] Authentication (email/password)
- [ ] Basic note CRUD (create, read, update, delete)
- [ ] Note types: plain text, list with checkboxes
- [ ] Local state management with Zustand

### Phase 2: Organization & Search
- [ ] Tag management (create, edit, delete, assign colors)
- [ ] Assign/remove tags from notes
- [ ] Filter notes by tags
- [ ] Pin/unpin notes
- [ ] Archive/unarchive notes
- [ ] Search notes by title and content

### Phase 3: Rich Content
- [ ] Markdown note type with TipTap WYSIWYG editor
- [ ] Image upload with client-side compression to WebP
- [ ] Image display in notes
- [ ] Image deletion

### Phase 4: Offline & Sync
- [ ] IndexedDB local storage with Dexie.js
- [ ] Offline read support
- [ ] Offline edit queue
- [ ] Sync on reconnection
- [ ] Conflict detection and resolution (version-based)
- [ ] Real-time updates via Supabase Realtime

### Phase 5: Sharing
- [ ] Generate share links (read/write)
- [ ] Access notes via share link
- [ ] Manage/revoke share links
- [ ] Optional link expiration

### Phase 6: Mobile & Polish
- [ ] Capacitor setup for iOS/Android
- [ ] Responsive design refinements
- [ ] Touch-friendly interactions
- [ ] App icons and splash screens
- [ ] Build and publish workflow

## 4. Architecture Details

### 4.1 Offline Sync Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                      Client                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │   Zustand   │◄──►│   Dexie     │◄──►│  Sync Service   │  │
│  │   (State)   │    │ (IndexedDB) │    │                 │  │
│  └─────────────┘    └─────────────┘    └────────┬────────┘  │
└─────────────────────────────────────────────────┼───────────┘
                                                  │
                                          Online? │
                                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                     Supabase                                │
│  ┌─────────────────┐         ┌─────────────────────────┐    │
│  │    Database     │◄───────►│   Realtime Subscriptions│    │
│  └─────────────────┘         └─────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Sync Flow:**
1. All writes go to local IndexedDB first (instant UI response)
2. Changes are queued with timestamps in a pending_changes table
3. When online, sync service pushes pending changes to Supabase
4. Server responds with current version number
5. If version mismatch (conflict), client fetches server version
6. Conflict resolution: merge changes or prompt user for significant conflicts

**Conflict Resolution Strategy (Last-Write-Wins with merge):**
- For simple fields (title, is_pinned, etc.): last write wins
- For content: if both changed, attempt text merge; if merge fails, keep both versions and let user choose
- Version number increments on each save

### 4.2 Image Handling

```
User selects image
        │
        ▼
┌───────────────────┐
│ Validate file type│ (jpg, png, gif, webp, heic)
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Resize if needed  │ Max 1920px on longest edge (~2MP)
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Convert to WebP   │ Quality: 80%
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Store locally     │ (IndexedDB blob)
└─────────┬─────────┘
          │
          ▼ (when online)
┌───────────────────┐
│ Upload to Supabase│ Storage bucket: 'note-images'
│ Storage           │ Path: {user_id}/{note_id}/{image_id}.webp
└───────────────────┘
```

### 4.3 List Note Format

For list/checkbox notes, content is stored as JSON:

```json
{
  "items": [
    { "id": "uuid1", "text": "Buy groceries", "checked": false },
    { "id": "uuid2", "text": "Call mom", "checked": true },
    { "id": "uuid3", "text": "Finish report", "checked": false }
  ]
}
```

### 4.4 Search Implementation

Client-side search for simplicity (works offline):
- Index note titles and content in IndexedDB
- Use Dexie's full-text search or simple substring matching
- Filter results in-memory (sufficient for personal note volumes)

If search performance becomes an issue later, can add PostgreSQL full-text search on server.

## 5. Project Structure

```
felix-notes/
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   ├── LoginForm.tsx
│   │   │   └── SignupForm.tsx
│   │   ├── notes/
│   │   │   ├── NoteCard.tsx
│   │   │   ├── NoteEditor.tsx
│   │   │   ├── NoteList.tsx
│   │   │   ├── TextEditor.tsx
│   │   │   ├── ListEditor.tsx
│   │   │   └── MarkdownEditor.tsx
│   │   ├── tags/
│   │   │   ├── TagPicker.tsx
│   │   │   ├── TagManager.tsx
│   │   │   └── TagBadge.tsx
│   │   ├── images/
│   │   │   ├── ImageUploader.tsx
│   │   │   └── ImageGallery.tsx
│   │   ├── sharing/
│   │   │   ├── ShareDialog.tsx
│   │   │   └── SharedNoteView.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── MobileNav.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Modal.tsx
│   │       └── ...
│   ├── hooks/
│   │   ├── useNotes.ts
│   │   ├── useTags.ts
│   │   ├── useAuth.ts
│   │   ├── useSync.ts
│   │   ├── useOnlineStatus.ts
│   │   └── useSearch.ts
│   ├── stores/
│   │   ├── noteStore.ts
│   │   ├── tagStore.ts
│   │   ├── authStore.ts
│   │   └── syncStore.ts
│   ├── services/
│   │   ├── supabase.ts
│   │   ├── db.ts          (Dexie IndexedDB setup)
│   │   ├── sync.ts
│   │   ├── imageProcessor.ts
│   │   └── search.ts
│   ├── types/
│   │   ├── note.ts
│   │   ├── tag.ts
│   │   └── index.ts
│   ├── utils/
│   │   ├── markdown.ts
│   │   ├── conflict.ts
│   │   └── helpers.ts
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Login.tsx
│   │   ├── Signup.tsx
│   │   ├── Note.tsx
│   │   ├── Tags.tsx
│   │   ├── Archive.tsx
│   │   ├── Search.tsx
│   │   └── SharedNote.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── android/                 (generated by Capacitor)
├── ios/                     (generated by Capacitor)
├── public/
│   └── icons/
├── capacitor.config.ts
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── package.json
└── README.md
```

## 6. Key Dependencies

```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "react-router-dom": "^6.x",
    "@supabase/supabase-js": "^2.x",
    "zustand": "^4.x",
    "dexie": "^4.x",
    "dexie-react-hooks": "^1.x",
    "@tiptap/react": "^2.x",
    "@tiptap/starter-kit": "^2.x",
    "@tiptap/extension-task-list": "^2.x",
    "@tiptap/extension-task-item": "^2.x",
    "@tiptap/extension-image": "^2.x",
    "browser-image-compression": "^2.x",
    "@capacitor/core": "^5.x",
    "@capacitor/android": "^5.x",
    "@capacitor/ios": "^5.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vite": "^5.x",
    "@vitejs/plugin-react": "^4.x",
    "tailwindcss": "^3.x",
    "autoprefixer": "^10.x",
    "postcss": "^8.x",
    "@capacitor/cli": "^5.x"
  }
}
```

## 7. Development Phases Timeline

### Phase 1: Foundation (Start here)
Get basic note creation and auth working.

### Phase 2: Organization
Add tags and filtering - makes the app actually usable.

### Phase 3: Rich Content
Markdown editor and images - key differentiators from Google Keep.

### Phase 4: Offline
The most complex phase. Build sync infrastructure.

### Phase 5: Sharing
Nice-to-have, but important for collaboration use case.

### Phase 6: Mobile
Polish and deploy to app stores.

## 8. Supabase Setup Checklist

1. Create new Supabase project at https://supabase.com
2. Run the schema migration SQL
3. Configure Storage bucket 'note-images' with appropriate policies
4. Enable Row Level Security on all tables
5. Configure Auth settings (email confirmations, etc.)
6. Get API URL and anon key for client config
7. (Later) Set up custom SMTP for branded emails

## 9. UX Principles

- **One-click note creation**: Prominent "+" button always visible. Tapping it instantly creates a new text note and focuses the editor. No dialogs or type selection for the quick path.
- **Note type conversion**: User can change note type after creation (text → list → markdown) via a menu.
- **Clean/minimal UI**: Similar to Notion or Apple Notes. Focus on content, not chrome.
- **Mobile-first touch targets**: Buttons and interactive elements sized for touch.

## 10. Open Questions / Future Considerations

- **Reminders**: Could add reminder times to notes (would need push notifications via Capacitor)
- **Note colors**: Google Keep has colored notes - easy to add if desired
- **Trash/soft delete**: Currently hard delete - could add 30-day trash
- **Export**: Export all notes as JSON/markdown for data portability
- **Nested tags**: Could allow tag hierarchy (work/project-a) with special UI

---

## Ready to Start?

Once you've reviewed this plan and set up a Supabase project, we can begin with Phase 1. I'll need:
1. Your Supabase project URL
2. Your Supabase anon (public) key

These will go in a `.env` file (gitignored) for local development.
