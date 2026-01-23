import { useState, useRef } from 'react'
import { FileArchive, Check, AlertCircle, Loader2 } from 'lucide-react'
import { parseGoogleKeepZip, convertImportedNote, type ImportResult } from '@/services/googleKeepImport'
import { useNoteStore } from '@/stores/noteStore'
import { useTagStore } from '@/stores/tagStore'
import { useAuthStore } from '@/stores/authStore'

export function GoogleKeepImport() {
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importedCount, setImportedCount] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { createNoteFromImport } = useNoteStore()
  const { createTag, addTagToNote, tags } = useTagStore()
  const { user } = useAuthStore()

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    // Reset state
    setImporting(true)
    setResult(null)
    setImportedCount(0)

    try {
      // Parse the zip file
      const parseResult = await parseGoogleKeepZip(file)
      setResult(parseResult)

      // Import each note
      let imported = 0
      for (const importedNote of parseResult.notes) {
        try {
          // Convert to our note format
          const note = convertImportedNote(importedNote, user.id)

          // Create the note
          const noteId = await createNoteFromImport(note)

          // Handle labels -> tags
          for (const label of importedNote.labels) {
            // Find or create tag
            let tag = tags.find(t => t.name.toLowerCase() === label.toLowerCase())
            if (!tag) {
              const newTag = await createTag(label)
              if (newTag) {
                tag = newTag
              }
            }
            if (tag) {
              await addTagToNote(noteId, tag.id)
            }
          }

          imported++
          setImportedCount(imported)
        } catch (error) {
          console.error('Failed to import note:', error)
          parseResult.errors.push(`Failed to import "${importedNote.title}"`)
        }
      }

      // Update result with final counts
      setResult({ ...parseResult })
    } catch (error) {
      setResult({
        notes: [],
        errors: [(error as Error).message],
        skipped: 0,
      })
    } finally {
      setImporting(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileSelect}
        className="hidden"
      />

      {!importing && !result && (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 dark:hover:border-primary-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <FileArchive className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Select Google Takeout ZIP file
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

      {result && !importing && (
        <div className="space-y-2">
          {importedCount > 0 && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-300">
                Successfully imported {importedCount} notes
              </span>
            </div>
          )}

          {result.skipped > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Skipped {result.skipped} files (index files, trashed notes, etc.)
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-red-700 dark:text-red-300">
                  {result.errors.length} error(s)
                </span>
              </div>
              <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                {result.errors.slice(0, 5).map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
                {result.errors.length > 5 && (
                  <li>... and {result.errors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          <button
            onClick={() => {
              setResult(null)
              setImportedCount(0)
            }}
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            Import another file
          </button>
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Export your notes from{' '}
        <a
          href="https://takeout.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 dark:text-primary-400 hover:underline"
        >
          Google Takeout
        </a>
        {' '}(select only Google Keep), then upload the ZIP file here.
      </p>
    </div>
  )
}
