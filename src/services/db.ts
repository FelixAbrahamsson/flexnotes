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
  }
}

export const db = new NotesDatabase()

// Helper to generate UUIDs locally
export function generateLocalId(): string {
  return crypto.randomUUID()
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
