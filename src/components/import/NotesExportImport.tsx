import { useState, useRef } from 'react'
import { Download, Upload, Check, AlertCircle, Loader2 } from 'lucide-react'
import {
  buildExportData,
  downloadJson,
  parseExportFile,
  topologicalSortFolders,
} from '@/services/notesExport'
import { useNoteStore } from '@/stores/noteStore'
import { useTagStore } from '@/stores/tagStore'
import { useFolderStore } from '@/stores/folderStore'
import { useAuthStore } from '@/stores/authStore'
import { triggerSyncIfOnline } from '@/stores/syncStore'
import { generateLocalId } from '@/services/db'

interface ImportResult {
  notes: number
  tags: number
  folders: number
  errors: string[]
}

export function NotesExportImport() {
  const [exporting, setExporting] = useState(false)
  const [exportDone, setExportDone] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { user } = useAuthStore()

  const handleExport = () => {
    if (!user) return

    setExporting(true)
    setExportDone(false)

    try {
      const { notes } = useNoteStore.getState()
      const { tags, noteTags } = useTagStore.getState()
      const { folders } = useFolderStore.getState()

      const data = buildExportData(notes, tags, folders, noteTags)
      downloadJson(data)

      setExportDone(true)
      setTimeout(() => setExportDone(false), 3000)
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setImporting(true)
    setImportResult(null)
    setImportedCount(0)

    const errors: string[] = []
    let importedTags = 0
    let importedFolders = 0
    let importedNotes = 0

    try {
      const data = await parseExportFile(file)

      // 1. Import tags (dedup by name)
      const tagNameToId = new Map<string, string>()

      for (const exportedTag of data.tags) {
        const currentTags = useTagStore.getState().tags
        const existing = currentTags.find(
          t => t.name.toLowerCase() === exportedTag.name.toLowerCase()
        )

        if (existing) {
          tagNameToId.set(exportedTag.name, existing.id)
        } else {
          const newTag = await useTagStore.getState().createTag(
            exportedTag.name,
            exportedTag.color ?? undefined
          )
          if (newTag) {
            tagNameToId.set(exportedTag.name, newTag.id)
            importedTags++
          }
        }
      }

      // 2. Import folders (parents before children)
      const oldFolderIdToNewId = new Map<string, string>()
      const sortedFolders = topologicalSortFolders(data.folders)

      for (const exportedFolder of sortedFolders) {
        try {
          const newParentId = exportedFolder.parent_id
            ? oldFolderIdToNewId.get(exportedFolder.parent_id) ?? null
            : null

          const currentFolders = useFolderStore.getState().folders
          const existing = currentFolders.find(
            f =>
              f.name.toLowerCase() === exportedFolder.name.toLowerCase() &&
              f.parent_folder_id === newParentId
          )

          if (existing) {
            oldFolderIdToNewId.set(exportedFolder.id, existing.id)
          } else {
            const newFolder = await useFolderStore.getState().createFolder(
              exportedFolder.name,
              newParentId,
              exportedFolder.color ?? undefined
            )
            if (newFolder) {
              oldFolderIdToNewId.set(exportedFolder.id, newFolder.id)
              importedFolders++
            }
          }
        } catch {
          errors.push(`Failed to import folder "${exportedFolder.name}"`)
        }
      }

      // 3. Import notes
      for (const exportedNote of data.notes) {
        try {
          const noteId = generateLocalId()
          const folderId = exportedNote.folder_id
            ? oldFolderIdToNewId.get(exportedNote.folder_id) ?? null
            : null

          await useNoteStore.getState().createNoteFromImport({
            id: noteId,
            owner_id: user.id,
            title: exportedNote.title,
            content: exportedNote.content,
            note_type: exportedNote.note_type,
            is_pinned: exportedNote.is_pinned ?? false,
            is_archived: exportedNote.is_archived ?? false,
            is_deleted: false,
            deleted_at: null,
            folder_id: folderId,
            created_at: exportedNote.created_at,
            updated_at: exportedNote.updated_at,
            version: 1,
            sort_order: exportedNote.sort_order,
          })

          // Attach tags
          for (const tagName of exportedNote.tags) {
            const tagId = tagNameToId.get(tagName)
            if (tagId) {
              try {
                await useTagStore.getState().addTagToNote(noteId, tagId)
              } catch {
                // Non-critical
              }
            }
          }

          importedNotes++
          setImportedCount(importedNotes)
        } catch {
          errors.push(`Failed to import "${exportedNote.title || 'Untitled'}"`)
        }
      }

      if (importedNotes > 0 || importedTags > 0 || importedFolders > 0) {
        triggerSyncIfOnline()
      }

      setImportResult({ notes: importedNotes, tags: importedTags, folders: importedFolders, errors })
    } catch (error) {
      setImportResult({ notes: 0, tags: 0, folders: 0, errors: [(error as Error).message] })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const noteCount = useNoteStore(s => s.notes.filter(n => !n.is_deleted).length)

  return (
    <div className="space-y-3">
      {/* Export */}
      <button
        onClick={handleExport}
        disabled={exporting || noteCount === 0}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
      >
        {exportDone ? (
          <>
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-green-600 dark:text-green-400">Exported!</span>
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Export all notes ({noteCount})
          </>
        )}
      </button>

      {/* Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImport}
        className="hidden"
      />

      {!importing && !importResult && (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 dark:hover:border-primary-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <Upload className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Import from FlexNotes backup
          </span>
        </button>
      )}

      {importing && (
        <div className="flex items-center justify-center gap-3 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
          <Loader2 className="w-5 h-5 text-primary-600 dark:text-primary-400 animate-spin" />
          <span className="text-sm text-primary-700 dark:text-primary-300">
            Importing... {importedCount > 0 && `(${importedCount} notes)`}
          </span>
        </div>
      )}

      {importResult && !importing && (
        <div className="space-y-2">
          {(importResult.notes > 0 || importResult.tags > 0 || importResult.folders > 0) && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <Check className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <span className="text-sm text-green-700 dark:text-green-300">
                Imported {importResult.notes} notes, {importResult.tags} tags, {importResult.folders} folders
              </span>
            </div>
          )}

          {importResult.errors.length > 0 && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-red-700 dark:text-red-300">
                  {importResult.errors.length} error(s)
                </span>
              </div>
              <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                {importResult.errors.slice(0, 5).map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
                {importResult.errors.length > 5 && (
                  <li>... and {importResult.errors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          <button
            onClick={() => {
              setImportResult(null)
              setImportedCount(0)
            }}
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  )
}
