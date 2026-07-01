import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { ListEditor } from './ListEditor'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import type { ListItem } from '@/types'

/**
 * Behavioral safety net for ListEditor's keyboard interactions, written before
 * extracting the keyboard-handling logic into a hook. These assert the
 * observable contract: given items + a keypress at a cursor position, what
 * content does the editor emit via onChange?
 */

function makeContent(items: Partial<ListItem>[]): string {
  return JSON.stringify({
    items: items.map((it, i) => ({
      id: it.id ?? `item-${i}`,
      text: it.text ?? '',
      checked: it.checked ?? false,
      indent: it.indent ?? 0,
    })),
  })
}

function renderEditor(items: Partial<ListItem>[]) {
  const onChange = vi.fn()
  render(
    <ConfirmProvider>
      <ListEditor content={makeContent(items)} onChange={onChange} />
    </ConfirmProvider>
  )
  return { onChange }
}

// Parse the items from the most recent onChange call.
function lastItems(onChange: ReturnType<typeof vi.fn>): ListItem[] {
  const call = onChange.mock.calls.at(-1)
  if (!call) throw new Error('onChange was not called')
  return JSON.parse(call[0]).items
}

function textareas(): HTMLTextAreaElement[] {
  return screen.getAllByPlaceholderText('List item') as HTMLTextAreaElement[]
}

describe('ListEditor keyboard behavior', () => {
  it('renders one textarea per item with its text', () => {
    renderEditor([{ text: 'alpha' }, { text: 'beta' }])
    const tas = textareas()
    expect(tas).toHaveLength(2)
    expect(tas[0].value).toBe('alpha')
    expect(tas[1].value).toBe('beta')
  })

  it('Enter at the cursor splits the item in two', () => {
    const { onChange } = renderEditor([{ text: 'helloworld' }])
    const ta = textareas()[0]
    ta.focus()
    ta.setSelectionRange(5, 5) // cursor between "hello" and "world"
    fireEvent.keyDown(ta, { key: 'Enter' })

    const items = lastItems(onChange)
    expect(items.map((i) => i.text)).toEqual(['hello', 'world'])
  })

  it('Enter at the end creates a new empty item after the current one', () => {
    const { onChange } = renderEditor([{ text: 'done' }])
    const ta = textareas()[0]
    ta.focus()
    ta.setSelectionRange(4, 4)
    fireEvent.keyDown(ta, { key: 'Enter' })

    const items = lastItems(onChange)
    expect(items).toHaveLength(2)
    expect(items[0].text).toBe('done')
    expect(items[1].text).toBe('')
  })

  it('Backspace at the start of an item merges it into the previous one', () => {
    const { onChange } = renderEditor([{ text: 'foo' }, { text: 'bar' }])
    const second = textareas()[1]
    second.focus()
    second.setSelectionRange(0, 0)
    fireEvent.keyDown(second, { key: 'Backspace' })

    const items = lastItems(onChange)
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe('foobar')
  })

  it('Tab indents the current item and Shift+Tab outdents it', () => {
    const { onChange } = renderEditor([{ text: 'a' }, { text: 'b' }])
    const second = textareas()[1]
    second.focus()

    fireEvent.keyDown(second, { key: 'Tab' })
    expect(lastItems(onChange)[1].indent).toBe(1)

    fireEvent.keyDown(second, { key: 'Tab', shiftKey: true })
    expect(lastItems(onChange)[1].indent).toBe(0)
  })
})

describe('ListEditor checkbox hierarchy', () => {
  it('checking a parent also checks its indented children', () => {
    const { onChange } = renderEditor([
      { text: 'parent', indent: 0 },
      { text: 'child', indent: 1 },
      { text: 'sibling', indent: 0 },
    ])
    // The checkbox is the button immediately preceding each textarea's row.
    const parentCheckbox = screen.getAllByRole('button').find((b) =>
      b.className.includes('rounded border-2')
    )
    expect(parentCheckbox).toBeTruthy()
    fireEvent.click(parentCheckbox!)

    const items = lastItems(onChange)
    const byText = Object.fromEntries(items.map((i) => [i.text, i.checked]))
    expect(byText.parent).toBe(true)
    expect(byText.child).toBe(true)
    expect(byText.sibling).toBe(false)
  })
})
