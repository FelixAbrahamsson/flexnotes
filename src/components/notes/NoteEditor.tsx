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
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { useNoteStore } from '@/stores/noteStore'
import { useTagStore } from '@/stores/tagStore'
import { useImageStore } from '@/stores/imageStore'
import { useImageUpload } from '@/hooks/useImageUpload'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { TextEditor } from './TextEditor'
import { ListEditor } from './ListEditor'
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor'
import { TagBadge } from '@/components/tags/TagBadge'
import { TagPicker } from '@/components/tags/TagPicker'
import { ImageGallery, ImageViewer } from '@/components/images/ImageGallery'
import { ShareModal } from '@/components/sharing/ShareModal'
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/DropdownMenu'
import type { NoteType } from '@/types'

interface NoteEditorProps {
  noteId: string
  onClose: () => void
  hideTags?: boolean
}

export function NoteEditor({ noteId: _noteId, onClose, hideTags = false }: NoteEditorProps) {
  const { getActiveNote, updateNote, deleteNote } = useNoteStore()
  const { getTagsForNote, removeTagFromNote } = useTagStore()
  const { fetchImagesForNote } = useImageStore()
  const confirm = useConfirm()
  const note = getActiveNote()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [viewingImage, setViewingImage] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const markdownEditorRef = useRef<MarkdownEditorHandle>(null)

  const {
    isDragging,
    uploading,
    fileInputRef,
    handleImageUpload,
    handleImageButtonClick,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useImageUpload({
    noteId: note?.id,
    noteType: note?.note_type,
    onImageInsert: (url) => markdownEditorRef.current?.insertImage(url),
  })

  const noteTags = note ? getTagsForNote(note.id) : []

  // Fetch images when note opens
  useEffect(() => {
    if (note) {
      fetchImagesForNote(note.id)
    }
  }, [note, fetchImagesForNote])

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close sub-modals first, then the main modal
        if (viewingImage) {
          setViewingImage(null)
        } else if (showShareModal) {
          setShowShareModal(false)
        } else if (showTagPicker) {
          setShowTagPicker(false)
        } else if (showTypeMenu) {
          setShowTypeMenu(false)
        } else if (showMenu) {
          setShowMenu(false)
        } else {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showMenu, showTypeMenu, showTagPicker, showShareModal, viewingImage, onClose])

  // Only sync from store when note ID changes (opening a different note)
  // Don't overwrite local edits when the store updates from sync
  const [lastNoteId, setLastNoteId] = useState<string | null>(null)
  useEffect(() => {
    if (note && note.id !== lastNoteId) {
      setTitle(note.title || '')
      setContent(note.content)
      setLastNoteId(note.id)
    }
  }, [note, lastNoteId])

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

  const handleDelete = async () => {
    if (!note) return
    const confirmed = await confirm({
      title: 'Delete note',
      message: 'Delete this note? This cannot be undone.',
      confirmText: 'Delete',
      variant: 'danger',
    })
    if (confirmed) {
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

  if (!note) {
    return null
  }

  const showImageGallery = note.note_type !== 'list'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50"
      onClick={handleClose}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`absolute bg-white dark:bg-gray-800 shadow-xl flex flex-col ${
          isFullscreen
            ? 'inset-0 sm:inset-0 max-h-full'
            : 'inset-x-0 bottom-0 top-0 sm:inset-4 sm:top-12 sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:max-w-2xl sm:rounded-xl max-h-full sm:max-h-[calc(100vh-6rem)]'
        }`}
        onClick={e => e.stopPropagation()}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drop overlay */}
        {isDragging && note.note_type !== 'list' && (
          <div
            className="absolute inset-0 z-50 bg-primary-500/20 dark:bg-primary-500/30 flex items-center justify-center rounded-xl"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg text-center">
              <ImagePlus className="w-12 h-12 text-primary-500 mx-auto mb-2" />
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100">Drop images here</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Images will be uploaded to this note</p>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
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
                  <div className="absolute right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
                    <button
                      onClick={() => handleChangeType('text')}
                      className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-gray-50 dark:hover:bg-gray-700 ${note.note_type === 'text' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'}`}
                    >
                      <Type className="w-4 h-4" />
                      Text
                    </button>
                    <button
                      onClick={() => handleChangeType('list')}
                      className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-gray-50 dark:hover:bg-gray-700 ${note.note_type === 'list' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'}`}
                    >
                      <List className="w-4 h-4" />
                      List
                    </button>
                    <button
                      onClick={() => handleChangeType('markdown')}
                      className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-gray-50 dark:hover:bg-gray-700 ${note.note_type === 'markdown' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'}`}
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

            {/* Fullscreen toggle - desktop only */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="btn btn-ghost p-2 hidden sm:block"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-5 h-5" />
              ) : (
                <Maximize2 className="w-5 h-5" />
              )}
            </button>

            {/* More menu */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="btn btn-ghost p-2"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              <DropdownMenu open={showMenu} onClose={() => setShowMenu(false)}>
                <DropdownMenuItem
                  icon={<Share2 className="w-4 h-4" />}
                  onClick={() => {
                    setShowMenu(false)
                    setShowShareModal(true)
                  }}
                >
                  Share
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<Archive className="w-4 h-4" />}
                  onClick={handleToggleArchive}
                >
                  {note.is_archived ? 'Unarchive' : 'Archive'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<Trash2 className="w-4 h-4" />}
                  onClick={handleDelete}
                  variant="danger"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenu>
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
            className="w-full text-xl font-semibold text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 bg-transparent border-0 focus:outline-none focus:ring-0 p-0 mb-3"
          />

          {/* Tags - hidden in folder view */}
          {!hideTags && (
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
                  className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
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
          )}

          {/* Editor */}
          {note.note_type === 'list' ? (
            <ListEditor content={content} onChange={setContent} />
          ) : note.note_type === 'markdown' ? (
            <MarkdownEditor
              ref={markdownEditorRef}
              content={content}
              onChange={setContent}
              placeholder="Start typing... Use the toolbar for formatting."
              onImageDrop={handleImageUpload}
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
