import JSZip from 'jszip'
import { generateLocalId, getCurrentTimestamp } from './db'
import type { Note } from '@/types'

export interface ImportedNote {
  title: string
  content: string
  noteType: 'text' | 'list'
  listItems?: { text: string; checked: boolean }[]
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

// Google Keep JSON format
interface KeepJsonNote {
  title?: string
  textContent?: string
  listContent?: Array<{
    text: string
    isChecked: boolean
  }>
  labels?: Array<{ name: string }>
  isPinned?: boolean
  isArchived?: boolean
  isTrashed?: boolean
  userEditedTimestampUsec?: number
  createdTimestampUsec?: number
  attachments?: Array<{
    filePath: string
    mimetype: string
  }>
}

// Parse a Google Keep JSON file (current format)
function parseKeepJSON(json: string, fileName: string): ImportedNote | null {
  try {
    const data: KeepJsonNote = JSON.parse(json)

    // Determine note type and content
    let noteType: 'text' | 'list' = 'text'
    let content = ''
    let listItems: { text: string; checked: boolean }[] | undefined

    if (data.listContent && data.listContent.length > 0) {
      noteType = 'list'
      listItems = data.listContent.map(item => ({
        text: item.text || '',
        checked: item.isChecked || false,
      }))
    } else {
      content = data.textContent || ''
    }

    // Parse timestamps (Google uses microseconds)
    const createdAt = data.createdTimestampUsec
      ? new Date(data.createdTimestampUsec / 1000).toISOString()
      : getCurrentTimestamp()
    const updatedAt = data.userEditedTimestampUsec
      ? new Date(data.userEditedTimestampUsec / 1000).toISOString()
      : createdAt

    // Get labels
    const labels = (data.labels || []).map(l => l.name).filter(Boolean)

    return {
      title: data.title || '',
      content,
      noteType,
      listItems,
      labels,
      isPinned: data.isPinned || false,
      isArchived: data.isArchived || false,
      isTrashed: data.isTrashed || false,
      createdAt,
      updatedAt,
      images: [],
    }
  } catch (error) {
    console.error('Failed to parse Keep JSON:', fileName, error)
    return null
  }
}

// Parse a Google Keep HTML file (older format)
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
      noteType: 'text',
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
    const noteFiles: { path: string; content: string; type: 'json' | 'html' }[] = []
    const imageMap = new Map<string, Blob>()

    // First pass: collect all files
    const filePromises: Promise<void>[] = []

    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return

      const ext = relativePath.split('.').pop()?.toLowerCase()
      const fileName = relativePath.split('/').pop() || relativePath

      if (ext === 'json') {
        // Skip label definition files
        if (fileName === 'Labels.json' || fileName.startsWith('.')) {
          return
        }
        filePromises.push(
          zipEntry.async('string').then(content => {
            noteFiles.push({ path: relativePath, content, type: 'json' })
          })
        )
      } else if (ext === 'html') {
        filePromises.push(
          zipEntry.async('string').then(content => {
            noteFiles.push({ path: relativePath, content, type: 'html' })
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

    console.log(`Found ${noteFiles.length} note files (${noteFiles.filter(f => f.type === 'json').length} JSON, ${noteFiles.filter(f => f.type === 'html').length} HTML)`)

    // Second pass: parse note files and match images
    for (const { path, content, type } of noteFiles) {
      const fileName = path.split('/').pop() || path

      // Skip non-note files
      if (fileName.startsWith('index') || fileName.startsWith('style') || fileName === 'Labels.json') {
        result.skipped++
        continue
      }

      const note = type === 'json'
        ? parseKeepJSON(content, fileName)
        : parseKeepHTML(content, fileName)

      if (!note) {
        result.errors.push(`Failed to parse: ${fileName}`)
        continue
      }

      // Skip trashed notes
      if (note.isTrashed) {
        result.skipped++
        continue
      }

      // Match images from attachments (JSON format) or HTML references
      if (type === 'json') {
        try {
          const data: KeepJsonNote = JSON.parse(content)
          if (data.attachments) {
            for (const attachment of data.attachments) {
              const imgFilename = attachment.filePath.split('/').pop()
              if (imgFilename && imageMap.has(imgFilename)) {
                note.images.push({
                  name: imgFilename,
                  data: imageMap.get(imgFilename)!,
                })
              }
            }
          }
        } catch {
          // Ignore attachment parsing errors
        }
      } else {
        // HTML format - match images referenced in the note
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
      }

      result.notes.push(note)
    }

    console.log(`Parsed ${result.notes.length} notes, skipped ${result.skipped}`)
    return result
  } catch (error) {
    result.errors.push(`Failed to read zip file: ${(error as Error).message}`)
    return result
  }
}

// Convert imported notes to our Note format
export function convertImportedNote(imported: ImportedNote, ownerId: string): Omit<Note, 'id'> & { id: string } {
  let content: string
  let noteType: 'text' | 'list' | 'markdown' = 'text'

  if (imported.noteType === 'list' && imported.listItems) {
    // Convert to our list format
    noteType = 'list'
    content = JSON.stringify({
      items: imported.listItems.map((item, index) => ({
        id: `item-${index}-${Date.now()}`,
        text: item.text,
        checked: item.checked,
        indent: 0,
      }))
    })
  } else {
    // Convert plain text content to HTML paragraphs
    content = imported.content
      .split('\n')
      .filter(line => line.trim())
      .map(line => `<p>${escapeHtml(line)}</p>`)
      .join('') || '<p></p>'
  }

  return {
    id: generateLocalId(),
    owner_id: ownerId,
    title: imported.title || null,
    content,
    note_type: noteType,
    is_pinned: imported.isPinned,
    is_archived: imported.isArchived,
    is_deleted: false,
    deleted_at: null,
    folder_id: null,
    version: 1,
    created_at: imported.createdAt,
    updated_at: imported.updatedAt,
    sort_order: -new Date(imported.updatedAt).getTime(),
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
