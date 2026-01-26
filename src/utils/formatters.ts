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
        // Only show unchecked items in preview
        const uncheckedItems = parsed.items.filter(
          (item: { checked: boolean }) => !item.checked
        )
        if (uncheckedItems.length === 0) {
          // If all items are checked, show a summary
          return `All ${parsed.items.length} items completed`
        }
        return uncheckedItems
          .slice(0, 3)
          .map((item: { text: string }) => `○ ${item.text}`)
          .join('\n')
      }
    } catch {
      return content
    }
  }

  if (noteType === 'markdown') {
    // Better markdown preview - convert HTML to readable text
    let text = content
      // Convert headings to text with markers
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
      // Convert list items to bullet points
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
      // Convert task list items
      .replace(/<li[^>]*data-checked="true"[^>]*>.*?<\/li>/gi, '✓ ')
      .replace(/<li[^>]*data-checked="false"[^>]*>.*?<\/li>/gi, '○ ')
      // Convert code blocks to show as code
      .replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '```\n$1\n```\n')
      .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
      // Convert blockquotes
      .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, '> $1\n')
      // Convert breaks and paragraphs to newlines
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      // Remove remaining HTML tags
      .replace(/<[^>]*>/g, '')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      // Clean up excessive whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    return text.slice(0, maxLength)
  }

  // For text notes, strip HTML tags but preserve newlines
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
