import imageCompression from 'browser-image-compression'

export interface ProcessedImage {
  blob: Blob
  width: number
  height: number
  originalName: string
}

const MAX_DIMENSION = 1920 // Max pixels on longest edge
const QUALITY = 0.8

export async function processImage(file: File): Promise<ProcessedImage> {
  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
  if (!validTypes.includes(file.type)) {
    throw new Error(`Invalid file type: ${file.type}. Supported: JPEG, PNG, GIF, WebP, HEIC`)
  }

  // Get original dimensions
  const originalDimensions = await getImageDimensions(file)

  // Calculate target dimensions
  const { width, height } = calculateTargetDimensions(
    originalDimensions.width,
    originalDimensions.height,
    MAX_DIMENSION
  )

  // Compress and convert to WebP
  const options = {
    maxWidthOrHeight: MAX_DIMENSION,
    useWebWorker: true,
    fileType: 'image/webp' as const,
    initialQuality: QUALITY,
  }

  const compressedBlob = await imageCompression(file, options)

  return {
    blob: compressedBlob,
    width,
    height,
    originalName: file.name.replace(/\.[^.]+$/, '.webp'),
  }
}

async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      reject(new Error('Failed to load image'))
    }
    img.src = URL.createObjectURL(file)
  })
}

function calculateTargetDimensions(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height }
  }

  const aspectRatio = width / height

  if (width > height) {
    return {
      width: maxDimension,
      height: Math.round(maxDimension / aspectRatio),
    }
  } else {
    return {
      width: Math.round(maxDimension * aspectRatio),
      height: maxDimension,
    }
  }
}

export function createObjectURL(blob: Blob): string {
  return URL.createObjectURL(blob)
}

export function revokeObjectURL(url: string): void {
  URL.revokeObjectURL(url)
}

export function generateImageId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
