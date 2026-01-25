import { useState, useCallback, useRef, type RefObject } from 'react'
import { useImageStore } from '@/stores/imageStore'
import { processImage } from '@/services/imageProcessor'

interface UseImageUploadOptions {
  noteId: string | undefined
  noteType: string | undefined
  onImageInsert?: (url: string) => void
}

interface UseImageUploadReturn {
  isDragging: boolean
  uploading: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  handleImageUpload: (files: FileList | null) => Promise<void>
  handleImageButtonClick: () => void
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => void
}

/**
 * Hook for handling image uploads and drag-and-drop in note editors.
 *
 * @example
 * const { isDragging, fileInputRef, handleDrop, handleImageButtonClick } = useImageUpload({
 *   noteId: note.id,
 *   noteType: note.note_type,
 *   onImageInsert: (url) => editor.insertImage(url),
 * })
 */
export function useImageUpload({
  noteId,
  noteType,
  onImageInsert,
}: UseImageUploadOptions): UseImageUploadReturn {
  const { uploadImage, getImageUrl, uploading } = useImageStore()
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || !noteId) return

      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue

        try {
          // Validate image first
          await processImage(file)
          const image = await uploadImage(noteId, file)

          if (image && noteType === 'markdown' && onImageInsert) {
            const url = getImageUrl(image.storage_path)
            onImageInsert(url)
          }
        } catch (error) {
          console.error('Image upload failed:', error)
        }
      }
    },
    [noteId, noteType, uploadImage, getImageUrl, onImageInsert]
  )

  const handleImageButtonClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set to false if leaving the container
    const rect = e.currentTarget.getBoundingClientRect()
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      if (!noteId || noteType === 'list') return

      const files = e.dataTransfer.files
      if (files.length > 0) {
        handleImageUpload(files)
      }
    },
    [noteId, noteType, handleImageUpload]
  )

  return {
    isDragging,
    uploading,
    fileInputRef,
    handleImageUpload,
    handleImageButtonClick,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}
