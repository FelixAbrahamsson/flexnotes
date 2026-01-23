import { useRef, useState } from 'react'
import { ImagePlus, Loader2 } from 'lucide-react'
import { useImageStore } from '@/stores/imageStore'

interface ImageUploaderProps {
  noteId: string
  onUpload?: (imageUrl: string) => void
}

export function ImageUploader({ noteId, onUpload }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const { uploadImage, uploading, getImageUrl } = useImageStore()

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue

      const image = await uploadImage(noteId, file)
      if (image && onUpload) {
        const url = getImageUrl(image.storage_path)
        onUpload(url)
      }
    }
  }

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
        ${dragOver
          ? 'border-primary-500 bg-primary-50'
          : 'border-gray-300 hover:border-gray-400'
        }
        ${uploading ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={e => handleFileSelect(e.target.files)}
        className="hidden"
      />

      {uploading ? (
        <div className="flex items-center justify-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Uploading...</span>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 text-gray-500">
          <ImagePlus className="w-5 h-5" />
          <span className="text-sm">Click or drag to add images</span>
        </div>
      )}
    </div>
  )
}

// Compact button version for toolbar
interface ImageUploadButtonProps {
  noteId: string
  onUpload?: (imageUrl: string) => void
}

export function ImageUploadButton({ noteId, onUpload }: ImageUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { uploadImage, uploading, getImageUrl } = useImageStore()

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue

      const image = await uploadImage(noteId, file)
      if (image && onUpload) {
        const url = getImageUrl(image.storage_path)
        onUpload(url)
      }
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={e => handleFileSelect(e.target.files)}
        className="hidden"
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 disabled:opacity-50"
        title="Add image"
        type="button"
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ImagePlus className="w-4 h-4" />
        )}
      </button>
    </>
  )
}
