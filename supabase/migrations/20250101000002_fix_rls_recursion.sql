-- Fix infinite recursion in RLS policies
-- Run this after 001_initial_schema.sql

-- Drop the problematic policies that cause circular references
drop policy if exists "Anyone can view notes shared with them" on notes;
drop policy if exists "Anyone can update notes shared with write permission" on notes;

-- Drop and recreate note_shares policies without referencing notes table
drop policy if exists "Users can view shares for their notes" on note_shares;
drop policy if exists "Users can create shares for their notes" on note_shares;
drop policy if exists "Users can delete shares for their notes" on note_shares;

-- Simpler note_shares policies using a direct join approach
-- We store owner_id directly on note_shares to avoid the circular reference
alter table note_shares add column if not exists owner_id uuid references profiles(id);

-- Backfill owner_id from notes (if any shares exist)
update note_shares
set owner_id = notes.owner_id
from notes
where note_shares.note_id = notes.id
and note_shares.owner_id is null;

-- Make owner_id required for new shares
-- (can't add NOT NULL if existing rows might have nulls, so we'll handle in app)

-- Create trigger to auto-populate owner_id on insert
create or replace function set_note_share_owner()
returns trigger as $$
begin
  select owner_id into new.owner_id from notes where id = new.note_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists set_note_share_owner_trigger on note_shares;
create trigger set_note_share_owner_trigger
  before insert on note_shares
  for each row execute function set_note_share_owner();

-- Now create simple policies that don't cause recursion
create policy "Users can view shares they own"
  on note_shares for select
  using (owner_id = auth.uid());

create policy "Users can create shares for their notes"
  on note_shares for insert
  with check (
    exists (
      select 1 from notes
      where notes.id = note_shares.note_id
      and notes.owner_id = auth.uid()
    )
  );

create policy "Users can delete their shares"
  on note_shares for delete
  using (owner_id = auth.uid());

-- For shared note access, we'll use a function instead of RLS
-- This avoids the circular dependency entirely
create or replace function get_shared_note(p_share_token text)
returns setof notes
language sql
security definer
set search_path = public
as $$
  select n.*
  from notes n
  join note_shares s on s.note_id = n.id
  where s.share_token = p_share_token
  and (s.expires_at is null or s.expires_at > now());
$$;

-- Function to update a shared note (with write permission check)
create or replace function update_shared_note(
  p_share_token text,
  p_title text default null,
  p_content text default null
)
returns notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note notes;
  v_share note_shares;
begin
  -- Get the share and verify write permission
  select * into v_share from note_shares
  where share_token = p_share_token
  and permission = 'write'
  and (expires_at is null or expires_at > now());

  if v_share is null then
    raise exception 'Invalid share token or no write permission';
  end if;

  -- Update the note
  update notes set
    title = coalesce(p_title, title),
    content = coalesce(p_content, content),
    updated_at = now(),
    version = version + 1
  where id = v_share.note_id
  returning * into v_note;

  return v_note;
end;
$$;
