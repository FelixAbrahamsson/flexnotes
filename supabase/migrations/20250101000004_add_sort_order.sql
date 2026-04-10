-- Add sort_order column for manual note ordering
-- This allows users to drag-and-drop reorder notes

-- Add the column (DOUBLE PRECISION allows fractional values for inserting between notes)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS sort_order DOUBLE PRECISION;

-- Create index for efficient sorting
CREATE INDEX IF NOT EXISTS notes_sort_order_idx ON notes(sort_order);

-- Initialize existing notes with sort_order based on updated_at (newest first)
-- Using negative epoch milliseconds so newer notes have lower sort_order values
UPDATE notes
SET sort_order = -EXTRACT(EPOCH FROM updated_at) * 1000
WHERE sort_order IS NULL;
