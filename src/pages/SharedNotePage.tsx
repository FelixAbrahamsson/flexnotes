import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, AlertCircle, Eye, Edit3 } from 'lucide-react'
import { getSharedNote, updateSharedNote } from '@/services/share'
import { TextEditor } from '@/components/notes/TextEditor'
import { ListEditor } from '@/components/notes/ListEditor'
import { MarkdownEditor } from '@/components/notes/MarkdownEditor'
import type { Note } from '@/types'

export function SharedNotePage() {
  const { token } = useParams<{ token: string }>()
  const [note, setNote] = useState<Note | null>(null)
  const [permission, setPermission] = useState<'read' | 'write'>('read')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Editable state
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  useEffect(() => {
    async function loadNote() {
      if (!token) {
        setError('Invalid share link')
        setLoading(false)
        return
      }

      const result = await getSharedNote(token)

      if ('error' in result) {
        setError(result.error)
      } else {
        setNote(result.note)
        setPermission(result.permission)
        setTitle(result.note.title || '')
        setContent(result.note.content)
      }

      setLoading(false)
    }

    loadNote()
  }, [token])

  const handleSave = useCallback(async () => {
    if (!token || !note || permission !== 'write') return

    const updates: Partial<Pick<Note, 'title' | 'content'>> = {}

    if (title !== (note.title || '')) {
      updates.title = title || null
    }
    if (content !== note.content) {
      updates.content = content
    }

    if (Object.keys(updates).length === 0) return

    setSaving(true)
    const { error } = await updateSharedNote(token, updates)

    if (!error) {
      setNote(prev => (prev ? { ...prev, ...updates } : prev))
      setLastSaved(new Date())
    }

    setSaving(false)
  }, [token, note, permission, title, content])

  // Auto-save for writable notes
  useEffect(() => {
    if (permission !== 'write') return

    const timer = setTimeout(handleSave, 1000)
    return () => clearTimeout(timer)
  }, [title, content, handleSave, permission])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error || !note) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Unable to access note
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error || 'Note not found'}</p>
          <Link to="/" className="btn btn-primary">
            Go to app
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm">Open app</span>
          </Link>

          <div className="flex items-center gap-2">
            {permission === 'write' ? (
              <div className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
                <Edit3 className="w-4 h-4" />
                <span className="text-sm">Can edit</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <Eye className="w-4 h-4" />
                <span className="text-sm">View only</span>
              </div>
            )}

            {saving && (
              <span className="text-xs text-gray-500 dark:text-gray-400">Saving...</span>
            )}
            {!saving && lastSaved && (
              <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          {/* Title */}
          {permission === 'write' ? (
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Title"
              className="w-full text-2xl font-semibold text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 border-0 focus:outline-none focus:ring-0 p-0 mb-4 bg-transparent"
            />
          ) : (
            title && (
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {title}
              </h1>
            )
          )}

          {/* Editor/Content */}
          {permission === 'write' ? (
            // Editable content
            <>
              {note.note_type === 'list' ? (
                <ListEditor content={content} onChange={setContent} />
              ) : note.note_type === 'markdown' ? (
                <MarkdownEditor
                  content={content}
                  onChange={setContent}
                  placeholder="Start typing..."
                />
              ) : (
                <TextEditor
                  content={content}
                  onChange={setContent}
                  placeholder="Start typing..."
                />
              )}
            </>
          ) : (
            // Read-only content
            <SharedNoteContent note={note} />
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
          Shared via Felix Notes
        </div>
      </main>
    </div>
  )
}

// Read-only note content display
function SharedNoteContent({ note }: { note: Note }) {
  if (note.note_type === 'list') {
    try {
      const parsed = JSON.parse(note.content)
      if (parsed.items && Array.isArray(parsed.items)) {
        return (
          <div className="space-y-2">
            {parsed.items.map((item: { id: string; text: string; checked: boolean }) => (
              <div key={item.id} className="flex items-start gap-3">
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    item.checked
                      ? 'bg-primary-600 border-primary-600'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {item.checked && (
                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12">
                      <path
                        fill="currentColor"
                        d="M10.28 2.28L4.5 8.06 1.72 5.28a.75.75 0 00-1.06 1.06l3.5 3.5a.75.75 0 001.06 0l6.5-6.5a.75.75 0 00-1.06-1.06z"
                      />
                    </svg>
                  )}
                </div>
                <span
                  className={`text-gray-900 dark:text-gray-100 ${item.checked ? 'line-through text-gray-400 dark:text-gray-500' : ''}`}
                >
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        )
      }
    } catch {
      // Fall through to plain text
    }
  }

  if (note.note_type === 'markdown') {
    return (
      <div
        className="prose prose-sm dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: note.content }}
      />
    )
  }

  // Plain text
  return (
    <div className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">{note.content}</div>
  )
}
