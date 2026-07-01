import { describe, it, expect } from 'vitest'
import { getItemWithChildren } from './listItems'

const item = (id: string, indent = 0) => ({ id, indent })

describe('getItemWithChildren', () => {
  it('returns just the item when it has no children', () => {
    const list = [item('a'), item('b'), item('c')]
    expect(getItemWithChildren('b', list)).toEqual(['b'])
  })

  it('includes contiguous deeper-indented descendants', () => {
    const list = [item('a'), item('b'), item('b1', 1), item('b2', 1), item('c')]
    expect(getItemWithChildren('b', list)).toEqual(['b', 'b1', 'b2'])
  })

  it('includes nested grandchildren but stops at a shallower sibling', () => {
    const list = [
      item('a'),
      item('a1', 1),
      item('a1x', 2),
      item('b'), // back to indent 0 - not a descendant of a
    ]
    expect(getItemWithChildren('a', list)).toEqual(['a', 'a1', 'a1x'])
  })

  it('treats a missing indent as level 0', () => {
    const list = [{ id: 'a' }, { id: 'b' }]
    expect(getItemWithChildren('a', list)).toEqual(['a'])
  })

  it('returns an empty array when the item is not found', () => {
    expect(getItemWithChildren('missing', [item('a')])).toEqual([])
  })
})
