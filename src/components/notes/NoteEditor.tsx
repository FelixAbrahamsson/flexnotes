import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X,
  Pin,
  Archive,
  Trash2,
  MoreVertical,
  Type,
  List,
  FileText,
  Tag,
  ImagePlus,
  Share2,
} from 'lucide-react'
import { useNoteStore } from '@/stores/noteStore'
import { useTagStore } from '@/stores/tagStore'
import { useImageStore } from '@/stores/imageStore'
import { TextEditor } from './TextEditor'
import { ListEditor } from './ListEditor'
import { MarkdownEditor } from './MarkdownEditor'
import { TagBadge } from '@/components/tags/TagBadge'
import { TagPicker } from '@/components/tags/TagPicker'
import { ImageGallery, ImageViewer } from '@/components/images/ImageGallery'
import { ShareModal } from '@/components/sharing/ShareModal'
import { processImage } from '@/services/imageProcessor'
import type { NoteType } from '@/types'

interface NoteEditorProps {
  noteId: string
  onClose: () => void
}

export function NoteEditor({ noteId: _noteId, onClose }: NoteEditorProps) {
  const { getActiveNote, updateNote, deleteNote } = useNoteStore()
  const { getTagsForNote, removeTagFromNote } = useTagStore()
  const { fetchImagesForNote, uploadImage, getImageUrl, uploading } = useImageStore()
  const note = getActiveNote()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [viewingImage, setViewingImage] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const noteTags = note ? getTagsForNote(note.id) : []

  // Fetch images when note opens
  useEffect(() => {
    if (note) {
      fetchImagesForNote(note.id)
    }
  }, [note, fetchImagesForNote])

  useEffect(() => {
    if (note) {
      setTitle(note.title || '')
      setContent(note.content)
    }
  }, [note])

  const handleSave = useCallback(() => {
    if (!note) return
    const updates: Record<string, unknown> = {}

    if (title !== (note.title || '')) {
      updates.title = title || null
    }
    if (content !== note.content) {
      updates.content = content
    }

    if (Object.keys(updates).length > 0) {
      updateNote(note.id, updates)
    }
  }, [note, title, content, updateNote])

  // Auto-save on changes
  useEffect(() => {
    const timer = setTimeout(handleSave, 500)
    return () => clearTimeout(timer)
  }, [handleSave])

  const handleClose = () => {
    handleSave()
    onClose()
  }

  const handleTogglePin = () => {
    if (!note) return
    updateNote(note.id, { is_pinned: !note.is_pinned })
  }

  const handleToggleArchive = () => {
    if (!note) return
    updateNote(note.id, { is_archived: !note.is_archived })
    onClose()
  }

  const handleDelete = () => {
    if (!note) return
    if (window.confirm('Delete this note? This cannot be undone.')) {
      deleteNote(note.id)
      onClose()
    }
  }

  const handleChangeType = (newType: NoteType) => {
    if (!note) return

    let newContent = content

    // Convert content between types
    if (note.note_type === 'list' && newType !== 'list') {
      // Convert list to text
      try {
        const parsed = JSON.parse(content)
        if (parsed.items && Array.isArray(parsed.items)) {
          newContent = parsed.items
            .map((item: { text: string }) => item.text)
            .join('\n')
        }
      } catch {
        // Keep as-is
      }
    } else if (note.note_type !== 'list' && newType === 'list') {
      // Convert text to list (strip HTML for markdown)
      const plainText = content.replace(/<[^>]*>/g, '\n')
      const lines = plainText.split('\n').filter(line => line.trim())
      newContent = JSON.stringify({
        items: lines.map((text, i) => ({
          id: `item-${i}-${Date.now()}`,
          text: text.trim(),
          checked: false,
        }))
      })
    }

    updateNote(note.id, { note_type: newType, content: newContent })
    setContent(newContent)
    setShowTypeMenu(false)
  }

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || !note) return

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue

      try {
        // Process and upload
        await processImage(file) // Validate first
        const image = await uploadImage(note.id, file)

        if (image && note.note_type === 'markdown') {
          // Insert into markdown editor
          const url = getImageUrl(image.storage_path)
          const newContent = content + `\n\n![](${url})\n`
          setContent(newContent)
        }
      } catch (error) {
        console.error('Image upload failed:', error)
      }
    }
  }

  const handleImageButtonClick = () => {
    fileInputRef.current?.click()
  }

  if (!note) {
    return null
  }

  const showImageGallery = note.note_type !== 'list'

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={handleClose}>
      <div
        className="absolute inset-x-0 bottom-0 top-0 sm:inset-4 sm:top-auto sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:max-w-2xl sm:rounded-xl bg-white shadow-xl flex flex-col max-h-full sm:max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="btn btn-ghost p-2 -ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            {/* Image upload button (for text/markdown) */}
            {note.note_type !== 'list' && (
              <button
                onClick={handleImageButtonClick}
                disabled={uploading}
                className="btn btn-ghost p-2"
                title="Add image"
              >
                <ImagePlus className={`w-4 h-4 ${uploading ? 'animate-pulse' : ''}`} />
              </button>
            )}

            {/* Note type selector */}
            <div className="relative">
              <button
                onClick={() => setShowTypeMenu(!showTypeMenu)}
                className="btn btn-ghost p-2 text-xs font-medium text-gray-500"
              >
                {note.note_type === 'text' && <Type className="w-4 h-4" />}
                {note.note_type === 'list' && <List className="w-4 h-4" />}
                {note.note_type === 'markdown' && <FileText className="w-4 h-4" />}
              </button>

              {showTypeMenu && (
                <>
                  <div className="fixed inset-0" onClick={() => setShowTypeMenu(false)} />
                  <div className="absolute right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                    <button
                      onClick={() => handleChangeType('text')}
                      className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-gray-50 ${note.note_type === 'text' ? 'text-primary-600' : 'text-gray-700'}`}
                    >
                      <Type className="w-4 h-4" />
                      Text
                    </button>
                    <button
                      onClick={() => handleChangeType('list')}
                      className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-gray-50 ${note.note_type === 'list' ? 'text-primary-600' : 'text-gray-700'}`}
                    >
                      <List className="w-4 h-4" />
                      List
                    </button>
                    <button
                      onClick={() => handleChangeType('markdown')}
                      className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-gray-50 ${note.note_type === 'markdown' ? 'text-primary-600' : 'text-gray-700'}`}
                    >
                      <FileText className="w-4 h-4" />
                      Markdown
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={handleTogglePin}
              className={`btn btn-ghost p-2 ${note.is_pinned ? 'text-primary-600' : ''}`}
              title={note.is_pinned ? 'Unpin' : 'Pin'}
            >
              <Pin className={`w-5 h-5 ${note.is_pinned ? 'fill-current' : ''}`} />
            </button>

            {/* More menu */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="btn btn-ghost p-2"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        setShowShareModal(true)
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full"
                    >
                      <Share2 className="w-4 h-4" />
                      Share
                    </button>
                    <button
                      onClick={handleToggleArchive}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full"
                    >
                      <Archive className="w-4 h-4" />
                      {note.is_archived ? 'Unarchive' : 'Archive'}
                    </button>
                    <button
                      onClick={handleDelete}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Hidden file input for images */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={e => handleImageUpload(e.target.files)}
          className="hidden"
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full text-xl font-semibold text-gray-900 placeholder-gray-400 border-0 focus:outline-none focus:ring-0 p-0 mb-3"
          />

          {/* Tags */}
          <div className="relative mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              {noteTags.map(tag => (
                <TagBadge
                  key={tag.id}
                  tag={tag}
                  onRemove={() => removeTagFromNote(note.id, tag.id)}
                />
              ))}
              <button
                onClick={() => setShowTagPicker(!showTagPicker)}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 hover:bg-gray-100 rounded"
              >
                <Tag className="w-3 h-3" />
                {noteTags.length === 0 ? 'Add tag' : 'Edit'}
              </button>
            </div>

            {showTagPicker && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowTagPicker(false)} />
                <TagPicker
                  noteId={note.id}
                  selectedTags={noteTags}
                  onClose={() => setShowTagPicker(false)}
                />
              </>
            )}
          </div>

          {/* Editor */}
          {note.note_type === 'list' ? (
            <ListEditor content={content} onChange={setContent} />
          ) : note.note_type === 'markdown' ? (
            <MarkdownEditor
              content={content}
              onChange={setContent}
              placeholder="Start typing... Use the toolbar for formatting."
              onImageUpload={handleImageButtonClick}
            />
          ) : (
            <TextEditor
              content={content}
              onChange={setContent}
              placeholder="Start typing..."
            />
          )}

          {/* Image gallery (for text/markdown notes) */}
          {showImageGallery && (
            <ImageGallery
              noteId={note.id}
              onImageClick={setViewingImage}
              editable={true}
            />
          )}
        </div>
      </div>

      {/* Full-screen image viewer */}
      {viewingImage && (
        <ImageViewer url={viewingImage} onClose={() => setViewingImage(null)} />
      )}

      {/* Share modal */}
      {showShareModal && (
        <ShareModal
          noteId={note.id}
          noteTitle={note.title}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  )
}
