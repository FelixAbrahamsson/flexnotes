import { create } from 'zustand'
import type { NoteImage } from '@/types'
import { supabase } from '@/services/supabase'
import { useAuthStore } from './authStore'
import { processImage, generateImageId } from '@/services/imageProcessor'

interface ImageState {
  images: NoteImage[]
  uploading: boolean
  error: string | null

  fetchImagesForNote: (noteId: string) => Promise<void>
  uploadImage: (noteId: string, file: File) => Promise<NoteImage | null>
  deleteImage: (imageId: string) => Promise<void>
  getImagesForNote: (noteId: string) => NoteImage[]
  getImageUrl: (storagePath: string) => string
}

export const useImageStore = create<ImageState>((set, get) => ({
  images: [],
  uploading: false,
  error: null,

  fetchImagesForNote: async (noteId: string) => {
    try {
      const { data, error } = await supabase
        .from('note_images')
        .select('*')
        .eq('note_id', noteId)
        .order('position')

      if (error) throw error

      // Merge with existing images (don't replace all)
      set(state => {
        const otherImages = state.images.filter(img => img.note_id !== noteId)
        return { images: [...otherImages, ...(data || [])] }
      })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  uploadImage: async (noteId: string, file: File) => {
    const user = useAuthStore.getState().user
    if (!user) return null

    set({ uploading: true, error: null })

    try {
      // Process image (compress, convert to WebP)
      const processed = await processImage(file)

      // Generate storage path
      const imageId = generateImageId()
      const storagePath = `${user.id}/${noteId}/${imageId}.webp`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('note-images')
        .upload(storagePath, processed.blob, {
          contentType: 'image/webp',
          cacheControl: '31536000', // 1 year cache
        })

      if (uploadError) throw uploadError

      // Get current max position
      const existingImages = get().images.filter(img => img.note_id === noteId)
      const maxPosition = existingImages.reduce(
        (max, img) => Math.max(max, img.position),
        -1
      )

      // Create database record
      const { data, error: dbError } = await supabase
        .from('note_images')
        .insert({
          note_id: noteId,
          storage_path: storagePath,
          position: maxPosition + 1,
        })
        .select()
        .single()

      if (dbError) throw dbError

      // Add to state
      set(state => ({
        images: [...state.images, data],
      }))

      return data
    } catch (error) {
      set({ error: (error as Error).message })
      return null
    } finally {
      set({ uploading: false })
    }
  },

  deleteImage: async (imageId: string) => {
    const image = get().images.find(img => img.id === imageId)
    if (!image) return

    // Optimistic update
    set(state => ({
      images: state.images.filter(img => img.id !== imageId),
    }))

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('note-images')
        .remove([image.storage_path])

      if (storageError) {
        console.error('Failed to delete from storage:', storageError)
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('note_images')
        .delete()
        .eq('id', imageId)

      if (dbError) throw dbError
    } catch (error) {
      // Revert on error
      set(state => ({
        images: [...state.images, image],
        error: (error as Error).message,
      }))
    }
  },

  getImagesForNote: (noteId: string) => {
    return get().images.filter(img => img.note_id === noteId)
  },

  getImageUrl: (storagePath: string) => {
    const { data } = supabase.storage
      .from('note-images')
      .getPublicUrl(storagePath)

    return data.publicUrl
  },
}))
