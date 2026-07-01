/**
 * List-item tree helpers.
 *
 * List notes are stored as a flat array where hierarchy is expressed by an
 * `indent` level. A node's "children" are the contiguous following items whose
 * indent is strictly greater than the node's own.
 */

/**
 * Return the id of `itemId` plus the ids of all its descendants (contiguous
 * following items with a deeper indent). Returns an empty array if the item is
 * not found.
 */
export function getItemWithChildren<T extends { id: string; indent?: number }>(
  itemId: string,
  itemList: T[]
): string[] {
  const index = itemList.findIndex((item) => item.id === itemId)
  if (index === -1) return []

  const parentIndent = itemList[index].indent ?? 0
  const ids = [itemId]

  for (let i = index + 1; i < itemList.length; i++) {
    const itemIndent = itemList[i].indent ?? 0
    if (itemIndent > parentIndent) {
      ids.push(itemList[i].id)
    } else {
      break
    }
  }

  return ids
}
