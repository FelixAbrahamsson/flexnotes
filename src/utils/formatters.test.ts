import { describe, it, expect } from 'vitest'
import { getContentPreview } from './formatters'

describe('getContentPreview', () => {
  it('returns empty string for empty content', () => {
    expect(getContentPreview('', 'text')).toBe('')
  })

  it('shows only unchecked items for list notes', () => {
    const content = JSON.stringify({
      items: [
        { text: 'buy milk', checked: false },
        { text: 'done thing', checked: true },
        { text: 'walk dog', checked: false },
      ],
    })
    const preview = getContentPreview(content, 'list')
    expect(preview).toContain('buy milk')
    expect(preview).toContain('walk dog')
    expect(preview).not.toContain('done thing')
  })

  it('summarizes when all list items are completed', () => {
    const content = JSON.stringify({
      items: [
        { text: 'a', checked: true },
        { text: 'b', checked: true },
      ],
    })
    expect(getContentPreview(content, 'list')).toBe('All 2 items completed')
  })

  it('strips HTML from text notes but keeps the text', () => {
    expect(getContentPreview('<p>hello <strong>world</strong></p>', 'text')).toBe(
      'hello world'
    )
  })

  it('renders markdown headings as text markers', () => {
    expect(getContentPreview('<h1>Title</h1>', 'markdown')).toContain('# Title')
  })

  it('truncates to maxLength', () => {
    const long = '<p>' + 'x'.repeat(500) + '</p>'
    expect(getContentPreview(long, 'text', 50).length).toBe(50)
  })
})
