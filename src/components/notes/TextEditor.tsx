import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import History from '@tiptap/extension-history'
import Placeholder from '@tiptap/extension-placeholder'
import HardBreak from '@tiptap/extension-hard-break'
import Link from '@tiptap/extension-link'

interface TextEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
}

// Custom serializer to convert paragraphs to single newlines when copying
function serializeTextContent(doc: { content: { forEach: (fn: (node: { type: { name: string }, textContent: string }) => void) => void } }): string {
  const lines: string[] = []
  doc.content.forEach((node) => {
    if (node.type.name === 'paragraph') {
      lines.push(node.textContent)
    } else if (node.type.name === 'hardBreak') {
      // Hard breaks within a paragraph - handled by textContent
    } else {
      lines.push(node.textContent)
    }
  })
  return lines.join('\n')
}

export function TextEditor({ content, onChange, placeholder }: TextEditorProps) {
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      History,
      Placeholder.configure({
        placeholder: placeholder || 'Start typing...',
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
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
        class: 'tiptap focus:outline-none min-h-[100px] text-gray-900 dark:text-gray-100',
      },
      // Custom clipboard text serializer to prevent double newlines
      clipboardTextSerializer: (slice) => {
        return serializeTextContent(slice.content as unknown as Parameters<typeof serializeTextContent>[0])
      },
    },
  })

  // Update content when prop changes (but not on every keystroke)
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

  return <EditorContent editor={editor} />
}
