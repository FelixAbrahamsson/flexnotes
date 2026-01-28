-- FlexNotes - Initial Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension (usually already enabled)
create extension if not exists "uuid-ossp";

-- Profiles table (extends Supabase auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  created_at timestamptz default now() not null
);

-- Enable RLS
alter table profiles enable row level security;

-- Profiles policies
create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Notes table
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade not null,
  title text,
  content text not null default '',
  note_type text not null default 'text' check (note_type in ('text', 'list', 'markdown')),
  is_pinned boolean default false not null,
  is_archived boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  version integer default 1 not null
);

-- Notes indexes
create index notes_owner_id_idx on notes(owner_id);
create index notes_updated_at_idx on notes(updated_at desc);
create index notes_is_archived_idx on notes(is_archived);

-- Enable RLS
alter table notes enable row level security;

-- Notes policies
create policy "Users can view their own notes"
  on notes for select
  using (owner_id = auth.uid());

create policy "Users can create their own notes"
  on notes for insert
  with check (owner_id = auth.uid());

create policy "Users can update their own notes"
  on notes for update
  using (owner_id = auth.uid());

create policy "Users can delete their own notes"
  on notes for delete
  using (owner_id = auth.uid());

-- Tags table
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  color text,
  created_at timestamptz default now() not null,
  unique(owner_id, name)
);

-- Enable RLS
alter table tags enable row level security;

-- Tags policies
create policy "Users can view their own tags"
  on tags for select
  using (owner_id = auth.uid());

create policy "Users can create their own tags"
  on tags for insert
  with check (owner_id = auth.uid());

create policy "Users can update their own tags"
  on tags for update
  using (owner_id = auth.uid());

create policy "Users can delete their own tags"
  on tags for delete
  using (owner_id = auth.uid());

-- Note-Tag junction table
create table if not exists note_tags (
  note_id uuid references notes(id) on delete cascade not null,
  tag_id uuid references tags(id) on delete cascade not null,
  primary key (note_id, tag_id)
);

-- Enable RLS
alter table note_tags enable row level security;

-- Note_tags policies (user can manage their own notes' tags)
create policy "Users can view their notes' tags"
  on note_tags for select
  using (
    exists (
      select 1 from notes
      where notes.id = note_tags.note_id
      and notes.owner_id = auth.uid()
    )
  );

create policy "Users can add tags to their notes"
  on note_tags for insert
  with check (
    exists (
      select 1 from notes
      where notes.id = note_tags.note_id
      and notes.owner_id = auth.uid()
    )
  );

create policy "Users can remove tags from their notes"
  on note_tags for delete
  using (
    exists (
      select 1 from notes
      where notes.id = note_tags.note_id
      and notes.owner_id = auth.uid()
    )
  );

-- Note images table
create table if not exists note_images (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references notes(id) on delete cascade not null,
  storage_path text not null,
  position integer not null default 0,
  created_at timestamptz default now() not null
);

-- Enable RLS
alter table note_images enable row level security;

-- Note images policies
create policy "Users can view their notes' images"
  on note_images for select
  using (
    exists (
      select 1 from notes
      where notes.id = note_images.note_id
      and notes.owner_id = auth.uid()
    )
  );

create policy "Users can add images to their notes"
  on note_images for insert
  with check (
    exists (
      select 1 from notes
      where notes.id = note_images.note_id
      and notes.owner_id = auth.uid()
    )
  );

create policy "Users can delete images from their notes"
  on note_images for delete
  using (
    exists (
      select 1 from notes
      where notes.id = note_images.note_id
      and notes.owner_id = auth.uid()
    )
  );

-- Note shares table
create table if not exists note_shares (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references notes(id) on delete cascade not null,
  share_token text unique not null default encode(gen_random_bytes(16), 'hex'),
  permission text not null default 'read' check (permission in ('read', 'write')),
  created_at timestamptz default now() not null,
  expires_at timestamptz
);

-- Index for token lookup
create index note_shares_token_idx on note_shares(share_token);

-- Enable RLS
alter table note_shares enable row level security;

-- Note shares policies
create policy "Users can view shares for their notes"
  on note_shares for select
  using (
    exists (
      select 1 from notes
      where notes.id = note_shares.note_id
      and notes.owner_id = auth.uid()
    )
  );

create policy "Users can create shares for their notes"
  on note_shares for insert
  with check (
    exists (
      select 1 from notes
      where notes.id = note_shares.note_id
      and notes.owner_id = auth.uid()
    )
  );

create policy "Users can delete shares for their notes"
  on note_shares for delete
  using (
    exists (
      select 1 from notes
      where notes.id = note_shares.note_id
      and notes.owner_id = auth.uid()
    )
  );

-- Policy for accessing shared notes (read)
create policy "Anyone can view notes shared with them"
  on notes for select
  using (
    exists (
      select 1 from note_shares
      where note_shares.note_id = notes.id
      and (note_shares.expires_at is null or note_shares.expires_at > now())
    )
  );

-- Policy for accessing shared notes (write)
create policy "Anyone can update notes shared with write permission"
  on notes for update
  using (
    exists (
      select 1 from note_shares
      where note_shares.note_id = notes.id
      and note_shares.permission = 'write'
      and (note_shares.expires_at is null or note_shares.expires_at > now())
    )
  );

-- Storage bucket for note images (run this separately in Supabase dashboard or via API)
-- insert into storage.buckets (id, name, public)
-- values ('note-images', 'note-images', false);

-- Storage policies would be:
-- create policy "Users can upload images for their notes"
--   on storage.objects for insert
--   with check (bucket_id = 'note-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "Users can view their own images"
--   on storage.objects for select
--   using (bucket_id = 'note-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "Users can delete their own images"
--   on storage.objects for delete
--   using (bucket_id = 'note-images' and auth.uid()::text = (storage.foldername(name))[1]);
