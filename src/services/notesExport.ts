import type { Note, Tag, Folder, NoteTag } from '@/types'

const EXPORT_VERSION = 1

export interface FlexNotesExport {
  version: number
  exported_at: string
  app: 'FlexNotes'
  notes: ExportedNote[]
  tags: ExportedTag[]
  folders: ExportedFolder[]
}

export interface ExportedNote {
  title: string | null
  content: string
  note_type: 'text' | 'list' | 'markdown'
  is_pinned: boolean
  is_archived: boolean
  created_at: string
  updated_at: string
  sort_order: number
  tags: string[]
  folder_id: string | null
}

export interface ExportedTag {
  name: string
  color: string | null
  sort_order: number
}

export interface ExportedFolder {
  id: string
  name: string
  color: string | null
  sort_order: number
  parent_id: string | null
}

export function buildExportData(
  notes: Note[],
  tags: Tag[],
  folders: Folder[],
  noteTags: NoteTag[]
): FlexNotesExport {
  const tagIdToName = new Map(tags.map(t => [t.id, t.name]))

  const noteTagsMap = new Map<string, string[]>()
  for (const nt of noteTags) {
    const tagName = tagIdToName.get(nt.tag_id)
    if (tagName) {
      const existing = noteTagsMap.get(nt.note_id) || []
      existing.push(tagName)
      noteTagsMap.set(nt.note_id, existing)
    }
  }

  const exportedNotes: ExportedNote[] = notes
    .filter(n => !n.is_deleted)
    .map(n => ({
      title: n.title,
      content: n.content,
      note_type: n.note_type,
      is_pinned: n.is_pinned,
      is_archived: n.is_archived,
      created_at: n.created_at,
      updated_at: n.updated_at,
      sort_order: n.sort_order,
      tags: noteTagsMap.get(n.id) || [],
      folder_id: n.folder_id,
    }))

  const exportedFolders: ExportedFolder[] = folders.map(f => ({
    id: f.id,
    name: f.name,
    color: f.color,
    sort_order: f.sort_order,
    parent_id: f.parent_folder_id,
  }))

  const exportedTags: ExportedTag[] = tags.map(t => ({
    name: t.name,
    color: t.color,
    sort_order: t.sort_order,
  }))

  return {
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    app: 'FlexNotes',
    notes: exportedNotes,
    tags: exportedTags,
    folders: exportedFolders,
  }
}

export function downloadJson(data: FlexNotesExport): void {
  const json = JSON.stringify(data)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  const date = new Date().toISOString().split('T')[0]
  a.download = `flexnotes-export-${date}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function validateExportFile(data: unknown): data is FlexNotesExport {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  if (obj.app !== 'FlexNotes') return false
  if (typeof obj.version !== 'number') return false
  if (!Array.isArray(obj.notes)) return false
  if (!Array.isArray(obj.tags)) return false
  if (!Array.isArray(obj.folders)) return false
  return true
}

export async function parseExportFile(file: File): Promise<FlexNotesExport> {
  const text = await file.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON file')
  }

  if (!validateExportFile(data)) {
    throw new Error('Not a valid FlexNotes export file')
  }

  return data
}

/** Sort folders so parents come before children */
export function topologicalSortFolders<T extends { id: string; parent_id: string | null }>(
  folders: T[]
): T[] {
  const result: T[] = []
  const visited = new Set<string>()
  const folderMap = new Map(folders.map(f => [f.id, f]))

  function visit(folder: T) {
    if (visited.has(folder.id)) return
    visited.add(folder.id)

    if (folder.parent_id) {
      const parent = folderMap.get(folder.parent_id)
      if (parent) visit(parent)
    }

    result.push(folder)
  }

  for (const folder of folders) {
    visit(folder)
  }

  return result
}
