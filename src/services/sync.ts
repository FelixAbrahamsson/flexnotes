import { supabase } from './supabase'
import {
  db,
  generateLocalId,
  getCurrentTimestamp,
  type LocalNote,
  type LocalTag,
  type LocalNoteTag,
  type LocalFolder,
  type PendingChange,
} from './db'
import {
  SYNC_FIELDS,
  pickSyncFields,
  changedFields,
  mergeNote,
  type SyncFields,
} from './noteMerge'
import type { Tag, Folder, Note } from '@/types'

/**
 * Local-first sync.
 *
 * Notes:
 * - Every local note remembers the server version its edits are based on
 *   (`_serverVersion`) and a snapshot of its synced fields at that version
 *   (`_base`).
 * - Push sends only changed fields through the `push_note` RPC, which applies
 *   them atomically only if the server is still at that base version.
 *   Otherwise it returns the server row and we three-way merge (base, local,
 *   server); only overlapping text edits become a conflict for the user.
 * - Pull is by the server-assigned change counter `server_seq` (no device
 *   clocks), plus a periodic reconcile of all ids/versions that also catches
 *   server-side deletions and any change the counter cursor skipped.
 *
 * Tags, folders and note-tag links still use the simpler queue/full-sync model.
 */

const NOTES_SEQ_KEY = 'notesSeq'
const PULL_PAGE_SIZE = 500
const MAX_PUSH_ATTEMPTS = 3

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

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

export async function processPendingChanges(userId: string): Promise<{
  success: number
  failed: number
  errors: string[]
}> {
  const pending = await db.pendingChanges.orderBy('timestamp').toArray()
  let success = 0
  let failed = 0
  const errors: string[] = []
  const handledNotes = new Set<string>()

  for (const change of pending) {
    // All queued changes for a note are handled together at its first
    // position in the queue (so a note is created before its tag links).
    let changes = [change]
    if (change.entityType === 'note') {
      if (handledNotes.has(change.entityId)) continue
      handledNotes.add(change.entityId)
      changes = pending.filter((c) => c.entityType === 'note' && c.entityId === change.entityId)
    }

    try {
      const handled =
        change.entityType === 'note'
          ? await processNoteChanges(change.entityId, changes)
          : (await processChange(change, userId), true)
      if (handled) {
        await db.pendingChanges.bulkDelete(changes.map((c) => c.id))
        success++
      }
    } catch (error) {
      const message = (error as Error).message
      errors.push(`${change.entityType}/${change.operation}: ${message}`)

      for (const c of changes) {
        await db.pendingChanges.update(c.id, { retryCount: c.retryCount + 1 })
      }

      // Remove after too many retries
      if (change.retryCount >= 5) {
        await db.pendingChanges.bulkDelete(changes.map((c) => c.id))
        errors.push(`Gave up on ${change.entityType}/${change.entityId} after 5 retries`)
      }

      failed++
    }
  }

  return { success, failed, errors }
}

async function processChange(change: PendingChange, userId: string): Promise<void> {
  switch (change.entityType) {
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

/**
 * Push one note. Returns true when its queued changes are done (pushed or
 * nothing to push), false when they must stay queued (unresolved conflict).
 */
async function processNoteChanges(noteId: string, changes: PendingChange[]): Promise<boolean> {
  if (changes[changes.length - 1].operation === 'delete') {
    const { error } = await supabase.from('notes').delete().eq('id', noteId)
    if (error && !error.message.includes('not found')) throw error
    return true
  }

  for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt++) {
    const local = await db.notes.get(noteId)
    if (!local) return true // deleted locally before it was pushed
    if (local._syncStatus === 'conflict') return false

    const isCreate = local._serverVersion === undefined
    const fields = pickSyncFields(local)
    const changed = isCreate || !local._base ? SYNC_FIELDS : changedFields(local._base, fields)

    if (changed.length === 0) {
      await db.notes.update(noteId, { _syncStatus: 'synced' })
      return true
    }

    const payload: Record<string, unknown> = {}
    for (const f of changed) payload[f] = fields[f]
    if (isCreate) payload.created_at = local.created_at

    const { data, error } = await supabase.rpc('push_note', {
      p_id: noteId,
      p_base_version: local._serverVersion ?? null,
      p_fields: payload,
    })
    if (error) throw error

    const result = data as { status: 'ok' | 'conflict'; note: Note }
    if (result.status === 'ok') {
      await applyPushed(noteId, fields, result.note)
      return true
    }

    // Server moved on: merge into the local copy, then try again on top of it.
    const outcome = await applyServerNote(result.note, true)
    if (outcome === 'conflict') return false
  }

  throw new Error(`Note ${noteId} kept changing on the server; will retry`)
}

/** Record a successful push. Edits made while the push was in flight stay pending. */
async function applyPushed(noteId: string, pushed: SyncFields, server: Note): Promise<void> {
  await db.transaction('rw', db.notes, async () => {
    const current = await db.notes.get(noteId)
    if (!current) return
    const editedMeanwhile = changedFields(pushed, pickSyncFields(current)).length > 0
    await db.notes.put({
      ...(editedMeanwhile ? current : { ...current, ...server }),
      version: server.version,
      server_seq: server.server_seq,
      _serverVersion: server.version,
      _base: pickSyncFields(server),
      _serverUpdatedAt: server.updated_at,
      _syncStatus: editedMeanwhile ? current._syncStatus : 'synced',
    })
  })
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

type ApplyOutcome = 'unchanged' | 'updated' | 'merged' | 'conflict'

/**
 * Bring a server row into the local DB, merging with unpushed local edits.
 * `hasPendingHint` forces the "local has edits" path (used by push).
 */
async function applyServerNote(server: Note, hasPendingHint = false): Promise<ApplyOutcome> {
  return db.transaction('rw', db.notes, db.pendingChanges, async () => {
    const local = await db.notes.get(server.id)
    const serverFields = pickSyncFields(server)
    const synced: Partial<LocalNote> = {
      version: server.version,
      server_seq: server.server_seq,
      _serverVersion: server.version,
      _base: serverFields,
      _serverUpdatedAt: server.updated_at,
    }

    if (!local) {
      await db.notes.put({
        ...server,
        ...synced,
        _syncStatus: 'synced',
        _localUpdatedAt: server.updated_at,
      } as LocalNote)
      return 'updated'
    }

    // Unresolved conflicts wait for the user (the resolver fetches the server copy)
    if (local._syncStatus === 'conflict') return 'unchanged'

    const hasPending =
      hasPendingHint ||
      local._syncStatus === 'pending' ||
      (await db.pendingChanges.where('entityId').equals(local.id).count()) > 0

    if (!hasPending) {
      if (local._serverVersion === server.version && local._base) return 'unchanged'
      await db.notes.put({
        ...local,
        ...server,
        ...synced,
        _syncStatus: 'synced',
        _localUpdatedAt: server.updated_at,
      })
      return 'updated'
    }

    // Our own write echoing back, or nothing new on the server.
    if (local._serverVersion === server.version) return 'unchanged'

    const { merged, conflict } = mergeNote(local._base, pickSyncFields(local), serverFields)
    await db.notes.put({
      ...local,
      ...merged,
      ...synced,
      _syncStatus: conflict ? 'conflict' : 'pending',
    })
    if (!conflict) {
      // Make sure the merged result gets pushed
      const queued = await db.pendingChanges.where('entityId').equals(local.id).count()
      if (queued === 0) await queueChange('note', local.id, 'update')
    }
    return conflict ? 'conflict' : 'merged'
  })
}

/** Apply a batch of server rows; returns how many produced local edits to push. */
async function applyServerNotes(notes: Note[]): Promise<number> {
  let merged = 0
  for (const note of notes) {
    if ((await applyServerNote(note)) === 'merged') merged++
  }
  return merged
}

async function getNotesCursor(): Promise<number | null> {
  const meta = await db.syncMeta.get(NOTES_SEQ_KEY)
  return meta ? Number(meta.value) : null
}

async function advanceNotesCursor(seq: number): Promise<void> {
  const current = (await getNotesCursor()) ?? 0
  if (seq > current) await db.syncMeta.put({ key: NOTES_SEQ_KEY, value: String(seq) })
}

/**
 * Pull note changes after our cursor. Returns the number of notes that were
 * merged with local edits (and so need pushing).
 */
export async function pullNotes(userId: string): Promise<number> {
  const cursor = await getNotesCursor()
  if (cursor === null) return reconcileNotes(userId)

  let after = cursor
  let merged = 0
  for (;;) {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('owner_id', userId)
      .gt('server_seq', after)
      .order('server_seq', { ascending: true })
      .limit(PULL_PAGE_SIZE)
    if (error) throw error

    const rows = (data ?? []) as Note[]
    merged += await applyServerNotes(rows)
    if (rows.length === 0) break
    after = Math.max(...rows.map((r) => r.server_seq ?? 0))
    await advanceNotesCursor(after)
    if (rows.length < PULL_PAGE_SIZE) break
  }
  return merged
}

/**
 * Compare every note's version with the server, fetch what differs, and drop
 * local notes deleted on the server. Also catches anything the seq cursor
 * skipped (a write that committed after a later seq had been pulled).
 */
export async function reconcileNotes(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('notes')
    .select('id, version, server_seq')
    .eq('owner_id', userId)
  if (error) throw error

  const manifest = (data ?? []) as { id: string; version: number; server_seq: number }[]
  const locals = await db.notes.where('owner_id').equals(userId).toArray()
  const localById = new Map(locals.map((n) => [n.id, n]))

  const stale = manifest
    .filter((m) => localById.get(m.id)?._serverVersion !== m.version || !localById.get(m.id)?._base)
    .map((m) => m.id)

  let merged = 0
  for (let i = 0; i < stale.length; i += 100) {
    const { data: rows, error: rowsError } = await supabase
      .from('notes')
      .select('*')
      .in('id', stale.slice(i, i + 100))
    if (rowsError) throw rowsError
    merged += await applyServerNotes((rows ?? []) as Note[])
  }

  // Deleted on the server: only drop copies that were on the server and have
  // no local edits (a note that's pending creation isn't in the manifest yet).
  const onServer = new Set(manifest.map((m) => m.id))
  const pendingIds = new Set(
    (await db.pendingChanges.where('entityType').equals('note').toArray()).map((p) => p.entityId)
  )
  for (const local of locals) {
    if (
      !onServer.has(local.id) &&
      local._serverVersion !== undefined &&
      local._syncStatus === 'synced' &&
      !pendingIds.has(local.id)
    ) {
      await db.notes.delete(local.id)
    }
  }

  const maxSeq = manifest.reduce((m, r) => Math.max(m, r.server_seq ?? 0), 0)
  await advanceNotesCursor(maxSeq)
  return merged
}

// Full sync - reconcile notes and pull all tags, note-tag links and folders
export async function fullSync(userId: string): Promise<number> {
  const merged = await reconcileNotes(userId)

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

  await db.transaction('rw', [db.tags, db.noteTags, db.folders], async () => {
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

  return merged
}

// Incremental sync - pull note changes since the last one we saw
export async function incrementalSync(userId: string): Promise<number> {
  return pullNotes(userId)
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

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
  choice: 'local' | 'server'
): Promise<void> {
  const serverNote = await fetchServerNote(noteId)

  if (choice === 'server') {
    if (serverNote) {
      await db.notes.put({
        ...serverNote,
        version: serverNote.version,
        _serverVersion: serverNote.version,
        _base: pickSyncFields(serverNote),
        _syncStatus: 'synced',
        _localUpdatedAt: serverNote.updated_at,
        _serverUpdatedAt: serverNote.updated_at,
      } as LocalNote)
    } else {
      // Deleted on the server - drop the local copy too
      await db.notes.delete(noteId)
    }
    await db.pendingChanges.where('entityId').equals(noteId).delete()
    return
  }

  // Keep ours: write all of our fields on top of the current server version
  const localNote = await db.notes.get(noteId)
  if (!localNote) return

  const fields = pickSyncFields(localNote)
  const payload: Record<string, unknown> = { ...fields }
  if (!serverNote) payload.created_at = localNote.created_at

  const { data, error } = await supabase.rpc('push_note', {
    p_id: noteId,
    p_base_version: serverNote?.version ?? null,
    p_fields: payload,
  })
  if (error) throw error

  const result = data as { status: 'ok' | 'conflict'; note: Note }
  if (result.status !== 'ok') {
    throw new Error('The note changed on the server again - please try again')
  }

  await applyPushed(noteId, fields, result.note)
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

// ---------------------------------------------------------------------------
// Tags, note-tag links, folders
// ---------------------------------------------------------------------------

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

