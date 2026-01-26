-- Add missing UPDATE policy for note_shares
-- This allows users to update share permissions for their own notes

create policy "Users can update shares for their notes"
  on note_shares for update
  using (
    exists (
      select 1 from notes
      where notes.id = note_shares.note_id
      and notes.owner_id = auth.uid()
    )
  );
