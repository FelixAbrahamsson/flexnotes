-- Add sort_order column to tags table for manual tag ordering
-- Lower values appear first (new tags get inserted at the top)

-- Add the column (DOUBLE PRECISION allows fractional values for inserting between tags)
ALTER TABLE tags ADD COLUMN IF NOT EXISTS sort_order DOUBLE PRECISION;

-- Create index for efficient sorting
CREATE INDEX IF NOT EXISTS tags_sort_order_idx ON tags(sort_order);

-- Initialize existing tags with sort_order based on created_at (oldest first, so they have higher values)
-- New tags will get lower values to appear at the top
UPDATE tags
SET sort_order = EXTRACT(EPOCH FROM created_at) * 1000
WHERE sort_order IS NULL;
