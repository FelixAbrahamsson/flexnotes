-- Fix: Remove overly permissive RLS policies on notes table
--
-- These policies allowed ANY authenticated user to read/update shared notes
-- by only checking that a share exists for the note, without verifying the
-- user possesses the share token. This meant any authenticated user who knew
-- a note's UUID could access it directly via the Supabase API.
--
-- Shared note access must go through get_shared_note_with_permission() which
-- properly validates the share token.

DROP POLICY IF EXISTS "Anyone can view notes shared with them" ON notes;
DROP POLICY IF EXISTS "Anyone can update notes shared with write permission" ON notes;
