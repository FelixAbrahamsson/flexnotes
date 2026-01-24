-- Fix share access for anonymous users
-- The current get_shared_note function doesn't return the permission level
-- This creates a new function that returns both note and permission

-- Create a type to return note with permission
drop type if exists shared_note_result cascade;
create type shared_note_result as (
  id uuid,
  owner_id uuid,
  title text,
  content text,
  note_type text,
  is_pinned boolean,
  is_archived boolean,
  created_at timestamptz,
  updated_at timestamptz,
  version integer,
  sort_order double precision,
  permission text
);

-- Function to get shared note with permission (for anonymous access)
create or replace function get_shared_note_with_permission(p_share_token text)
returns shared_note_result
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result shared_note_result;
begin
  select
    n.id,
    n.owner_id,
    n.title,
    n.content,
    n.note_type,
    n.is_pinned,
    n.is_archived,
    n.created_at,
    n.updated_at,
    n.version,
    n.sort_order,
    s.permission
  into v_result
  from notes n
  join note_shares s on s.note_id = n.id
  where s.share_token = p_share_token
  and (s.expires_at is null or s.expires_at > now());

  return v_result;
end;
$$;

-- Grant execute permission to anon and authenticated users
grant execute on function get_shared_note_with_permission(text) to anon;
grant execute on function get_shared_note_with_permission(text) to authenticated;
