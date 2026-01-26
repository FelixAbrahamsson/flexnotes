import { useEffect, useCallback, useImperativeHandle, forwardRef, useState, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'

// Create lowlight instance with common languages (js, ts, python, css, html, json, bash, etc.)
const lowlight = createLowlight(common)

import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Heading1,
  Heading2,
  Minus,
  ImagePlus,
} from 'lucide-react'

interface MarkdownEditorProps {
  content: string
  onChange: (content: string) => void
  onImageUpload?: () => void
  onImageDrop?: (files: FileList) => void
  placeholder?: string
}

export interface MarkdownEditorHandle {
  insertImage: (url: string) => void
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor({ content, onChange, onImageUpload, onImageDrop, placeholder }, ref) {
  const [isDragging, setIsDragging] = useState(false)
  const onImageDropRef = useRef(onImageDrop)

  // Keep ref updated
  useEffect(() => {
    onImageDropRef.current = onImageDrop
  }, [onImageDrop])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        // Disable default code block in favor of CodeBlockLowlight
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: 'hljs',
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Start typing...',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-lg max-w-full h-auto',
        },
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        // Allow URLs with special characters like @ in the path
        validate: (url) => /^https?:\/\//.test(url),
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'text-primary-600 dark:text-primary-400 underline cursor-pointer',
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'tiptap prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[200px] text-gray-900 dark:text-gray-100',
      },
      handleDrop: (_view, event, _slice, moved) => {
        // Only handle if not moved (i.e., dropped from outside)
        if (moved) return false

        const files = event.dataTransfer?.files
        if (files && files.length > 0) {
          const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
          if (imageFiles.length > 0 && onImageDropRef.current) {
            event.preventDefault()
            const dt = new DataTransfer()
            imageFiles.forEach(f => dt.items.add(f))
            onImageDropRef.current(dt.files)
            return true // Handled
          }
        }
        return false // Let TipTap handle it
      },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files
        if (files && files.length > 0) {
          const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
          if (imageFiles.length > 0 && onImageDropRef.current) {
            event.preventDefault()
            const dt = new DataTransfer()
            imageFiles.forEach(f => dt.items.add(f))
            onImageDropRef.current(dt.files)
            return true // Handled
          }
        }
        return false // Let TipTap handle it
      },
    },
  })

  // Update content when prop changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content)
    }
  }, [editor, content])

  // Focus editor on mount
  useEffect(() => {
    if (editor) {
      editor.commands.focus('end')
    }
  }, [editor])

  // Expose insertImage method via ref
  const insertImage = useCallback((url: string) => {
    if (editor) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }, [editor])

  useImperativeHandle(ref, () => ({
    insertImage,
  }), [insertImage])

  // Handle drag and drop on the container (capture phase to intercept before TipTap)
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only handle if leaving the container entirely
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragging(false)
    }
  }, [])

  // Drop handler for the overlay - this intercepts drops before TipTap
  const handleDropOnOverlay = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0 && onImageDrop) {
      const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
      if (imageFiles.length > 0) {
        const dt = new DataTransfer()
        imageFiles.forEach(f => dt.items.add(f))
        onImageDrop(dt.files)
      }
    }
  }, [onImageDrop])

  if (!editor) {
    return null
  }

  return (
    <div
      className={`relative border rounded-lg overflow-hidden transition-colors ${
        isDragging
          ? 'border-primary-500'
          : 'border-gray-200 dark:border-gray-700'
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drop overlay - appears when dragging and intercepts the drop */}
      {isDragging && (
        <div
          className="absolute inset-0 z-10 bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropOnOverlay}
        >
          <div className="text-center">
            <ImagePlus className="w-12 h-12 text-primary-500 dark:text-primary-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-primary-600 dark:text-primary-400">
              Drop images here
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-wrap">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          isActive={editor.isActive('code')}
          title="Inline code"
        >
          <Code className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet list"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Numbered list"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          isActive={editor.isActive('taskList')}
          title="Task list"
        >
          <CheckSquare className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          title="Quote"
        >
          <Quote className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule"
        >
          <Minus className="w-4 h-4" />
        </ToolbarButton>

        {onImageUpload && (
          <>
            <ToolbarDivider />
            <ToolbarButton onClick={onImageUpload} title="Add image">
              <ImagePlus className="w-4 h-4" />
            </ToolbarButton>
          </>
        )}
      </div>

      {/* Editor */}
      <div className="p-3 bg-white dark:bg-gray-900">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
})

interface ToolbarButtonProps {
  onClick: () => void
  isActive?: boolean
  title: string
  children: React.ReactNode
}

function ToolbarButton({ onClick, isActive, title, children }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
        isActive ? 'bg-gray-200 dark:bg-gray-700 text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'
      }`}
      title={title}
      type="button"
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
}

