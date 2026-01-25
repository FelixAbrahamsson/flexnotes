/**
 * Shared formatting utilities
 */

/**
 * Format a date as a relative time string (e.g., "Just now", "5m ago", "3d ago")
 * Falls back to absolute date for older dates.
 */
export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return date.toLocaleDateString()
}

/**
 * Format a date as an absolute date string (e.g., "Jan 15, 2024")
 */
export function formatAbsoluteDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Get a preview of note content for display in cards/lists.
 * Strips HTML, handles list content, and truncates to maxLength.
 */
export function getContentPreview(
  content: string,
  noteType: string,
  maxLength: number = 200
): string {
  if (!content) return ''

  if (noteType === 'list') {
    try {
      const parsed = JSON.parse(content)
      if (parsed.items && Array.isArray(parsed.items)) {
        return parsed.items
          .slice(0, 3)
          .map((item: { text: string; checked: boolean }) =>
            `${item.checked ? '✓' : '○'} ${item.text}`
          )
          .join('\n')
      }
    } catch {
      return content
    }
  }

  // For text and markdown, strip HTML tags but preserve newlines
  const text = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text.slice(0, maxLength)
}

/**
 * Strip HTML tags from content, preserving basic text structure.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}
