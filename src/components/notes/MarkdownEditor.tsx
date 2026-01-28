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

import { ImagePlus } from 'lucide-react'

interface MarkdownEditorProps {
  content: string
  onChange: (content: string) => void
  onImageDrop?: (files: FileList) => void
  placeholder?: string
}

export interface MarkdownEditorHandle {
  insertImage: (url: string) => void
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor({ content, onChange, onImageDrop, placeholder }, ref) {
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
      handleKeyDown: (view, event) => {
        if (!editor?.isActive('codeBlock')) return false

        // Insert 2 spaces when Tab is pressed inside a code block
        if (event.key === 'Tab') {
          event.preventDefault()
          editor.commands.insertContent('  ')
          return true
        }

        // Continue with same indentation on Enter
        if (event.key === 'Enter') {
          const { state } = view
          const { $from } = state.selection

          // Get text from start of code block to cursor
          const codeBlockStart = $from.start()
          const textBeforeCursor = state.doc.textBetween(codeBlockStart, $from.pos)

          // Find the last newline to get the current line
          const lastNewline = textBeforeCursor.lastIndexOf('\n')
          const currentLine = lastNewline === -1
            ? textBeforeCursor
            : textBeforeCursor.slice(lastNewline + 1)

          // Extract leading whitespace from current line
          const match = currentLine.match(/^(\s*)/)
          const indent = match ? match[1] : ''

          if (indent) {
            event.preventDefault()
            editor.commands.insertContent('\n' + indent)
            return true
          }
        }

        return false
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
      className="relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drop overlay - appears when dragging */}
      {isDragging && (
        <div
          className="absolute inset-0 z-10 bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center rounded-lg"
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

      <EditorContent editor={editor} />
    </div>
  )
})

