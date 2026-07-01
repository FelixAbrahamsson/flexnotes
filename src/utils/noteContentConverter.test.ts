import { describe, it, expect } from 'vitest'
import { htmlToPlainText, convertNoteContent } from './noteContentConverter'

describe('htmlToPlainText', () => {
  it('turns paragraph breaks into newlines', () => {
    expect(htmlToPlainText('<p>a</p><p>b</p>')).toBe('a\nb')
  })

  it('strips inline formatting tags', () => {
    expect(htmlToPlainText('<p>hello <strong>world</strong></p>')).toBe(
      'hello world'
    )
  })

  it('converts <br> to newlines and decodes entities', () => {
    expect(htmlToPlainText('a<br>b &amp; c')).toBe('a\nb & c')
  })
})

describe('convertNoteContent', () => {
  const listContent = JSON.stringify({
    items: [
      { id: '1', text: 'first', checked: false },
      { id: '2', text: 'second', checked: true },
    ],
  })

  it('returns content unchanged when types match', () => {
    expect(convertNoteContent('<p>x</p>', 'markdown', 'markdown')).toBe(
      '<p>x</p>'
    )
  })

  it('list -> text joins item texts with newlines', () => {
    expect(convertNoteContent(listContent, 'list', 'text')).toBe('first\nsecond')
  })

  it('list -> markdown wraps items in paragraphs', () => {
    expect(convertNoteContent(listContent, 'list', 'markdown')).toBe(
      '<p>first</p><p>second</p>'
    )
  })

  it('text -> markdown wraps each line in a paragraph and escapes HTML', () => {
    expect(convertNoteContent('a\n<b>', 'text', 'markdown')).toBe(
      '<p>a</p><p>&lt;b&gt;</p>'
    )
  })

  it('text -> list produces JSON items', () => {
    const result = convertNoteContent('a\nb', 'text', 'list')
    const parsed = JSON.parse(result)
    expect(parsed.items.map((i: { text: string }) => i.text)).toEqual(['a', 'b'])
    expect(parsed.items.every((i: { checked: boolean }) => i.checked === false)).toBe(true)
  })

  it('round-trips text -> markdown -> text', () => {
    const original = 'line one\nline two'
    const md = convertNoteContent(original, 'text', 'markdown')
    expect(convertNoteContent(md, 'markdown', 'text')).toBe(original)
  })

  it('leaves empty content as-is (no spurious <p><br></p>)', () => {
    expect(convertNoteContent('', 'text', 'markdown')).toBe('')
  })
})
