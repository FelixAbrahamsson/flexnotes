-- Add trash fields to notes table for cross-device trash sync
-- Previously, trash was local-only and trashed notes were deleted from server

-- Add is_deleted column
ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false NOT NULL;

-- Add deleted_at column
ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Add index for filtering deleted notes
CREATE INDEX IF NOT EXISTS notes_is_deleted_idx ON notes(is_deleted);

-- Update RLS policies to exclude deleted notes from shared note access
-- (We don't want people accessing shared notes that have been trashed)

DROP POLICY IF EXISTS "Anyone can view notes shared with them" ON notes;
CREATE POLICY "Anyone can view notes shared with them"
  ON notes FOR SELECT
  USING (
    is_deleted = false AND
    exists (
      SELECT 1 FROM note_shares
      WHERE note_shares.note_id = notes.id
      AND (note_shares.expires_at IS NULL OR note_shares.expires_at > now())
    )
  );

DROP POLICY IF EXISTS "Anyone can update notes shared with write permission" ON notes;
CREATE POLICY "Anyone can update notes shared with write permission"
  ON notes FOR UPDATE
  USING (
    is_deleted = false AND
    exists (
      SELECT 1 FROM note_shares
      WHERE note_shares.note_id = notes.id
      AND note_shares.permission = 'write'
      AND (note_shares.expires_at IS NULL OR note_shares.expires_at > now())
    )
  );
