import { describe, it, expect, beforeEach, vi } from 'vitest'

// Route the sync service's supabase client to the in-memory fake server.
vi.mock('@/services/supabase', async () => {
  const { fakeSupabase } = await import('@/test/fakeSupabase')
  return { supabase: fakeSupabase }
})

import {
  serverTables,
  resetServer,
  forceNextError,
  seedServerNote,
  editServerNote,
  rpcHooks,
  setMaxRows,
} from '@/test/fakeSupabase'
import { db, type LocalNote } from '@/services/db'
import { pickSyncFields } from '@/services/noteMerge'
import {
  queueChange,
  processPendingChanges,
  pullNotes,
  reconcileNotes,
  fullSync,
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

/** Local copy of a server row as it looks right after syncing it. */
async function syncedCopy(row: Record<string, unknown>, over: Partial<LocalNote> = {}) {
  const note = { ...(row as unknown as LocalNote) }
  await db.notes.put({
    ...note,
    _syncStatus: 'synced',
    _localUpdatedAt: note.updated_at,
    _serverVersion: note.version,
    _base: pickSyncFields(note),
    ...over,
  })
}

/** Simulate a local edit (what persistNoteUpdate does). */
async function editLocally(id: string, changes: Partial<LocalNote>) {
  await db.notes.update(id, { ...changes, _syncStatus: 'pending' })
  await queueChange('note', id, 'update')
}

const serverNote = (id: string) => serverTables.notes.find((r) => r.id === id)!

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

describe('push', () => {
  it('creates a new note on the server and records the server version as base', async () => {
    await db.notes.put(localNote({ id: 'n1', title: 'Hello' }))
    await queueChange('note', 'n1', 'update')

    const result = await processPendingChanges(USER)

    expect(result.success).toBe(1)
    expect(serverNote('n1')).toMatchObject({ title: 'Hello', version: 1 })
    expect(serverNote('n1')).not.toHaveProperty('_syncStatus')
    const local = await db.notes.get('n1')
    expect(local).toMatchObject({ _syncStatus: 'synced', _serverVersion: 1, version: 1 })
    expect(local?._base?.title).toBe('Hello')
    expect(await db.pendingChanges.count()).toBe(0)
  })

  it('sends only changed fields, so a concurrent change to another field survives', async () => {
    const row = seedServerNote({ id: 'n1', title: 'T', is_pinned: false })
    await syncedCopy(row)
    await editLocally('n1', { title: 'T edited' })
    // Another device pins it, but our base is still v1 -> merged, not overwritten
    editServerNote('n1', { is_pinned: true })

    await processPendingChanges(USER)

    expect(serverNote('n1')).toMatchObject({ title: 'T edited', is_pinned: true, version: 3 })
    expect(await db.notes.get('n1')).toMatchObject({ _syncStatus: 'synced', is_pinned: true })
  })

  it('collapses several queued edits of one note into one push', async () => {
    const row = seedServerNote({ id: 'n1', title: 'a' })
    await syncedCopy(row)
    await editLocally('n1', { title: 'ab' })
    await editLocally('n1', { title: 'abc' })

    await processPendingChanges(USER)

    expect(serverNote('n1')).toMatchObject({ title: 'abc', version: 2 })
    expect(await db.pendingChanges.count()).toBe(0)
  })

  it('auto-merges when another device edited a different paragraph', async () => {
    const row = seedServerNote({ id: 'n1', content: '<p>one</p><p>two</p>' })
    await syncedCopy(row)
    editServerNote('n1', { content: '<p>one</p><p>two from B</p>' })
    await editLocally('n1', { content: '<p>one from A</p><p>two</p>' })

    await processPendingChanges(USER)

    expect(serverNote('n1').content).toBe('<p>one from A</p><p>two from B</p>')
    expect(await db.notes.get('n1')).toMatchObject({
      content: '<p>one from A</p><p>two from B</p>',
      _syncStatus: 'synced',
    })
  })

  it('marks a conflict (and keeps the change queued) when both edited the same paragraph', async () => {
    const row = seedServerNote({ id: 'n1', content: '<p>one</p>' })
    await syncedCopy(row)
    editServerNote('n1', { content: '<p>one from B</p>' })
    await editLocally('n1', { content: '<p>one from A</p>' })

    const result = await processPendingChanges(USER)

    expect(result.failed).toBe(0)
    expect(serverNote('n1').content).toBe('<p>one from B</p>') // not overwritten
    const local = await db.notes.get('n1')
    expect(local).toMatchObject({ content: '<p>one from A</p>', _syncStatus: 'conflict' })
    expect(await db.pendingChanges.count()).toBe(1)
  })

  it('leaves pending changes for conflicted notes untouched', async () => {
    await db.notes.put(localNote({ id: 'n1', _syncStatus: 'conflict', _serverVersion: 1 }))
    await queueChange('note', 'n1', 'update')
    const change = (await db.pendingChanges.toArray())[0]
    await db.pendingChanges.update(change.id, { retryCount: 5 })

    const result = await processPendingChanges(USER)

    expect(result.failed).toBe(0)
    expect(await db.pendingChanges.count()).toBe(1) // not dropped at the retry ceiling
  })

  it('keeps edits made while a push was in flight pending', async () => {
    const row = seedServerNote({ id: 'n1', title: 'a' })
    await syncedCopy(row)
    await editLocally('n1', { title: 'ab' })
    // User keeps typing while the request is on the wire
    rpcHooks.beforePushNote = () => {
      void db.notes.update('n1', { title: 'abc' })
    }

    await processPendingChanges(USER)

    expect(serverNote('n1').title).toBe('ab')
    const local = await db.notes.get('n1')
    expect(local).toMatchObject({ title: 'abc', _serverVersion: 2, _syncStatus: 'pending' })
    expect(local?._base?.title).toBe('ab') // next push sends only the newer edit
  })

  it('re-creates a note deleted on another device with all its fields, keeping local edits', async () => {
    const row = seedServerNote({ id: 'n1', title: 'T', content: '<p>body</p>', note_type: 'markdown', folder_id: 'f1' })
    await syncedCopy(row)
    serverTables.notes = [] // permanently deleted on device B
    await editLocally('n1', { is_pinned: true }) // A only pinned it

    await processPendingChanges(USER)

    expect(serverNote('n1')).toMatchObject({
      title: 'T',
      content: '<p>body</p>',
      note_type: 'markdown',
      folder_id: 'f1',
      is_pinned: true,
    })
    expect(await db.notes.get('n1')).toMatchObject({ content: '<p>body</p>', _syncStatus: 'synced' })
  })

  it('deletes the note from the server', async () => {
    seedServerNote({ id: 'n1' })
    await queueChange('note', 'n1', 'delete')

    await processPendingChanges(USER)

    expect(serverTables.notes).toHaveLength(0)
    expect(await db.pendingChanges.count()).toBe(0)
  })

  it('increments retryCount on failure and gives up after 5 retries', async () => {
    await db.notes.put(localNote({ id: 'n1' }))
    await queueChange('note', 'n1', 'update')
    const change = (await db.pendingChanges.toArray())[0]
    await db.pendingChanges.update(change.id, { retryCount: 5 })
    forceNextError('rpc', 'push_note', { message: 'boom' })

    const result = await processPendingChanges(USER)

    expect(result.failed).toBe(1)
    expect(await db.pendingChanges.count()).toBe(0) // gave up, change dropped
    expect(result.errors.some((e) => e.includes('Gave up'))).toBe(true)
  })
})

describe('pull', () => {
  it('first pull reconciles everything and sets the cursor', async () => {
    seedServerNote({ id: 'a', title: 'A' })
    seedServerNote({ id: 'b', title: 'B' })

    await pullNotes(USER)

    expect(await db.notes.count()).toBe(2)
    expect(await db.notes.get('a')).toMatchObject({ _syncStatus: 'synced', _serverVersion: 1 })
    expect((await db.syncMeta.get('notesSeq'))?.value).toBe(String(serverNote('b').server_seq))
  })

  it('pulls changes after the cursor regardless of device clocks', async () => {
    const row = seedServerNote({ id: 'a', title: 'A' })
    await syncedCopy(row)
    await reconcileNotes(USER)
    // Another device with a clock far in the past edits the note
    editServerNote('a', { title: 'A from B' })
    serverNote('a').updated_at = '2001-01-01T00:00:00.000Z'

    await pullNotes(USER)

    expect((await db.notes.get('a'))?.title).toBe('A from B')
  })

  it('does not treat our own pushed write echoing back as a change', async () => {
    const row = seedServerNote({ id: 'a', title: 'A' })
    await syncedCopy(row)
    await reconcileNotes(USER)
    await editLocally('a', { title: 'AB' })
    await processPendingChanges(USER)
    await editLocally('a', { title: 'ABC' }) // still typing

    await pullNotes(USER)

    expect(await db.notes.get('a')).toMatchObject({ title: 'ABC', _syncStatus: 'pending' })
  })

  it('merges a remote edit into a note with unpushed local edits', async () => {
    const row = seedServerNote({
      id: 'a',
      note_type: 'list',
      content: JSON.stringify({ items: [{ id: 'i1', text: 'milk', checked: false, indent: 0 }] }),
    })
    await syncedCopy(row)
    await reconcileNotes(USER)
    editServerNote('a', {
      content: JSON.stringify({
        items: [
          { id: 'i1', text: 'milk', checked: true, indent: 0 },
          { id: 'i2', text: 'eggs', checked: false, indent: 0 },
        ],
      }),
    })
    await editLocally('a', {
      content: JSON.stringify({ items: [{ id: 'i1', text: 'oat milk', checked: false, indent: 0 }] }),
    })

    const merged = await pullNotes(USER)

    expect(merged).toBe(1)
    const items = JSON.parse((await db.notes.get('a'))!.content).items
    expect(items).toEqual([
      { id: 'i1', text: 'oat milk', checked: true, indent: 0 },
      { id: 'i2', text: 'eggs', checked: false, indent: 0 },
    ])
    // and it pushes cleanly on top of the server version
    await processPendingChanges(USER)
    expect(JSON.parse(serverNote('a').content as string).items).toEqual(items)
  })

  it('does not overwrite a conflicted note', async () => {
    const row = seedServerNote({ id: 'a', title: 'Server' })
    await syncedCopy(row, { title: 'Local', _syncStatus: 'conflict' })
    await reconcileNotes(USER)
    editServerNote('a', { title: 'Server again' })

    await pullNotes(USER)

    expect((await db.notes.get('a'))?.title).toBe('Local')
  })
})

describe('reconcileNotes', () => {
  it('drops local copies of notes deleted on the server, but not unpushed new notes', async () => {
    const row = seedServerNote({ id: 'gone' })
    await syncedCopy(row)
    serverTables.notes = []
    await db.notes.put(localNote({ id: 'new-local' })) // never pushed

    await reconcileNotes(USER)

    expect(await db.notes.get('gone')).toBeUndefined()
    expect(await db.notes.get('new-local')).toBeDefined()
  })

  it('pages through the manifest instead of deleting notes past the row cap', async () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) await syncedCopy(seedServerNote({ id }))
    setMaxRows(2) // server returns at most 2 rows per request

    await reconcileNotes(USER)

    expect(await db.notes.count()).toBe(5)
  })

  it('does not skip a live note when another note is deleted between manifest pages', async () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) await syncedCopy(seedServerNote({ id }))
    setMaxRows(2)
    // Device B deletes 'a' right after the first page (a, b) was returned
    let calls = 0
    const origFrom = (await import('@/test/fakeSupabase')).fakeSupabase.from
    const spy = vi
      .spyOn((await import('@/test/fakeSupabase')).fakeSupabase, 'from')
      .mockImplementation((table: string) => {
        if (table === 'notes' && calls++ === 1) {
          serverTables.notes = serverTables.notes.filter((r) => r.id !== 'a')
        }
        return origFrom(table)
      })

    await reconcileNotes(USER)
    spy.mockRestore()

    // With offset paging, 'c' shifted into the already-read range and was
    // dropped as "deleted". 'a' was read before its deletion, so it stays
    // until the next reconcile.
    expect((await db.notes.toArray()).map((n) => n.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('catches a change the seq cursor skipped', async () => {
    const row = seedServerNote({ id: 'a', title: 'A' })
    await syncedCopy(row)
    editServerNote('a', { title: 'A2' })
    // Cursor already past this write (it committed after a later seq was seen)
    await db.syncMeta.put({ key: 'notesSeq', value: String(9999) })

    await pullNotes(USER)
    expect((await db.notes.get('a'))?.title).toBe('A') // incremental missed it

    await reconcileNotes(USER)
    expect((await db.notes.get('a'))?.title).toBe('A2')
  })
})

describe('the reported scenario: edit on B, then quickly on A', () => {
  it('keeps both edits when A types before its pull arrives', async () => {
    // Both devices synced the note
    const row = seedServerNote({ id: 'n', content: '<p>shopping</p><p>notes</p>' })
    await syncedCopy(row)
    await reconcileNotes(USER)

    // B edits the second paragraph
    editServerNote('n', { content: '<p>shopping</p><p>notes from B</p>' })

    // A comes back and edits the first paragraph before pulling
    await editLocally('n', { content: '<p>shopping list</p><p>notes</p>' })

    // A's sync: push (server moved on -> merge -> push merged)
    await processPendingChanges(USER)

    expect(serverNote('n').content).toBe('<p>shopping list</p><p>notes from B</p>')
    expect((await db.notes.get('n'))?.content).toBe('<p>shopping list</p><p>notes from B</p>')
  })
})

describe('fullSync', () => {
  it('reconciles notes and removes local tags that no longer exist on the server', async () => {
    seedServerNote({ id: 'a', title: 'A' })
    await db.tags.put({ id: 't1', owner_id: USER, name: 'gone', color: '#fff', sort_order: 0, created_at: '2026-01-01T00:00:00.000Z', _syncStatus: 'synced', _localUpdatedAt: '2026-01-01T00:00:00.000Z' })

    await fullSync(USER)

    expect(await db.notes.get('a')).toBeDefined()
    expect(await db.tags.get('t1')).toBeUndefined()
  })
})

describe('resolveConflict', () => {
  it('server choice overwrites local and clears pending changes', async () => {
    const row = seedServerNote({ id: 'n1', title: 'Server wins', version: 5 })
    await db.notes.put(localNote({ id: 'n1', title: 'Local', _syncStatus: 'conflict', _serverVersion: 3 }))
    await queueChange('note', 'n1', 'update')

    await resolveConflict('n1', 'server')

    const local = await db.notes.get('n1')
    expect(local).toMatchObject({ title: 'Server wins', _syncStatus: 'synced', _serverVersion: row.version })
    expect(await db.pendingChanges.count()).toBe(0)
  })

  it('local choice writes ours on top of the current server version', async () => {
    seedServerNote({ id: 'n1', title: 'Server', version: 7 })
    await db.notes.put(localNote({ id: 'n1', title: 'Local wins', _syncStatus: 'conflict', _serverVersion: 2 }))
    await queueChange('note', 'n1', 'update')

    await resolveConflict('n1', 'local')

    expect(serverNote('n1')).toMatchObject({ title: 'Local wins', version: 8 })
    expect(await db.notes.get('n1')).toMatchObject({ _syncStatus: 'synced', _serverVersion: 8 })
    expect(await db.pendingChanges.count()).toBe(0)
  })
})
