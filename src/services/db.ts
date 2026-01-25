import Dexie, { type EntityTable } from 'dexie'
import type { Note, Tag, NoteTag, NoteImage } from '@/types'

// Extended types for local storage
export interface LocalNote extends Note {
  _syncStatus: 'synced' | 'pending' | 'conflict'
  _localUpdatedAt: string
  _serverUpdatedAt?: string
}

export interface LocalTag extends Tag {
  _syncStatus: 'synced' | 'pending'
  _localUpdatedAt: string
}

export interface LocalNoteTag extends NoteTag {
  _syncStatus: 'synced' | 'pending'
  _operation?: 'add' | 'remove'
}

export interface LocalNoteImage extends NoteImage {
  _syncStatus: 'synced' | 'pending'
  _localBlob?: Blob
}

export interface PendingChange {
  id: string
  entityType: 'note' | 'tag' | 'noteTag' | 'image'
  entityId: string
  operation: 'create' | 'update' | 'delete'
  data?: Record<string, unknown>
  timestamp: string
  retryCount: number
}

export interface SyncMeta {
  key: string
  value: string
}

class NotesDatabase extends Dexie {
  notes!: EntityTable<LocalNote, 'id'>
  tags!: EntityTable<LocalTag, 'id'>
  noteTags!: EntityTable<LocalNoteTag, 'note_id'>
  images!: EntityTable<LocalNoteImage, 'id'>
  pendingChanges!: EntityTable<PendingChange, 'id'>
  syncMeta!: EntityTable<SyncMeta, 'key'>

  constructor() {
    super('felix-notes')

    this.version(1).stores({
      notes: 'id, owner_id, is_archived, is_pinned, updated_at, _syncStatus',
      tags: 'id, owner_id, name, _syncStatus',
      noteTags: '[note_id+tag_id], note_id, tag_id, _syncStatus',
      images: 'id, note_id, _syncStatus',
      pendingChanges: 'id, entityType, entityId, timestamp',
      syncMeta: 'key',
    })

    // Version 2: Add is_deleted and deleted_at for trash
    this.version(2).stores({
      notes: 'id, owner_id, is_archived, is_pinned, is_deleted, deleted_at, updated_at, _syncStatus',
      tags: 'id, owner_id, name, _syncStatus',
      noteTags: '[note_id+tag_id], note_id, tag_id, _syncStatus',
      images: 'id, note_id, _syncStatus',
      pendingChanges: 'id, entityType, entityId, timestamp',
      syncMeta: 'key',
    }).upgrade(tx => {
      // Add is_deleted and deleted_at to existing notes
      return tx.table('notes').toCollection().modify(note => {
        note.is_deleted = note.is_deleted ?? false
        note.deleted_at = note.deleted_at ?? null
      })
    })

    // Version 3: Add sort_order for manual note ordering
    this.version(3).stores({
      notes: 'id, owner_id, is_archived, is_pinned, is_deleted, deleted_at, sort_order, _syncStatus',
      tags: 'id, owner_id, name, _syncStatus',
      noteTags: '[note_id+tag_id], note_id, tag_id, _syncStatus',
      images: 'id, note_id, _syncStatus',
      pendingChanges: 'id, entityType, entityId, timestamp',
      syncMeta: 'key',
    }).upgrade(tx => {
      // Add sort_order to existing notes based on updated_at (newest = lowest sort_order)
      return tx.table('notes').toCollection().modify((note) => {
        // Use negative timestamp so newer notes have lower sort_order (appear first)
        note.sort_order = note.sort_order ?? -new Date(note.updated_at).getTime()
      })
    })

    // Version 4: Add sort_order for manual tag ordering
    this.version(4).stores({
      notes: 'id, owner_id, is_archived, is_pinned, is_deleted, deleted_at, sort_order, _syncStatus',
      tags: 'id, owner_id, name, sort_order, _syncStatus',
      noteTags: '[note_id+tag_id], note_id, tag_id, _syncStatus',
      images: 'id, note_id, _syncStatus',
      pendingChanges: 'id, entityType, entityId, timestamp',
      syncMeta: 'key',
    }).upgrade(async tx => {
      // Add sort_order to existing tags based on alphabetical order
      const tags = await tx.table('tags').toArray()
      tags.sort((a, b) => a.name.localeCompare(b.name))
      for (let i = 0; i < tags.length; i++) {
        await tx.table('tags').update(tags[i].id, { sort_order: i })
      }
    })
  }
}

export const db = new NotesDatabase()

// Helper to generate UUIDs locally
export function generateLocalId(): string {
  // crypto.randomUUID() is only available in secure contexts (HTTPS/localhost)
  // Fallback for HTTP access over local network
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Helper to get current ISO timestamp
export function getCurrentTimestamp(): string {
  return new Date().toISOString()
}

// Clear all local data (for logout)
export async function clearLocalData(): Promise<void> {
  await db.notes.clear()
  await db.tags.clear()
  await db.noteTags.clear()
  await db.images.clear()
  await db.pendingChanges.clear()
  await db.syncMeta.clear()
}

// Get last sync timestamp for an entity type
export async function getLastSyncTime(entityType: string): Promise<string | null> {
  const meta = await db.syncMeta.get(`lastSync_${entityType}`)
  return meta?.value || null
}

// Set last sync timestamp
export async function setLastSyncTime(entityType: string, timestamp: string): Promise<void> {
  await db.syncMeta.put({ key: `lastSync_${entityType}`, value: timestamp })
}
