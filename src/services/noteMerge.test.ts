import { describe, it, expect } from 'vitest'
import { mergeNote, mergeField, pickSyncFields, tokenizeHtmlBlocks, type SyncFields } from './noteMerge'

const base: SyncFields = pickSyncFields({
  title: 'Title',
  content: '<p>a</p><p>b</p><p>c</p>',
  note_type: 'text',
  is_pinned: false,
  is_archived: false,
  is_deleted: false,
  deleted_at: null,
  folder_id: null,
  sort_order: 0,
})

const list = (items: { id: string; text: string; checked?: boolean; indent?: number }[]) =>
  JSON.stringify({ items: items.map((i) => ({ checked: false, indent: 0, ...i })) })

describe('tokenizeHtmlBlocks', () => {
  it('is lossless', () => {
    const html = '<h1>x</h1><p>a<br>b</p><ul><li><p>c</p></li></ul>\n<p>d</p>'
    expect(tokenizeHtmlBlocks(html).join('')).toBe(html)
    expect(tokenizeHtmlBlocks(html).length).toBeGreaterThan(3)
  })
})

describe('mergeNote', () => {
  it('takes each side’s change to different fields', () => {
    const { merged, conflict } = mergeNote(
      base,
      { ...base, title: 'Local title' },
      { ...base, is_pinned: true }
    )
    expect(conflict).toBe(false)
    expect(merged).toMatchObject({ title: 'Local title', is_pinned: true })
  })

  it('merges edits to different paragraphs', () => {
    const { merged, conflict } = mergeNote(
      base,
      { ...base, content: '<p>a!</p><p>b</p><p>c</p>' },
      { ...base, content: '<p>a</p><p>b</p><p>c!</p>' }
    )
    expect(conflict).toBe(false)
    expect(merged.content).toBe('<p>a!</p><p>b</p><p>c!</p>')
  })

  it('conflicts on different edits to the same paragraph', () => {
    const { merged, conflict } = mergeNote(
      base,
      { ...base, content: '<p>a</p><p>b local</p><p>c</p>' },
      { ...base, content: '<p>a</p><p>b remote</p><p>c</p>' }
    )
    expect(conflict).toBe(true)
    expect(merged.content).toBe('<p>a</p><p>b local</p><p>c</p>') // ours kept
  })

  it('treats identical edits on both sides as no conflict', () => {
    const edited = { ...base, content: '<p>same</p>' }
    expect(mergeNote(base, edited, edited).conflict).toBe(false)
  })

  it('merges title edits word by word', () => {
    const { merged, conflict } = mergeNote(
      { ...base, title: 'weekly plan notes' },
      { ...base, title: 'weekly work plan notes' },
      { ...base, title: 'weekly plan notes draft' }
    )
    expect(conflict).toBe(false)
    expect(merged.title).toBe('weekly work plan notes draft')
  })

  it('without a base, differing content is a conflict', () => {
    expect(mergeNote(undefined, { ...base, content: 'x' }, { ...base, content: 'y' }).conflict).toBe(true)
  })

  it('conflicts when the note type was converted differently on each side', () => {
    expect(
      mergeNote(base, { ...base, note_type: 'list' }, { ...base, note_type: 'markdown' }).conflict
    ).toBe(true)
  })

  it('keeps note_type with the content it belongs to when only one side converted', () => {
    // Remote converted text -> list (rewrites content); local edited the text
    const { merged, conflict } = mergeNote(
      base,
      { ...base, content: '<p>a edited</p><p>b</p><p>c</p>' },
      { ...base, note_type: 'list', content: list([{ id: '1', text: 'a' }]) }
    )
    expect(conflict).toBe(true)
    expect(merged.note_type).toBe('text')
    expect(merged.content).toBe('<p>a edited</p><p>b</p><p>c</p>')
  })

  it('takes a one-sided type conversion when the other side did not touch content', () => {
    const converted = { ...base, note_type: 'list' as const, content: list([{ id: '1', text: 'a' }]) }
    const { merged, conflict } = mergeNote(base, { ...base, is_pinned: true }, converted)
    expect(conflict).toBe(false)
    expect(merged).toMatchObject({ note_type: 'list', content: converted.content, is_pinned: true })
  })

  describe('list notes', () => {
    const lb = { ...base, note_type: 'list' as const, content: list([{ id: '1', text: 'milk' }, { id: '2', text: 'eggs' }]) }

    it('merges added items and per-item edits from both sides', () => {
      const { merged, conflict } = mergeNote(
        lb,
        { ...lb, content: list([{ id: '1', text: 'oat milk' }, { id: '2', text: 'eggs' }, { id: '3', text: 'bread' }]) },
        { ...lb, content: list([{ id: '1', text: 'milk', checked: true }, { id: '2', text: 'eggs', indent: 1 }]) }
      )
      expect(conflict).toBe(false)
      expect(JSON.parse(merged.content).items).toEqual([
        { id: '1', text: 'oat milk', checked: true, indent: 0 },
        { id: '2', text: 'eggs', checked: false, indent: 1 },
        { id: '3', text: 'bread', checked: false, indent: 0 },
      ])
    })

    it('takes a deletion on one side when the other side left the item alone', () => {
      const { merged, conflict } = mergeNote(
        lb,
        { ...lb, content: list([{ id: '1', text: 'milk' }]) },
        { ...lb, content: list([{ id: '1', text: 'milk' }, { id: '2', text: 'eggs' }, { id: '3', text: 'jam' }]) }
      )
      expect(conflict).toBe(false)
      expect(JSON.parse(merged.content).items.map((i: { id: string }) => i.id)).toEqual(['1', '3'])
    })

    it('keeps items both sides added at the end', () => {
      const { merged, conflict } = mergeNote(
        lb,
        { ...lb, content: list([{ id: '1', text: 'milk' }, { id: '2', text: 'eggs' }, { id: 'a', text: 'from A' }]) },
        { ...lb, content: list([{ id: '1', text: 'milk' }, { id: '2', text: 'eggs' }, { id: 'b', text: 'from B' }]) }
      )
      expect(conflict).toBe(false)
      expect(JSON.parse(merged.content).items.map((i: { id: string }) => i.id)).toEqual(['1', '2', 'a', 'b'])
    })

    it('conflicts when an item was deleted on one side and edited on the other', () => {
      expect(
        mergeNote(
          lb,
          { ...lb, content: list([{ id: '1', text: 'milk' }]) },
          { ...lb, content: list([{ id: '1', text: 'milk' }, { id: '2', text: 'free-range eggs' }]) }
        ).conflict
      ).toBe(true)
    })
  })
})

describe('neighbouring edits', () => {
  it('merges edits to adjacent paragraphs', () => {
    const { merged, conflict } = mergeNote(
      base,
      { ...base, content: '<p>a!</p><p>b</p><p>c</p>' },
      { ...base, content: '<p>a</p><p>b!</p><p>c</p>' }
    )
    expect(conflict).toBe(false)
    expect(merged.content).toBe('<p>a!</p><p>b!</p><p>c</p>')
  })
})

describe('mergeField', () => {
  it('returns the other side when only one changed', () => {
    expect(mergeField('content', 'text', 'x', 'x', 'y')).toBe('y')
    expect(mergeField('content', 'text', 'x', 'y', 'x')).toBe('y')
  })
})
