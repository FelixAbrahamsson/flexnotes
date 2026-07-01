import { describe, it, expect } from 'vitest'
import { looksLikeMarkdown, markdownToSafeHtml } from './markdown'

describe('looksLikeMarkdown', () => {
  it('detects common markdown structures', () => {
    expect(looksLikeMarkdown('# Heading')).toBe(true)
    expect(looksLikeMarkdown('- a\n- b')).toBe(true)
    expect(looksLikeMarkdown('1. first')).toBe(true)
    expect(looksLikeMarkdown('> quote')).toBe(true)
    expect(looksLikeMarkdown('some **bold** text')).toBe(true)
    expect(looksLikeMarkdown('see [link](https://x.com)')).toBe(true)
    expect(looksLikeMarkdown('run `code` here')).toBe(true)
    expect(looksLikeMarkdown('| a | b |\n| - | - |')).toBe(true)
  })

  it('does not flag plain prose or code-ish text', () => {
    expect(looksLikeMarkdown('Just a normal sentence.')).toBe(false)
    expect(looksLikeMarkdown('call my_snake_case_function()')).toBe(false)
    expect(looksLikeMarkdown('https://example.com/page')).toBe(false)
    expect(looksLikeMarkdown('')).toBe(false)
    expect(looksLikeMarkdown('   ')).toBe(false)
  })
})

describe('markdownToSafeHtml', () => {
  it('renders headings and inline formatting', () => {
    const html = markdownToSafeHtml('# Title\n\nsome **bold** text')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('maps GFM task lists to TipTap task list markup', () => {
    const html = markdownToSafeHtml('- [ ] todo\n- [x] done')
    expect(html).toContain('data-type="taskList"')
    expect(html).toContain('data-type="taskItem"')
    expect(html).toContain('data-checked="true"')
    expect(html).toContain('data-checked="false"')
    // the raw checkbox input should be removed
    expect(html).not.toContain('type="checkbox"')
  })

  it('sanitizes dangerous HTML', () => {
    const html = markdownToSafeHtml('<img src=x onerror="alert(1)">\n\nhi')
    expect(html).not.toContain('onerror')
  })
})
