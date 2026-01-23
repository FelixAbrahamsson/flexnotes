-- Create storage bucket for note images
-- Run this in Supabase SQL Editor

-- Create the bucket (if it doesn't exist)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-images',
  'note-images',
  true,  -- public bucket for easy image loading
  5242880,  -- 5MB max file size
  array['image/webp', 'image/jpeg', 'image/png', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/gif'];

-- Storage policies

-- Allow authenticated users to upload to their own folder
create policy "Users can upload images to their folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'note-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow anyone to view images (since bucket is public)
create policy "Anyone can view images"
on storage.objects for select
to public
using (bucket_id = 'note-images');

-- Allow users to update their own images
create policy "Users can update their own images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'note-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own images
create policy "Users can delete their own images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'note-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
