import { describe, it, expect, beforeEach, vi } from 'vitest'

// noteStore talks to Supabase (mocked in-memory), auth + sync stores (mocked)
// and IndexedDB via Dexie (real, backed by fake-indexeddb).
vi.mock('@/services/supabase', async () => {
  const { fakeSupabase } = await import('@/test/fakeSupabase')
  return { supabase: fakeSupabase }
})
vi.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'user-1' } }) },
}))
vi.mock('@/stores/syncStore', () => ({
  useSyncStore: { getState: () => ({ refreshPendingCount: vi.fn(), sync: vi.fn() }) },
  triggerSyncIfOnline: vi.fn(),
}))

import { db, type LocalNote } from '@/services/db'
import { useNoteStore } from '@/stores/noteStore'

const USER = 'user-1'
const DAY = 24 * 60 * 60 * 1000

function seedNote(over: Partial<LocalNote> = {}): LocalNote {
  const now = new Date().toISOString()
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
    _syncStatus: 'synced',
    _localUpdatedAt: now,
    ...over,
  }
}

beforeEach(async () => {
  await Promise.all([db.notes.clear(), db.pendingChanges.clear(), db.syncMeta.clear()])
  useNoteStore.setState({ notes: [], loading: false, error: null })
})

describe('createNote', () => {
  it('persists locally as pending but does NOT queue a change until first edit', async () => {
    const note = await useNoteStore.getState().createNote({ title: 'Fresh' })

    expect(note).not.toBeNull()
    const stored = await db.notes.get(note!.id)
    expect(stored?._syncStatus).toBe('pending')
    // The no-queue-until-edit behavior prevents empty notes racing to the server.
    expect(await db.pendingChanges.count()).toBe(0)
  })
})

describe('trashNote', () => {
  it('soft-deletes, unpins, and queues an update change', async () => {
    await db.notes.put(seedNote({ id: 'n1', is_pinned: true }))
    await useNoteStore.getState().loadFromLocal()

    await useNoteStore.getState().trashNote('n1')

    const stored = await db.notes.get('n1')
    expect(stored?.is_deleted).toBe(true)
    expect(stored?.deleted_at).toBeTruthy()
    expect(stored?.is_pinned).toBe(false)
    expect(stored?.version).toBe(2)
    expect(stored?._syncStatus).toBe('pending')

    const pending = await db.pendingChanges.toArray()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ entityType: 'note', entityId: 'n1', operation: 'update' })
    expect(pending[0].data).toMatchObject({ is_deleted: true, is_pinned: false })
  })
})

describe('restoreNote', () => {
  it('clears the deleted flags and queues an update', async () => {
    await db.notes.put(seedNote({ id: 'n1', is_deleted: true, deleted_at: new Date().toISOString() }))
    await useNoteStore.getState().loadFromLocal()

    await useNoteStore.getState().restoreNote('n1')

    const stored = await db.notes.get('n1')
    expect(stored?.is_deleted).toBe(false)
    expect(stored?.deleted_at).toBeNull()
    expect((await db.pendingChanges.toArray())[0].data).toMatchObject({ is_deleted: false })
  })
})

describe('updateNote', () => {
  it('applies the update, bumps the version and queues a change', async () => {
    await db.notes.put(seedNote({ id: 'n1', title: 'Before', version: 4 }))
    await useNoteStore.getState().loadFromLocal()

    await useNoteStore.getState().updateNote('n1', { title: 'After' })

    const stored = await db.notes.get('n1')
    expect(stored?.title).toBe('After')
    expect(stored?.version).toBe(5)
    expect(stored?._syncStatus).toBe('pending')
    const pending = await db.pendingChanges.toArray()
    expect(pending[0].data).toMatchObject({ title: 'After', version: 5 })
  })
})

describe('cleanupOldTrash', () => {
  it('permanently deletes trash older than the retention window, keeping recent trash and active notes', async () => {
    const old = new Date(Date.now() - 40 * DAY).toISOString()
    const recent = new Date(Date.now() - 5 * DAY).toISOString()
    await db.notes.bulkPut([
      seedNote({ id: 'old', is_deleted: true, deleted_at: old }),
      seedNote({ id: 'recent', is_deleted: true, deleted_at: recent }),
      seedNote({ id: 'active', is_deleted: false }),
    ])
    await useNoteStore.getState().loadFromLocal()

    await useNoteStore.getState().cleanupOldTrash()

    expect(await db.notes.get('old')).toBeUndefined()
    expect(await db.notes.get('recent')).toBeDefined()
    expect(await db.notes.get('active')).toBeDefined()
    // The purge of a previously-synced note is queued as a server delete.
    const deletes = (await db.pendingChanges.toArray()).filter((c) => c.operation === 'delete')
    expect(deletes.map((d) => d.entityId)).toEqual(['old'])
  })

  it('does nothing when there is no old trash', async () => {
    await db.notes.put(seedNote({ id: 'active', is_deleted: false }))
    await useNoteStore.getState().loadFromLocal()

    await useNoteStore.getState().cleanupOldTrash()

    expect(await db.notes.count()).toBe(1)
  })
})
