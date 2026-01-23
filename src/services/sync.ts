import { supabase } from './supabase'
import {
  db,
  generateLocalId,
  getCurrentTimestamp,
  getLastSyncTime,
  setLastSyncTime,
  type LocalNote,
  type LocalTag,
  type LocalNoteTag,
  type PendingChange,
} from './db'
import type { Tag } from '@/types'

// Sync status for UI
export interface SyncState {
  isSyncing: boolean
  pendingCount: number
  lastSyncTime: string | null
  error: string | null
}

// Queue a change for sync
export async function queueChange(
  entityType: PendingChange['entityType'],
  entityId: string,
  operation: PendingChange['operation'],
  data?: Record<string, unknown>
): Promise<void> {
  const change: PendingChange = {
    id: generateLocalId(),
    entityType,
    entityId,
    operation,
    data,
    timestamp: getCurrentTimestamp(),
    retryCount: 0,
  }

  await db.pendingChanges.add(change)
}

// Process pending changes
export async function processPendingChanges(userId: string): Promise<{
  success: number
  failed: number
  errors: string[]
}> {
  const pending = await db.pendingChanges.orderBy('timestamp').toArray()
  let success = 0
  let failed = 0
  const errors: string[] = []

  for (const change of pending) {
    try {
      await processChange(change, userId)
      await db.pendingChanges.delete(change.id)
      success++
    } catch (error) {
      const message = (error as Error).message
      errors.push(`${change.entityType}/${change.operation}: ${message}`)

      // Increment retry count
      await db.pendingChanges.update(change.id, {
        retryCount: change.retryCount + 1,
      })

      // Remove after too many retries
      if (change.retryCount >= 5) {
        await db.pendingChanges.delete(change.id)
        errors.push(`Gave up on ${change.entityType}/${change.entityId} after 5 retries`)
      }

      failed++
    }
  }

  return { success, failed, errors }
}

async function processChange(change: PendingChange, userId: string): Promise<void> {
  switch (change.entityType) {
    case 'note':
      await processNoteChange(change, userId)
      break
    case 'tag':
      await processTagChange(change, userId)
      break
    case 'noteTag':
      await processNoteTagChange(change)
      break
    default:
      throw new Error(`Unknown entity type: ${change.entityType}`)
  }
}

// Helper to strip local-only fields from note data before syncing to server
function stripLocalOnlyFields(noteData: Record<string, unknown>): Record<string, unknown> {
  const { is_deleted, deleted_at, ...cleanData } = noteData
  return cleanData
}

async function processNoteChange(change: PendingChange, userId: string): Promise<void> {
  const { entityId, operation, data } = change

  switch (operation) {
    case 'create': {
      const localNote = await db.notes.get(entityId)
      if (!localNote) return

      // Don't sync notes that are already in trash
      if (localNote.is_deleted) {
        // Just mark as synced locally - it will be deleted later
        await db.notes.update(entityId, { _syncStatus: 'synced' })
        return
      }

      const { _syncStatus, _localUpdatedAt, _serverUpdatedAt, ...noteData } = localNote
      const cleanData = stripLocalOnlyFields(noteData)

      const { error } = await supabase.from('notes').insert({
        ...cleanData,
        owner_id: userId,
      })

      if (error) throw error

      await db.notes.update(entityId, {
        _syncStatus: 'synced',
        _serverUpdatedAt: getCurrentTimestamp(),
      })
      break
    }

    case 'update': {
      const localNote = await db.notes.get(entityId)
      if (!localNote) return

      // If note is in trash, delete from server instead of updating
      if (localNote.is_deleted) {
        const { error } = await supabase.from('notes').delete().eq('id', entityId)
        if (error && !error.message.includes('not found')) throw error
        await db.notes.update(entityId, { _syncStatus: 'synced' })
        return
      }

      // Check for conflicts
      const { data: serverNote } = await supabase
        .from('notes')
        .select('version, updated_at')
        .eq('id', entityId)
        .single()

      if (serverNote && serverNote.version > localNote.version) {
        // Server has newer version - mark as conflict
        await db.notes.update(entityId, { _syncStatus: 'conflict' })
        throw new Error('Conflict detected - server has newer version')
      }

      // Strip local-only fields from update data
      const cleanData = data ? stripLocalOnlyFields(data as Record<string, unknown>) : {}

      const { error } = await supabase
        .from('notes')
        .update({
          ...cleanData,
          updated_at: getCurrentTimestamp(),
          version: localNote.version,
        })
        .eq('id', entityId)

      if (error) throw error

      await db.notes.update(entityId, {
        _syncStatus: 'synced',
        _serverUpdatedAt: getCurrentTimestamp(),
      })
      break
    }

    case 'delete': {
      const { error } = await supabase.from('notes').delete().eq('id', entityId)
      if (error && !error.message.includes('not found')) throw error
      break
    }
  }
}

async function processTagChange(change: PendingChange, userId: string): Promise<void> {
  const { entityId, operation, data } = change

  switch (operation) {
    case 'create': {
      const localTag = await db.tags.get(entityId)
      if (!localTag) return

      const { _syncStatus, _localUpdatedAt, ...tagData } = localTag
      const { error } = await supabase.from('tags').insert({
        ...tagData,
        owner_id: userId,
      })

      if (error) throw error

      await db.tags.update(entityId, { _syncStatus: 'synced' })
      break
    }

    case 'update': {
      const { error } = await supabase
        .from('tags')
        .update(data as Partial<Tag>)
        .eq('id', entityId)

      if (error) throw error

      await db.tags.update(entityId, { _syncStatus: 'synced' })
      break
    }

    case 'delete': {
      const { error } = await supabase.from('tags').delete().eq('id', entityId)
      if (error && !error.message.includes('not found')) throw error
      break
    }
  }
}

async function processNoteTagChange(change: PendingChange): Promise<void> {
  const { entityId, operation } = change
  const [noteId, tagId] = entityId.split(':')

  if (!noteId || !tagId) return

  switch (operation) {
    case 'create': {
      const { error } = await supabase
        .from('note_tags')
        .insert({ note_id: noteId, tag_id: tagId })

      if (error && !error.message.includes('duplicate')) throw error

      await db.noteTags
        .where('[note_id+tag_id]')
        .equals([noteId, tagId])
        .modify({ _syncStatus: 'synced' })
      break
    }

    case 'delete': {
      const { error } = await supabase
        .from('note_tags')
        .delete()
        .eq('note_id', noteId)
        .eq('tag_id', tagId)

      if (error && !error.message.includes('not found')) throw error
      break
    }
  }
}

// Full sync - pull all data from server
export async function fullSync(userId: string): Promise<void> {
  // Fetch notes
  const { data: notes, error: notesError } = await supabase
    .from('notes')
    .select('*')
    .eq('owner_id', userId)

  if (notesError) throw notesError

  // Fetch tags
  const { data: tags, error: tagsError } = await supabase
    .from('tags')
    .select('*')
    .eq('owner_id', userId)

  if (tagsError) throw tagsError

  // Fetch note_tags
  const { data: noteTags, error: noteTagsError } = await supabase
    .from('note_tags')
    .select('note_id, tag_id, notes!inner(owner_id)')
    .eq('notes.owner_id', userId)

  if (noteTagsError) throw noteTagsError

  // Update local database
  await db.transaction('rw', [db.notes, db.tags, db.noteTags], async () => {
    // Sync notes - merge with local changes
    for (const note of notes || []) {
      const localNote = await db.notes.get(note.id)

      if (localNote && localNote._syncStatus === 'pending') {
        // Local has pending changes - keep local version but mark for sync
        continue
      }

      const localNoteData: LocalNote = {
        ...note,
        // Add default values for local-only trash fields
        is_deleted: false,
        deleted_at: null,
        _syncStatus: 'synced',
        _localUpdatedAt: note.updated_at,
        _serverUpdatedAt: note.updated_at,
      }
      await db.notes.put(localNoteData)
    }

    // Sync tags
    for (const tag of tags || []) {
      const localTag = await db.tags.get(tag.id)

      if (localTag && localTag._syncStatus === 'pending') {
        continue
      }

      const localTagData: LocalTag = {
        ...tag,
        _syncStatus: 'synced',
        _localUpdatedAt: tag.created_at,
      }
      await db.tags.put(localTagData)
    }

    // Sync note_tags
    for (const nt of noteTags || []) {
      const localNT: LocalNoteTag = {
        note_id: nt.note_id,
        tag_id: nt.tag_id,
        _syncStatus: 'synced',
      }
      await db.noteTags.put(localNT)
    }
  })

  await setLastSyncTime('full', getCurrentTimestamp())
}

// Incremental sync - only fetch changes since last sync
export async function incrementalSync(userId: string): Promise<void> {
  const lastSync = await getLastSyncTime('full')

  if (!lastSync) {
    // No previous sync, do full sync
    await fullSync(userId)
    return
  }

  // Fetch updated notes since last sync
  const { data: notes } = await supabase
    .from('notes')
    .select('*')
    .eq('owner_id', userId)
    .gte('updated_at', lastSync)

  // Update local notes
  for (const note of notes || []) {
    const localNote = await db.notes.get(note.id)

    if (localNote && localNote._syncStatus === 'pending') {
      // Check for conflict
      if (new Date(note.updated_at) > new Date(localNote._localUpdatedAt)) {
        await db.notes.update(note.id, { _syncStatus: 'conflict' })
      }
      continue
    }

    const localNoteData: LocalNote = {
      ...note,
      // Add default values for local-only trash fields
      is_deleted: false,
      deleted_at: null,
      _syncStatus: 'synced',
      _localUpdatedAt: note.updated_at,
      _serverUpdatedAt: note.updated_at,
    }
    await db.notes.put(localNoteData)
  }

  await setLastSyncTime('full', getCurrentTimestamp())
}

// Resolve conflict by choosing local or server version
export async function resolveConflict(
  noteId: string,
  choice: 'local' | 'server',
  userId: string
): Promise<void> {
  if (choice === 'server') {
    // Fetch server version and overwrite local
    const { data: serverNote } = await supabase
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .single()

    if (serverNote) {
      const localNoteData: LocalNote = {
        ...serverNote,
        _syncStatus: 'synced',
        _localUpdatedAt: serverNote.updated_at,
        _serverUpdatedAt: serverNote.updated_at,
      }
      await db.notes.put(localNoteData)

      // Remove any pending changes for this note
      await db.pendingChanges.where('entityId').equals(noteId).delete()
    }
  } else {
    // Push local version to server
    const localNote = await db.notes.get(noteId)
    if (!localNote) return

    const { _syncStatus, _localUpdatedAt, _serverUpdatedAt, ...noteData } = localNote
    const cleanData = stripLocalOnlyFields(noteData)

    const { error } = await supabase
      .from('notes')
      .upsert({
        ...cleanData,
        owner_id: userId,
        updated_at: getCurrentTimestamp(),
        version: (localNote.version || 0) + 1,
      })

    if (error) throw error

    await db.notes.update(noteId, {
      _syncStatus: 'synced',
      _serverUpdatedAt: getCurrentTimestamp(),
      version: (localNote.version || 0) + 1,
    })

    // Remove pending changes
    await db.pendingChanges.where('entityId').equals(noteId).delete()
  }
}

// Get pending changes count
export async function getPendingCount(): Promise<number> {
  return await db.pendingChanges.count()
}

// Get notes with conflicts
export async function getConflictedNotes(): Promise<LocalNote[]> {
  return await db.notes.where('_syncStatus').equals('conflict').toArray()
}
