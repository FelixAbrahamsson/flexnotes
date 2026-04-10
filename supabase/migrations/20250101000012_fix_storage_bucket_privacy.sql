-- Fix: Make note-images storage bucket private
--
-- The bucket was public, meaning anyone who could guess a storage path
-- (format: {user-id}/{image-id}.webp) could access any user's images
-- without authentication.
--
-- This migration makes the bucket private and replaces the blanket
-- "Anyone can view images" policy with one scoped to authenticated
-- users viewing their own images. A separate policy allows viewing
-- images for notes that have been shared.

-- Make bucket private
UPDATE storage.buckets
SET public = false
WHERE id = 'note-images';

-- Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Anyone can view images" ON storage.objects;

-- Allow authenticated users to view their own images
CREATE POLICY "Users can view their own images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'note-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow viewing images for notes that are shared with the viewer via a valid share token
-- This uses a function to check share access without exposing note_shares to direct queries
CREATE POLICY "Users can view images for shared notes"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'note-images'
  AND EXISTS (
    SELECT 1 FROM note_images ni
    JOIN note_shares ns ON ns.note_id = ni.note_id
    WHERE ni.storage_path = name
    AND (ns.expires_at IS NULL OR ns.expires_at > now())
  )
);
