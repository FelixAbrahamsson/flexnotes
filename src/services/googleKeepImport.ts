import JSZip from 'jszip'
import { generateLocalId, getCurrentTimestamp } from './db'
import type { Note } from '@/types'

export interface ImportedNote {
  title: string
  content: string
  labels: string[]
  isPinned: boolean
  isArchived: boolean
  isTrashed: boolean
  createdAt: string
  updatedAt: string
  images: { name: string; data: Blob }[]
}

export interface ImportResult {
  notes: ImportedNote[]
  errors: string[]
  skipped: number
}

// Parse a Google Keep HTML file
function parseKeepHTML(html: string, fileName: string): ImportedNote | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Get title - either from .title element or filename
    const titleEl = doc.querySelector('.title')
    let title = titleEl?.textContent?.trim() || ''
    if (!title) {
      // Use filename without extension as title
      title = fileName.replace(/\.html$/i, '')
    }

    // Get content - from .content element
    const contentEl = doc.querySelector('.content')
    let content = ''
    if (contentEl) {
      // Convert HTML content to our format
      // Keep paragraphs and line breaks
      content = contentEl.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .trim()
    }

    // Get labels/tags
    const labels: string[] = []
    doc.querySelectorAll('.label, .chip').forEach(el => {
      const label = el.textContent?.trim()
      if (label) labels.push(label)
    })

    // Check for pinned/archived status (Google Keep sometimes includes this)
    const isPinned = doc.querySelector('.pinned') !== null ||
      html.toLowerCase().includes('is pinned')
    const isArchived = doc.querySelector('.archived') !== null ||
      html.toLowerCase().includes('archived')
    const isTrashed = doc.querySelector('.trashed') !== null ||
      html.toLowerCase().includes('trashed')

    // Get dates if available
    const headingEl = doc.querySelector('.heading')
    const dateText = headingEl?.textContent || ''
    const dateMatch = dateText.match(/(\w+ \d+, \d{4})/)
    const createdAt = dateMatch ? new Date(dateMatch[1]).toISOString() : getCurrentTimestamp()

    return {
      title,
      content,
      labels,
      isPinned,
      isArchived,
      isTrashed,
      createdAt,
      updatedAt: createdAt,
      images: [],
    }
  } catch (error) {
    console.error('Failed to parse Keep HTML:', error)
    return null
  }
}

// Parse Google Keep Takeout zip file
export async function parseGoogleKeepZip(file: File): Promise<ImportResult> {
  const result: ImportResult = {
    notes: [],
    errors: [],
    skipped: 0,
  }

  try {
    const zip = await JSZip.loadAsync(file)
    const htmlFiles: { path: string; content: string }[] = []
    const imageMap = new Map<string, Blob>()

    // First pass: collect all files
    const filePromises: Promise<void>[] = []

    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return

      const ext = relativePath.split('.').pop()?.toLowerCase()

      if (ext === 'html') {
        filePromises.push(
          zipEntry.async('string').then(content => {
            htmlFiles.push({ path: relativePath, content })
          })
        )
      } else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) {
        filePromises.push(
          zipEntry.async('blob').then(blob => {
            // Store with just the filename for matching
            const filename = relativePath.split('/').pop() || relativePath
            imageMap.set(filename, blob)
          })
        )
      }
    })

    await Promise.all(filePromises)

    // Second pass: parse HTML files and match images
    for (const { path, content } of htmlFiles) {
      const fileName = path.split('/').pop() || path

      // Skip non-note HTML files
      if (fileName.startsWith('index') || fileName.startsWith('style')) {
        result.skipped++
        continue
      }

      const note = parseKeepHTML(content, fileName)
      if (!note) {
        result.errors.push(`Failed to parse: ${fileName}`)
        continue
      }

      // Skip trashed notes
      if (note.isTrashed) {
        result.skipped++
        continue
      }

      // Match images referenced in the note
      // Google Keep uses filenames like "IMG_20230101_123456.jpg"
      const imgMatches = content.match(/src="([^"]+\.(png|jpg|jpeg|gif|webp))"/gi)
      if (imgMatches) {
        for (const match of imgMatches) {
          const imgName = match.match(/src="([^"]+)"/)?.[1]
          if (imgName) {
            const filename = imgName.split('/').pop()
            if (filename && imageMap.has(filename)) {
              note.images.push({
                name: filename,
                data: imageMap.get(filename)!,
              })
            }
          }
        }
      }

      result.notes.push(note)
    }

    return result
  } catch (error) {
    result.errors.push(`Failed to read zip file: ${(error as Error).message}`)
    return result
  }
}

// Convert imported notes to our Note format
export function convertImportedNote(imported: ImportedNote, ownerId: string): Omit<Note, 'id'> & { id: string } {
  // Convert plain text content to HTML paragraphs
  const htmlContent = imported.content
    .split('\n')
    .filter(line => line.trim())
    .map(line => `<p>${escapeHtml(line)}</p>`)
    .join('')

  return {
    id: generateLocalId(),
    owner_id: ownerId,
    title: imported.title || null,
    content: htmlContent || '<p></p>',
    note_type: 'text',
    is_pinned: imported.isPinned,
    is_archived: imported.isArchived,
    is_deleted: false,
    deleted_at: null,
    version: 1,
    created_at: imported.createdAt,
    updated_at: imported.updatedAt,
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
