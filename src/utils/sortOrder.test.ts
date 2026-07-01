import { describe, it, expect } from 'vitest'
import { computeReorderSortOrder } from './sortOrder'

// Helper: build a list with the given sort_order values.
const list = (...orders: number[]) => orders.map((sort_order) => ({ sort_order }))

describe('computeReorderSortOrder', () => {
  it('steps below the first item when moving to the top', () => {
    // move index 2 -> 0
    expect(computeReorderSortOrder(list(10, 20, 30), 2, 0)).toBe(9)
  })

  it('steps above the last item when moving to the bottom', () => {
    // move index 0 -> 2
    expect(computeReorderSortOrder(list(10, 20, 30), 0, 2)).toBe(31)
  })

  it('averages neighbours when moving up into the middle', () => {
    // move index 3 -> 1: between items at index 0 and 1
    expect(computeReorderSortOrder(list(10, 20, 30, 40), 3, 1)).toBe(15)
  })

  it('averages neighbours when moving down into the middle', () => {
    // move index 0 -> 2: between items at index 2 and 3
    expect(computeReorderSortOrder(list(10, 20, 30, 40), 0, 2)).toBe(35)
  })

  it('produces a value strictly between neighbours (fractional ok)', () => {
    const result = computeReorderSortOrder(list(1, 2, 3, 4), 3, 1)
    expect(result).toBeGreaterThan(1)
    expect(result).toBeLessThan(2)
  })
})
