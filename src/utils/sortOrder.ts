/**
 * Compute the `sort_order` for an item being moved within an ordered list from
 * `oldIndex` to `newIndex`.
 *
 * Uses midpoint interpolation between the target neighbours, and steps just
 * beyond the current bounds when moving to the very top or bottom. Fractional
 * results are expected — they let items be inserted between neighbours without
 * renumbering the whole list.
 *
 * Assumes `0 <= oldIndex, newIndex < list.length` and `oldIndex !== newIndex`.
 */
export function computeReorderSortOrder(
  list: { sort_order: number }[],
  oldIndex: number,
  newIndex: number
): number {
  if (newIndex === 0) {
    // Moving to the top
    return list[0].sort_order - 1
  }
  if (newIndex === list.length - 1) {
    // Moving to the bottom
    return list[list.length - 1].sort_order + 1
  }
  if (newIndex < oldIndex) {
    // Moving up - place between newIndex-1 and newIndex
    return (list[newIndex - 1].sort_order + list[newIndex].sort_order) / 2
  }
  // Moving down - place between newIndex and newIndex+1
  return (list[newIndex].sort_order + list[newIndex + 1].sort_order) / 2
}
