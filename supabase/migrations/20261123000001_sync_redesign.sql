-- Sync redesign: make the server the authority for note versions and ordering.
--
-- 1. notes.server_seq: a server-assigned, monotonically increasing change
--    counter. Clients pull "everything after the last seq I saw" instead of
--    comparing device clocks.
-- 2. updated_at is set by the server on every write (device clocks were used
--    before, so skewed clocks made changes invisible to other devices).
-- 3. push_note(): an atomic compare-and-swap write. It only applies the change
--    if the note is still at the version the client's edits are based on, and
--    otherwise returns the current server row so the client can merge.
-- 4. Add notes/tags/folders to the realtime publication. They were never added,
--    so the app's realtime subscriptions never fired.
--
-- Backward compatible with the previous client: it keeps writing the table
-- directly (the trigger assigns server_seq/updated_at, and bumps version only
-- if a write didn't move it forward), and its pulls by updated_at keep working.

-- 1. Change counter --------------------------------------------------------

create sequence if not exists public.notes_server_seq;

alter table public.notes add column if not exists server_seq bigint;

-- Backfill in updated_at order so existing rows get a sensible ordering.
-- Runs before the write trigger below exists, so updated_at is preserved.
with ordered as (
  select id, row_number() over (order by updated_at, id) as rn
  from public.notes
  where server_seq is null
)
update public.notes n
set server_seq = o.rn
from ordered o
where n.id = o.id;

select setval(
  'public.notes_server_seq',
  greatest((select coalesce(max(server_seq), 0) from public.notes), 1)
);

alter table public.notes
  alter column server_seq set default nextval('public.notes_server_seq'),
  alter column server_seq set not null;

alter sequence public.notes_server_seq owned by public.notes.server_seq;

create index if not exists notes_owner_server_seq_idx
  on public.notes (owner_id, server_seq);

-- 2. Server-assigned seq + updated_at on every write ----------------------

create or replace function public.notes_stamp_write()
returns trigger
language plpgsql
as $$
begin
  new.server_seq := nextval('public.notes_server_seq');
  new.updated_at := now();
  -- Every write must move the version forward, or a compare-and-swap based on
  -- it could miss the change (older clients write version themselves).
  if tg_op = 'UPDATE' and new.version <= old.version then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists notes_stamp_write_trigger on public.notes;
create trigger notes_stamp_write_trigger
  before insert or update on public.notes
  for each row
  execute function public.notes_stamp_write();

-- 3. Compare-and-swap push -------------------------------------------------
--
-- p_fields holds the note columns to write (only the ones the client changed
-- for an update; all of them for a create). p_base_version is the server
-- version the client's edits are based on, or null if the client has never
-- seen the note on the server (a create).
--
-- Returns {"status": "ok" | "conflict", "note": <current server row>}, or
-- {"status": "missing", "note": null} if a base version was given but the
-- note no longer exists.
-- SECURITY INVOKER, so the regular RLS policies on notes apply.

create or replace function public.push_note(
  p_id uuid,
  p_base_version integer,
  p_fields jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_note public.notes;
begin
  select * into v_note from public.notes where id = p_id for update;

  if not found and p_base_version is not null then
    -- The client had this note on the server, but it's gone (deleted on
    -- another device). Don't recreate it from a partial field set; let the
    -- client decide (it re-creates it with all fields to keep the edits).
    return jsonb_build_object('status', 'missing', 'note', null);
  end if;

  if not found then
    insert into public.notes (
      id, owner_id, title, content, note_type, is_pinned, is_archived,
      is_deleted, deleted_at, folder_id, sort_order, created_at, version
    ) values (
      p_id,
      auth.uid(),
      p_fields->>'title',
      coalesce(p_fields->>'content', ''),
      coalesce(p_fields->>'note_type', 'text'),
      coalesce((p_fields->>'is_pinned')::boolean, false),
      coalesce((p_fields->>'is_archived')::boolean, false),
      coalesce((p_fields->>'is_deleted')::boolean, false),
      (p_fields->>'deleted_at')::timestamptz,
      (p_fields->>'folder_id')::uuid,
      (p_fields->>'sort_order')::double precision,
      coalesce((p_fields->>'created_at')::timestamptz, now()),
      1
    )
    returning * into v_note;

    return jsonb_build_object('status', 'ok', 'note', to_jsonb(v_note));
  end if;

  if p_base_version is null or v_note.version <> p_base_version then
    return jsonb_build_object('status', 'conflict', 'note', to_jsonb(v_note));
  end if;

  update public.notes set
    title       = case when p_fields ? 'title'       then p_fields->>'title' else title end,
    content     = case when p_fields ? 'content'     then p_fields->>'content' else content end,
    note_type   = case when p_fields ? 'note_type'   then p_fields->>'note_type' else note_type end,
    is_pinned   = case when p_fields ? 'is_pinned'   then (p_fields->>'is_pinned')::boolean else is_pinned end,
    is_archived = case when p_fields ? 'is_archived' then (p_fields->>'is_archived')::boolean else is_archived end,
    is_deleted  = case when p_fields ? 'is_deleted'  then (p_fields->>'is_deleted')::boolean else is_deleted end,
    deleted_at  = case when p_fields ? 'deleted_at'  then (p_fields->>'deleted_at')::timestamptz else deleted_at end,
    folder_id   = case when p_fields ? 'folder_id'   then (p_fields->>'folder_id')::uuid else folder_id end,
    sort_order  = case when p_fields ? 'sort_order'  then (p_fields->>'sort_order')::double precision else sort_order end,
    version     = version + 1
  where id = p_id
  returning * into v_note;

  -- RLS hides rows the caller may not update; treat that like a missing row.
  if not found then
    raise exception 'Note % not writable', p_id using errcode = '42501';
  end if;

  return jsonb_build_object('status', 'ok', 'note', to_jsonb(v_note));
end;
$$;

grant execute on function public.push_note(uuid, integer, jsonb) to authenticated;

-- 4. Realtime --------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['notes', 'tags', 'folders'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
