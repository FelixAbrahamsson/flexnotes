import { useState, useEffect, useCallback, useRef } from 'react'
import {
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
  FolderInput,
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

interface NoteEditorPaneProps {
  noteId: string
  onMoveToFolder?: () => void
  hideTags?: boolean
}

/**
 * Inline note editor pane for split-view layouts.
 * Similar to NoteEditor but without the modal wrapper.
 */
export function NoteEditorPane({ noteId, onMoveToFolder, hideTags = false }: NoteEditorPaneProps) {
  const { notes, updateNote, trashNote } = useNoteStore()
  const { getTagsForNote, removeTagFromNote } = useTagStore()
  const { fetchImagesForNote } = useImageStore()
  const confirm = useConfirm()

  // Find the note directly from the notes array
  const note = notes.find(n => n.id === noteId)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [viewingImage, setViewingImage] = useState<string | null>(null)

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

  // Sync from store when note changes
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

  const handleTogglePin = () => {
    if (!note) return
    updateNote(note.id, { is_pinned: !note.is_pinned })
  }

  const handleToggleArchive = () => {
    if (!note) return
    updateNote(note.id, { is_archived: !note.is_archived })
  }

  const handleDelete = async () => {
    if (!note) return
    const confirmed = await confirm({
      title: 'Move to trash',
      message: 'Move this note to trash?',
      confirmText: 'Move to trash',
      variant: 'danger',
    })
    if (confirmed) {
      trashNote(note.id)
    }
  }

  const handleChangeType = (newType: NoteType) => {
    if (!note) return

    let newContent = content

    // Convert content between types
    if (note.note_type === 'list' && newType !== 'list') {
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
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Select a note to view</p>
        </div>
      </div>
    )
  }

  const showImageGallery = note.note_type !== 'list'

  return (
    <div
      className="flex flex-col h-full bg-white dark:bg-gray-800"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragging && note.note_type !== 'list' && (
        <div
          className="absolute inset-0 z-50 bg-primary-500/20 dark:bg-primary-500/30 flex items-center justify-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg text-center">
            <ImagePlus className="w-12 h-12 text-primary-500 mx-auto mb-2" />
            <p className="text-lg font-medium text-gray-900 dark:text-gray-100">Drop images here</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-1">
          {/* Note type selector */}
          <div className="relative">
            <button
              onClick={() => setShowTypeMenu(!showTypeMenu)}
              className="btn btn-ghost p-2 text-xs font-medium text-gray-500"
              title="Change note type"
            >
              {note.note_type === 'text' && <Type className="w-4 h-4" />}
              {note.note_type === 'list' && <List className="w-4 h-4" />}
              {note.note_type === 'markdown' && <FileText className="w-4 h-4" />}
            </button>

            {showTypeMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowTypeMenu(false)} />
                <div className="absolute left-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20">
                  <button
                    onClick={() => handleChangeType('text')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-gray-50 dark:hover:bg-gray-700 ${note.note_type === 'text' ? 'text-primary-600' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    <Type className="w-4 h-4" />
                    Text
                  </button>
                  <button
                    onClick={() => handleChangeType('list')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-gray-50 dark:hover:bg-gray-700 ${note.note_type === 'list' ? 'text-primary-600' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    <List className="w-4 h-4" />
                    List
                  </button>
                  <button
                    onClick={() => handleChangeType('markdown')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-gray-50 dark:hover:bg-gray-700 ${note.note_type === 'markdown' ? 'text-primary-600' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    <FileText className="w-4 h-4" />
                    Markdown
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Image upload button */}
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
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleTogglePin}
            className={`btn btn-ghost p-2 ${note.is_pinned ? 'text-primary-600' : ''}`}
            title={note.is_pinned ? 'Unpin' : 'Pin'}
          >
            <Pin className={`w-4 h-4 ${note.is_pinned ? 'fill-current' : ''}`} />
          </button>

          {/* More menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="btn btn-ghost p-2"
            >
              <MoreVertical className="w-4 h-4" />
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
              {onMoveToFolder && (
                <DropdownMenuItem
                  icon={<FolderInput className="w-4 h-4" />}
                  onClick={() => {
                    setShowMenu(false)
                    onMoveToFolder()
                  }}
                >
                  Move to folder
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                icon={<Archive className="w-4 h-4" />}
                onClick={() => {
                  setShowMenu(false)
                  handleToggleArchive()
                }}
              >
                {note.is_archived ? 'Unarchive' : 'Archive'}
              </DropdownMenuItem>
              <DropdownMenuItem
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => {
                  setShowMenu(false)
                  handleDelete()
                }}
                variant="danger"
              >
                Move to trash
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
            onImageUpload={handleImageButtonClick}
            onImageDrop={handleImageUpload}
          />
        ) : (
          <TextEditor
            content={content}
            onChange={setContent}
            placeholder="Start typing..."
          />
        )}

        {/* Image gallery */}
        {showImageGallery && (
          <ImageGallery
            noteId={note.id}
            onImageClick={setViewingImage}
            editable={true}
          />
        )}
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
