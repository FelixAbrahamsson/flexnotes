-- Table to track shared notes that users have saved/accessed
-- This enables the "Shared with me" feature
CREATE TABLE saved_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  share_token TEXT NOT NULL,
  note_id UUID NOT NULL, -- Denormalized for easier querying
  saved_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Each user can only save a share once
  UNIQUE(user_id, share_token)
);

-- Index for fast lookups by user
CREATE INDEX saved_shares_user_idx ON saved_shares(user_id);

-- RLS policies
ALTER TABLE saved_shares ENABLE ROW LEVEL SECURITY;

-- Users can only see their own saved shares
CREATE POLICY "Users can view own saved shares"
  ON saved_shares FOR SELECT
  USING (auth.uid() = user_id);

-- Users can save shares
CREATE POLICY "Users can save shares"
  ON saved_shares FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can remove their saved shares
CREATE POLICY "Users can delete own saved shares"
  ON saved_shares FOR DELETE
  USING (auth.uid() = user_id);
