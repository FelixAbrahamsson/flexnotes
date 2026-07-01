import { describe, it, expect, beforeEach, vi } from 'vitest'

// Route the sync service's supabase client to the in-memory fake server.
vi.mock('@/services/supabase', async () => {
  const { fakeSupabase } = await import('@/test/fakeSupabase')
  return { supabase: fakeSupabase }
})

import { serverTables, resetServer, forceNextError } from '@/test/fakeSupabase'
import { db, setLastSyncTime, getLastSyncTime, type LocalNote } from '@/services/db'
import {
  queueChange,
  processPendingChanges,
  fullSync,
  incrementalSync,
  resolveConflict,
} from '@/services/sync'

const USER = 'user-1'

function localNote(over: Partial<LocalNote> = {}): LocalNote {
  const now = '2026-01-01T00:00:00.000Z'
  return {
    id: 'n1',
    owner_id: USER,
    title: 'Note',
    content: '',
    note_type: 'text',
    is_pinned: false,
    is_archived: false,
    is_deleted: false,
    deleted_at: null,
    folder_id: null,
    created_at: now,
    updated_at: now,
    version: 1,
    sort_order: 0,
    _syncStatus: 'pending',
    _localUpdatedAt: now,
    ...over,
  }
}

beforeEach(async () => {
  await Promise.all([
    db.notes.clear(),
    db.tags.clear(),
    db.noteTags.clear(),
    db.folders.clear(),
    db.pendingChanges.clear(),
    db.syncMeta.clear(),
  ])
  resetServer()
})

describe('queueChange', () => {
  it('adds a pending change row', async () => {
    await queueChange('note', 'n1', 'update', { title: 'x' })
    const pending = await db.pendingChanges.toArray()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ entityType: 'note', entityId: 'n1', operation: 'update' })
  })
})

describe('processPendingChanges - notes', () => {
  it('creates the note on the server and marks it synced', async () => {
    await db.notes.put(localNote({ id: 'n1', title: 'Hello' }))
    await queueChange('note', 'n1', 'create')

    const result = await processPendingChanges(USER)

    expect(result.success).toBe(1)
    expect(serverTables.notes).toHaveLength(1)
    expect(serverTables.notes[0]).toMatchObject({ id: 'n1', title: 'Hello', owner_id: USER })
    // sync metadata must be stripped from the server payload
    expect(serverTables.notes[0]).not.toHaveProperty('_syncStatus')
    expect((await db.notes.get('n1'))?._syncStatus).toBe('synced')
    expect(await db.pendingChanges.count()).toBe(0)
  })

  it('creates the note when an update targets a note missing on the server', async () => {
    // Local update queued but the note was never created server-side.
    await db.notes.put(localNote({ id: 'n1', title: 'Local only' }))
    await queueChange('note', 'n1', 'update')

    const result = await processPendingChanges(USER)

    expect(result.success).toBe(1)
    expect(serverTables.notes).toHaveLength(1)
    expect(serverTables.notes[0]).toMatchObject({ id: 'n1', title: 'Local only' })
    expect((await db.notes.get('n1'))?._syncStatus).toBe('synced')
  })

  it('marks a conflict and keeps the pending change when the server version is newer', async () => {
    await db.notes.put(localNote({ id: 'n1', version: 1 }))
    serverTables.notes.push({ id: 'n1', owner_id: USER, version: 2, updated_at: '2026-01-02T00:00:00.000Z' })
    await queueChange('note', 'n1', 'update')

    const result = await processPendingChanges(USER)

    expect(result.failed).toBe(1)
    expect((await db.notes.get('n1'))?._syncStatus).toBe('conflict')
    const pending = await db.pendingChanges.toArray()
    expect(pending).toHaveLength(1)
    expect(pending[0].retryCount).toBe(1)
  })

  it('pushes the update when local version is not older than the server', async () => {
    await db.notes.put(localNote({ id: 'n1', version: 3, title: 'Newer local' }))
    serverTables.notes.push({ id: 'n1', owner_id: USER, version: 3, title: 'Old', updated_at: '2026-01-01T00:00:00.000Z' })
    await queueChange('note', 'n1', 'update')

    const result = await processPendingChanges(USER)

    expect(result.success).toBe(1)
    expect(serverTables.notes[0]).toMatchObject({ id: 'n1', title: 'Newer local' })
    expect((await db.notes.get('n1'))?._syncStatus).toBe('synced')
    expect(await db.pendingChanges.count()).toBe(0)
  })

  it('deletes the note from the server', async () => {
    serverTables.notes.push({ id: 'n1', owner_id: USER })
    await queueChange('note', 'n1', 'delete')

    await processPendingChanges(USER)

    expect(serverTables.notes).toHaveLength(0)
    expect(await db.pendingChanges.count()).toBe(0)
  })

  it('increments retryCount on failure and gives up after 5 retries', async () => {
    await db.notes.put(localNote({ id: 'n1' }))
    await queueChange('note', 'n1', 'create')
    // Bump the queued change to the retry ceiling, then force the insert to fail.
    const change = (await db.pendingChanges.toArray())[0]
    await db.pendingChanges.update(change.id, { retryCount: 5 })
    forceNextError('notes', 'insert', { message: 'boom' })

    const result = await processPendingChanges(USER)

    expect(result.failed).toBe(1)
    expect(await db.pendingChanges.count()).toBe(0) // gave up, change dropped
    expect(result.errors.some((e) => e.includes('Gave up'))).toBe(true)
  })
})

describe('fullSync', () => {
  it('pulls server notes into the local DB as synced', async () => {
    serverTables.notes.push(
      { id: 'a', owner_id: USER, title: 'A', version: 1, updated_at: '2026-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' },
      { id: 'b', owner_id: USER, title: 'B', version: 1, updated_at: '2026-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' }
    )

    await fullSync(USER)

    expect(await db.notes.count()).toBe(2)
    expect((await db.notes.get('a'))?._syncStatus).toBe('synced')
    expect(await getLastSyncTime('full')).not.toBeNull()
  })

  it('does not overwrite a locally pending note', async () => {
    await db.notes.put(localNote({ id: 'a', title: 'Local', _syncStatus: 'pending' }))
    serverTables.notes.push({ id: 'a', owner_id: USER, title: 'Server', version: 1, updated_at: '2026-01-02T00:00:00.000Z' })

    await fullSync(USER)

    expect((await db.notes.get('a'))?.title).toBe('Local')
  })

  it('does not overwrite a note whose local edit is newer than the server copy', async () => {
    await db.notes.put(
      localNote({ id: 'a', title: 'Local newer', _syncStatus: 'synced', _localUpdatedAt: '2026-02-01T00:00:00.000Z' })
    )
    serverTables.notes.push({ id: 'a', owner_id: USER, title: 'Server older', version: 1, updated_at: '2026-01-01T00:00:00.000Z' })

    await fullSync(USER)

    expect((await db.notes.get('a'))?.title).toBe('Local newer')
  })

  it('removes local tags that no longer exist on the server', async () => {
    await db.tags.put({ id: 't1', owner_id: USER, name: 'gone', color: '#fff', sort_order: 0, created_at: '2026-01-01T00:00:00.000Z', _syncStatus: 'synced', _localUpdatedAt: '2026-01-01T00:00:00.000Z' })

    await fullSync(USER) // server has no tags

    expect(await db.tags.get('t1')).toBeUndefined()
  })
})

describe('incrementalSync', () => {
  it('falls back to a full sync when there is no previous sync time', async () => {
    serverTables.notes.push({ id: 'a', owner_id: USER, title: 'A', version: 1, updated_at: '2026-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' })

    await incrementalSync(USER)

    expect(await db.notes.get('a')).toBeDefined()
  })

  it('flags a conflict when a pending local note also changed on the server', async () => {
    await setLastSyncTime('full', '2026-01-01T00:00:00.000Z')
    await db.notes.put(localNote({ id: 'a', _syncStatus: 'pending', _localUpdatedAt: '2026-01-02T00:00:00.000Z' }))
    serverTables.notes.push({ id: 'a', owner_id: USER, title: 'Server changed', version: 2, updated_at: '2026-01-03T00:00:00.000Z' })

    await incrementalSync(USER)

    expect((await db.notes.get('a'))?._syncStatus).toBe('conflict')
  })
})

describe('resolveConflict', () => {
  it('server choice overwrites local and clears pending changes', async () => {
    await db.notes.put(localNote({ id: 'n1', title: 'Local', _syncStatus: 'conflict' }))
    await queueChange('note', 'n1', 'update')
    serverTables.notes.push({ id: 'n1', owner_id: USER, title: 'Server wins', version: 5, updated_at: '2026-03-01T00:00:00.000Z' })

    await resolveConflict('n1', 'server', USER)

    const local = await db.notes.get('n1')
    expect(local?.title).toBe('Server wins')
    expect(local?._syncStatus).toBe('synced')
    expect(await db.pendingChanges.count()).toBe(0)
  })

  it('local choice upserts to the server, bumps version and clears pending', async () => {
    await db.notes.put(localNote({ id: 'n1', title: 'Local wins', version: 4, _syncStatus: 'conflict' }))
    await queueChange('note', 'n1', 'update')
    serverTables.notes.push({ id: 'n1', owner_id: USER, title: 'Server', version: 4 })

    await resolveConflict('n1', 'local', USER)

    expect(serverTables.notes[0]).toMatchObject({ id: 'n1', title: 'Local wins', version: 5 })
    const local = await db.notes.get('n1')
    expect(local?._syncStatus).toBe('synced')
    expect(local?.version).toBe(5)
    expect(await db.pendingChanges.count()).toBe(0)
  })
})
