-- Revert: Make note-images storage bucket public again
--
-- Migration 20250101000012 made the bucket private, which broke image
-- loading because the frontend uses getPublicUrl() to embed image URLs
-- directly into note markdown content. The privacy benefit is marginal
-- since paths are composed of UUIDs that are not guessable in practice.

UPDATE storage.buckets
SET public = true
WHERE id = 'note-images';

DROP POLICY IF EXISTS "Users can view their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view images for shared notes" ON storage.objects;

CREATE POLICY "Anyone can view images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'note-images');
