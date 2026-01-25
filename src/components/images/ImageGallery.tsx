import { X } from 'lucide-react'
import { useImageStore } from '@/stores/imageStore'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import type { NoteImage } from '@/types'

interface ImageGalleryProps {
  noteId: string
  onImageClick?: (imageUrl: string) => void
  editable?: boolean
}

export function ImageGallery({ noteId, onImageClick, editable = true }: ImageGalleryProps) {
  const { getImagesForNote, getImageUrl, deleteImage } = useImageStore()
  const images = getImagesForNote(noteId)

  if (images.length === 0) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
      {images.map(image => (
        <ImageThumbnail
          key={image.id}
          image={image}
          url={getImageUrl(image.storage_path)}
          onDelete={editable ? () => deleteImage(image.id) : undefined}
          onClick={onImageClick}
        />
      ))}
    </div>
  )
}

interface ImageThumbnailProps {
  image: NoteImage
  url: string
  onDelete?: () => void
  onClick?: (url: string) => void
}

function ImageThumbnail({ image: _image, url, onDelete, onClick }: ImageThumbnailProps) {
  return (
    <div className="relative group aspect-square">
      <img
        src={url}
        alt=""
        className="w-full h-full object-cover rounded-lg cursor-pointer"
        onClick={() => onClick?.(url)}
        loading="lazy"
      />

      {onDelete && (
        <button
          onClick={e => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
          title="Delete image"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

// Full-screen image viewer
interface ImageViewerProps {
  url: string
  onClose: () => void
}

export function ImageViewer({ url, onClose }: ImageViewerProps) {
  useEscapeKey(onClose)

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-full"
      >
        <X className="w-6 h-6" />
      </button>

      <img
        src={url}
        alt=""
        className="max-w-full max-h-full object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}
