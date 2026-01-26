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
  // Use the database function to get the note with permission
  // This bypasses RLS and works for anonymous users
  const { data, error } = await supabase
    .rpc('get_shared_note_with_permission', { p_share_token: shareToken })

  if (error) {
    console.error('Share lookup error:', error)
    return { error: 'Failed to look up share link' }
  }

  if (!data || !data.id) {
    return { error: 'Share link not found, has expired, or has been revoked' }
  }

  // Convert the result to a Note object
  const note: Note = {
    id: data.id,
    owner_id: data.owner_id,
    title: data.title,
    content: data.content,
    note_type: data.note_type as 'text' | 'list' | 'markdown',
    is_pinned: data.is_pinned,
    is_archived: data.is_archived,
    is_deleted: false,
    deleted_at: null,
    folder_id: data.folder_id ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
    version: data.version,
    sort_order: data.sort_order ?? 0,
  }

  return { note, permission: data.permission as 'read' | 'write' }
}

// Update a shared note (requires write permission)
export async function updateSharedNote(
  shareToken: string,
  updates: Partial<Pick<Note, 'title' | 'content'>>
): Promise<{ error: Error | null }> {
  // Use the database function which handles permission checking
  const { error } = await supabase
    .rpc('update_shared_note', {
      p_share_token: shareToken,
      p_title: updates.title ?? null,
      p_content: updates.content ?? null,
    })

  if (error) {
    // The database function throws an exception if permission is denied
    if (error.message.includes('no write permission') || error.message.includes('Invalid share token')) {
      return { error: new Error('Share link not found or you do not have write permission') }
    }
    return { error: new Error(error.message) }
  }

  return { error: null }
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
