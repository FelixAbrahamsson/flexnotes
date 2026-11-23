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
  type LocalFolder,
  type PendingChange,
} from './db'
import type { Tag, Folder, Note } from '@/types'

// Sync status for UI
export interface SyncState {
  isSyncing: boolean
  pendingCount: number
  lastSyncTime: string | null
  error: string | null
}

/** Thrown when a push finds the server copy changed since our base version. */
class SyncConflictError extends Error {
  constructor(noteId: string) {
    super(`Conflict on note ${noteId}`)
    this.name = 'SyncConflictError'
  }
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
    // Notes in conflict wait for the user to resolve them; don't burn retries
    // (which would eventually drop the change and lose local edits).
    if (change.entityType === 'note') {
      const note = await db.notes.get(change.entityId)
      if (note?._syncStatus === 'conflict') continue
    }

    try {
      await processChange(change, userId)
      await db.pendingChanges.delete(change.id)
      success++
    } catch (error) {
      // Conflict: keep the change queued (no retry count) until resolved
      if (error instanceof SyncConflictError) continue

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
    case 'folder':
      await processFolderChange(change, userId)
      break
    default:
      throw new Error(`Unknown entity type: ${change.entityType}`)
  }
}

// Helper to strip sync metadata fields from note data before syncing to server
function stripSyncMetadataFields(noteData: Record<string, unknown>): Record<string, unknown> {
  const { _syncStatus, _localUpdatedAt, _serverUpdatedAt, _serverVersion, _pendingSync, ...cleanData } = noteData
  return cleanData
}

/**
 * Has the server copy changed since this local copy was last synced?
 * Uses the server version we last saw; for notes synced before that was
 * tracked, falls back to "server is ahead of our local version".
 */
function serverChangedSinceBase(localNote: LocalNote, serverVersion: number): boolean {
  if (localNote._serverVersion !== undefined) {
    return serverVersion !== localNote._serverVersion
  }
  return serverVersion > localNote.version
}

async function processNoteChange(change: PendingChange, userId: string): Promise<void> {
  const { entityId, operation } = change

  switch (operation) {
    case 'create': {
      const localNote = await db.notes.get(entityId)
      if (!localNote) return

      const cleanData = stripSyncMetadataFields(localNote as unknown as Record<string, unknown>)

      const { error } = await supabase.from('notes').insert({
        ...cleanData,
        owner_id: userId,
      })

      if (error) throw error

      await db.notes.update(entityId, {
        _syncStatus: 'synced',
        _serverUpdatedAt: localNote.updated_at,
        _serverVersion: localNote.version,
      })
      break
    }

    case 'update': {
      const localNote = await db.notes.get(entityId)
      if (!localNote) return

      // Check if note exists on server
      const { data: serverNote, error: fetchError } = await supabase
        .from('notes')
        .select('version, updated_at')
        .eq('id', entityId)
        .single()

      // If note doesn't exist on server, create it instead
      if (fetchError && fetchError.code === 'PGRST116') {
        const cleanData = stripSyncMetadataFields(localNote as unknown as Record<string, unknown>)

        const { error } = await supabase.from('notes').insert({
          ...cleanData,
          owner_id: userId,
        })

        if (error) throw error

        await db.notes.update(entityId, {
          _syncStatus: 'synced',
          _serverUpdatedAt: localNote.updated_at,
          _serverVersion: localNote.version,
        })
        return
      }

      if (fetchError) throw fetchError

      if (serverNote && serverChangedSinceBase(localNote, serverNote.version)) {
        // Someone else changed the note since we last synced it. Park it as a
        // conflict for the user to resolve; the pending change stays queued.
        await db.notes.update(entityId, { _syncStatus: 'conflict' })
        throw new SyncConflictError(entityId)
      }

      // Strip sync metadata fields from update data
      const cleanData = stripSyncMetadataFields(localNote as unknown as Record<string, unknown>)
      const pushedAt = getCurrentTimestamp()

      const { error } = await supabase
        .from('notes')
        .update({
          ...cleanData,
          updated_at: pushedAt,
        })
        .eq('id', entityId)

      if (error) throw error

      await db.notes.update(entityId, {
        _syncStatus: 'synced',
        _serverUpdatedAt: pushedAt,
        _serverVersion: localNote.version,
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

      // Strip sync metadata fields only
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

async function processFolderChange(change: PendingChange, userId: string): Promise<void> {
  const { entityId, operation, data } = change

  switch (operation) {
    case 'create': {
      const localFolder = await db.folders.get(entityId)
      if (!localFolder) return

      const { _syncStatus, _localUpdatedAt, ...folderData } = localFolder
      const { error } = await supabase.from('folders').insert({
        ...folderData,
        owner_id: userId,
      })

      if (error) throw error

      await db.folders.update(entityId, { _syncStatus: 'synced' })
      break
    }

    case 'update': {
      const { error } = await supabase
        .from('folders')
        .update(data as Partial<Folder>)
        .eq('id', entityId)

      if (error) throw error

      await db.folders.update(entityId, { _syncStatus: 'synced' })
      break
    }

    case 'delete': {
      const { error } = await supabase.from('folders').delete().eq('id', entityId)
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

  // Fetch folders
  const { data: folders, error: foldersError } = await supabase
    .from('folders')
    .select('*')
    .eq('owner_id', userId)

  if (foldersError) throw foldersError

  // Get pending changes to check if a note has pending operations
  const pendingChanges = await db.pendingChanges.where('entityType').equals('note').toArray()
  const pendingNoteIds = new Set(pendingChanges.map(p => p.entityId))

  // Update local database
  await db.transaction('rw', [db.notes, db.tags, db.noteTags, db.folders], async () => {
    // Sync notes - merge with local changes
    for (const note of notes || []) {
      const localNote = await db.notes.get(note.id)

      // Skip if local has pending changes or an unresolved conflict
      if (
        localNote &&
        (localNote._syncStatus === 'pending' ||
          localNote._syncStatus === 'conflict' ||
          pendingNoteIds.has(note.id))
      ) {
        continue
      }

      // Skip if local version is newer than server version
      if (localNote && localNote._localUpdatedAt && note.updated_at) {
        const localTime = new Date(localNote._localUpdatedAt).getTime()
        const serverTime = new Date(note.updated_at).getTime()
        if (localTime > serverTime) {
          continue
        }
      }

      const localNoteData: LocalNote = {
        ...note,
        // Use server values for trash status (syncs across devices)
        is_deleted: note.is_deleted ?? false,
        deleted_at: note.deleted_at ?? null,
        // Use server sort_order if available, otherwise preserve local or use timestamp
        sort_order: note.sort_order ?? localNote?.sort_order ?? -new Date(note.updated_at).getTime(),
        _syncStatus: 'synced',
        _localUpdatedAt: note.updated_at,
        _serverUpdatedAt: note.updated_at,
        _serverVersion: note.version,
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

    // Remove deleted tags (deleted on server)
    const localTags = await db.tags.where('owner_id').equals(userId).toArray()
    const serverTagIds = new Set((tags || []).map(t => t.id))

    for (const localTag of localTags) {
      if (!serverTagIds.has(localTag.id) && localTag._syncStatus === 'synced') {
        await db.tags.delete(localTag.id)
        // Also remove any note_tags referencing this tag
        await db.noteTags.where('tag_id').equals(localTag.id).delete()
      }
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

    // Remove deleted note_tags (removed on server)
    const localNoteTags = await db.noteTags.toArray()
    const serverNoteTagKeys = new Set((noteTags || []).map(nt => `${nt.note_id}:${nt.tag_id}`))

    for (const localNT of localNoteTags) {
      const key = `${localNT.note_id}:${localNT.tag_id}`
      if (!serverNoteTagKeys.has(key) && localNT._syncStatus === 'synced') {
        await db.noteTags.where('[note_id+tag_id]').equals([localNT.note_id, localNT.tag_id]).delete()
      }
    }

    // Sync folders
    for (const folder of folders || []) {
      const localFolder = await db.folders.get(folder.id)

      if (localFolder && localFolder._syncStatus === 'pending') {
        continue
      }

      const localFolderData: LocalFolder = {
        ...folder,
        _syncStatus: 'synced',
        _localUpdatedAt: folder.updated_at,
      }
      await db.folders.put(localFolderData)
    }

    // Remove deleted folders (deleted on server)
    const localFolders = await db.folders.where('owner_id').equals(userId).toArray()
    const serverFolderIds = new Set((folders || []).map(f => f.id))

    for (const localFolder of localFolders) {
      if (!serverFolderIds.has(localFolder.id) && localFolder._syncStatus === 'synced') {
        await db.folders.delete(localFolder.id)
      }
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

  // Get pending changes to check if a note has pending operations
  const pendingChanges = await db.pendingChanges.where('entityType').equals('note').toArray()
  const pendingNoteIds = new Set(pendingChanges.map(p => p.entityId))

  // Update local notes
  for (const note of notes || []) {
    const localNote = await db.notes.get(note.id)

    if (localNote?._syncStatus === 'conflict') continue

    // Skip if local has pending changes (check both _syncStatus AND pending queue)
    if (localNote && (localNote._syncStatus === 'pending' || pendingNoteIds.has(note.id))) {
      // Conflict only if the server moved past the version our edits are based
      // on. Comparing timestamps here flagged our own just-pushed writes (echoed
      // back via realtime) as conflicts whenever we kept typing during a sync.
      if (localNote._serverVersion !== undefined && note.version !== localNote._serverVersion) {
        await db.notes.update(note.id, { _syncStatus: 'conflict' })
      }
      continue
    }

    // Skip if local version is newer than server version (protects against stale server data)
    if (localNote && localNote._localUpdatedAt && note.updated_at) {
      const localTime = new Date(localNote._localUpdatedAt).getTime()
      const serverTime = new Date(note.updated_at).getTime()
      if (localTime > serverTime) {
        continue
      }
    }

    const localNoteData: LocalNote = {
      ...note,
      // Use server values for trash status (syncs across devices)
      is_deleted: note.is_deleted ?? false,
      deleted_at: note.deleted_at ?? null,
      // Use server sort_order if available, otherwise preserve local or use timestamp
      sort_order: note.sort_order ?? localNote?.sort_order ?? -new Date(note.updated_at).getTime(),
      _syncStatus: 'synced',
      _localUpdatedAt: note.updated_at,
      _serverUpdatedAt: note.updated_at,
      _serverVersion: note.version,
    }
    await db.notes.put(localNoteData)
  }

  await setLastSyncTime('full', getCurrentTimestamp())
}

// Fetch the server copy of a note (for showing conflicts side by side)
export async function fetchServerNote(noteId: string): Promise<Note | null> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('id', noteId)
    .maybeSingle()
  if (error) throw error
  return data
}

// Resolve conflict by choosing local or server version
export async function resolveConflict(
  noteId: string,
  choice: 'local' | 'server',
  userId: string
): Promise<void> {
  const serverNote = await fetchServerNote(noteId)

  if (choice === 'server') {
    if (serverNote) {
      const localNoteData: LocalNote = {
        ...serverNote,
        _syncStatus: 'synced',
        _localUpdatedAt: serverNote.updated_at,
        _serverUpdatedAt: serverNote.updated_at,
        _serverVersion: serverNote.version,
      }
      await db.notes.put(localNoteData)
    } else {
      // Deleted on the server - drop the local copy too
      await db.notes.delete(noteId)
    }
    await db.pendingChanges.where('entityId').equals(noteId).delete()
    return
  }

  // Push local version to server, on top of whatever the server has now
  const localNote = await db.notes.get(noteId)
  if (!localNote) return

  const cleanData = stripSyncMetadataFields(localNote as unknown as Record<string, unknown>)
  const version = Math.max(localNote.version || 0, serverNote?.version || 0) + 1
  const pushedAt = getCurrentTimestamp()

  const { error } = await supabase
    .from('notes')
    .upsert({
      ...cleanData,
      owner_id: userId,
      updated_at: pushedAt,
      version,
    })

  if (error) throw error

  await db.notes.update(noteId, {
    _syncStatus: 'synced',
    updated_at: pushedAt,
    _serverUpdatedAt: pushedAt,
    _serverVersion: version,
    version,
  })

  await db.pendingChanges.where('entityId').equals(noteId).delete()
}

// Get pending changes count
export async function getPendingCount(): Promise<number> {
  return await db.pendingChanges.count()
}

// Get notes with conflicts
export async function getConflictedNotes(): Promise<LocalNote[]> {
  return await db.notes.where('_syncStatus').equals('conflict').toArray()
}
