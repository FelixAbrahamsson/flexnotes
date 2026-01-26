export type NoteType = 'text' | 'list' | 'markdown'

export interface Note {
  id: string
  owner_id: string
  title: string | null
  content: string
  note_type: NoteType
  is_pinned: boolean
  is_archived: boolean
  is_deleted: boolean
  deleted_at: string | null
  folder_id: string | null
  created_at: string
  updated_at: string
  version: number
  sort_order: number
  // Local-only fields
  _pendingSync?: boolean
  _localUpdatedAt?: string
}

export interface Folder {
  id: string
  owner_id: string
  name: string
  color: string | null
  parent_folder_id: string | null  // null = root level
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Tag {
  id: string
  owner_id: string
  name: string
  color: string | null
  sort_order: number
  created_at: string
}

export interface NoteTag {
  note_id: string
  tag_id: string
}

export interface NoteImage {
  id: string
  note_id: string
  storage_path: string
  position: number
  created_at: string
  // Local-only
  _localBlob?: Blob
  _pendingUpload?: boolean
}

export interface NoteShare {
  id: string
  note_id: string
  share_token: string
  permission: 'read' | 'write'
  created_at: string
  expires_at: string | null
}

export interface Profile {
  id: string
  display_name: string | null
  created_at: string
}

export interface ListItem {
  id: string
  text: string
  checked: boolean
  indent?: number // 0 = no indent, 1 = one level, etc.
}

export interface ListContent {
  items: ListItem[]
}

// For creating new notes
export interface NewNote {
  title?: string
  content?: string
  note_type?: NoteType
  folder_id?: string | null
}
