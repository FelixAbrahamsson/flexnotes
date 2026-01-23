import { supabase } from './supabase'
import type { Note, NoteShare } from '@/types'

// Generate a random share token
function generateShareToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let token = ''
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}

// Create a share link for a note
export async function createShareLink(
  noteId: string,
  permission: 'read' | 'write' = 'read',
  expiresInDays?: number
): Promise<{ share: NoteShare; url: string } | { error: Error }> {
  try {
    const shareToken = generateShareToken()
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null

    const { data, error } = await supabase
      .from('note_shares')
      .insert({
        note_id: noteId,
        share_token: shareToken,
        permission,
        expires_at: expiresAt,
      })
      .select()
      .single()

    if (error) throw error

    const url = `${window.location.origin}/shared/${shareToken}`

    return { share: data, url }
  } catch (error) {
    return { error: error as Error }
  }
}

// Get all shares for a note
export async function getSharesForNote(noteId: string): Promise<NoteShare[]> {
  const { data, error } = await supabase
    .from('note_shares')
    .select('*')
    .eq('note_id', noteId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch shares:', error)
    return []
  }

  return data || []
}

// Delete a share link
export async function deleteShare(shareId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('note_shares')
    .delete()
    .eq('id', shareId)

  return { error: error as Error | null }
}

// Update share permission
export async function updateSharePermission(
  shareId: string,
  permission: 'read' | 'write'
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('note_shares')
    .update({ permission })
    .eq('id', shareId)

  return { error: error as Error | null }
}

// Get a shared note by token (for anonymous access)
export async function getSharedNote(
  shareToken: string
): Promise<{ note: Note; permission: 'read' | 'write' } | { error: string }> {
  // First, get the share record
  const { data: share, error: shareError } = await supabase
    .from('note_shares')
    .select('*')
    .eq('share_token', shareToken)
    .single()

  if (shareError || !share) {
    return { error: 'Share link not found or has been revoked' }
  }

  // Check if expired
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return { error: 'This share link has expired' }
  }

  // Get the note
  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('*')
    .eq('id', share.note_id)
    .single()

  if (noteError || !note) {
    return { error: 'Note not found' }
  }

  return { note, permission: share.permission }
}

// Update a shared note (requires write permission)
export async function updateSharedNote(
  shareToken: string,
  updates: Partial<Pick<Note, 'title' | 'content'>>
): Promise<{ error: Error | null }> {
  // Verify write permission
  const { data: share, error: shareError } = await supabase
    .from('note_shares')
    .select('*')
    .eq('share_token', shareToken)
    .single()

  if (shareError || !share) {
    return { error: new Error('Share link not found') }
  }

  if (share.permission !== 'write') {
    return { error: new Error('You do not have write permission') }
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return { error: new Error('This share link has expired') }
  }

  // Update the note
  const { error } = await supabase
    .from('notes')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', share.note_id)

  return { error: error as Error | null }
}

// Copy text to clipboard
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
      return true
    } catch {
      return false
    } finally {
      document.body.removeChild(textarea)
    }
  }
}
