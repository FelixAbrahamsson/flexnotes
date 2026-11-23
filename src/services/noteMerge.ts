import { diffIndices } from 'node-diff3'
import type { Note, ListItem } from '@/types'

/**
 * Three-way merge of note versions.
 *
 * Given the version both sides started from (`base`), our version (`local`)
 * and the server's (`remote`), produce a version that keeps both sides'
 * changes. Only when both sides changed the same part of the title/content in
 * different ways is it a real conflict, which the user resolves by hand.
 */

/** Note fields that are synced (and therefore merged). */
export const SYNC_FIELDS = [
  'title',
  'content',
  'note_type',
  'is_pinned',
  'is_archived',
  'is_deleted',
  'deleted_at',
  'folder_id',
  'sort_order',
] as const

export type SyncField = (typeof SYNC_FIELDS)[number]
export type SyncFields = Pick<Note, SyncField>

export function pickSyncFields(note: Pick<Note, SyncField>): SyncFields {
  const out = {} as Record<SyncField, unknown>
  for (const f of SYNC_FIELDS) out[f] = note[f] ?? null
  return out as SyncFields
}

/** Fields whose value differs between `a` and `b`. */
export function changedFields(a: SyncFields, b: SyncFields): SyncField[] {
  return SYNC_FIELDS.filter((f) => !sameValue(a[f], b[f]))
}

function sameValue(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null)
}

export interface MergeResult {
  merged: SyncFields
  /** True if some title/content change could not be merged automatically. */
  conflict: boolean
}

/**
 * Merge `local` and `remote` relative to `base`. Without a base (legacy notes
 * synced before base snapshots existed) differing text is a conflict and
 * metadata keeps the local value.
 */
export function mergeNote(
  base: SyncFields | undefined,
  local: SyncFields,
  remote: SyncFields
): MergeResult {
  const merged = { ...local }
  let conflict = false

  for (const f of SYNC_FIELDS) {
    const l = local[f]
    const r = remote[f]
    if (sameValue(l, r)) continue

    if (base) {
      const b = base[f]
      if (sameValue(l, b)) {
        ;(merged as Record<SyncField, unknown>)[f] = r
        continue
      }
      if (sameValue(r, b)) continue // keep local
    }

    // Both sides changed this field (or we can't tell).
    if (f === 'title') {
      const m = base ? mergeText(base.title ?? '', l as string | null ?? '', r as string | null ?? '', tokenizeWords) : null
      if (m === null) conflict = true
      else merged.title = m === '' ? null : m
    } else if (f === 'content') {
      const sameType = base && base.note_type === local.note_type && local.note_type === remote.note_type
      const m = sameType ? mergeContent(local.note_type, base.content, l as string, r as string) : null
      if (m === null) conflict = true
      else merged.content = m
    } else if (f === 'note_type') {
      // Converted to different types on each side: content can't be merged.
      conflict = true
    }
    // Other metadata (pin, archive, folder, order...): last writer is us.
  }

  return { merged, conflict }
}

/**
 * Merge a single title/content value whose stored copy changed underneath an
 * in-progress edit (used by the editor save path). Returns null on conflict.
 */
export function mergeField(
  field: 'title' | 'content',
  noteType: string,
  base: string,
  local: string,
  remote: string
): string | null {
  if (local === remote) return local
  if (local === base) return remote
  if (remote === base) return local
  return field === 'title'
    ? mergeText(base, local, remote, tokenizeWords)
    : mergeContent(noteType, base, local, remote)
}

function mergeContent(noteType: string, base: string, local: string, remote: string): string | null {
  if (local === remote) return local
  if (local === base) return remote
  if (remote === base) return local
  return noteType === 'list'
    ? mergeListContent(base, local, remote)
    : mergeText(base, local, remote, tokenizeHtmlBlocks)
}

/** diff3 over tokens; null if any changes overlap. */
function mergeText(
  base: string,
  local: string,
  remote: string,
  tokenize: (s: string) => string[]
): string | null {
  if (local === remote) return local
  if (local === base) return remote
  if (remote === base) return local

  const merged = merge3(tokenize(base), tokenize(local), tokenize(remote))
  return merged === null ? null : merged.join('')
}

interface Hunk<T> {
  start: number // in base
  end: number // exclusive, in base
  content: T[]
}

function hunks<T>(base: T[], side: T[]): Hunk<T>[] {
  return diffIndices(base, side).map((d) => ({
    start: d.buffer1[0],
    end: d.buffer1[0] + d.buffer1[1],
    content: d.buffer2Content,
  }))
}

function sameHunk<T>(a: Hunk<T>, b: Hunk<T>): boolean {
  return (
    a.start === b.start &&
    a.end === b.end &&
    a.content.length === b.content.length &&
    a.content.every((t, i) => t === b.content[i])
  )
}

function overlaps<T>(a: Hunk<T>, b: Hunk<T>): boolean {
  const aInsert = a.start === a.end
  const bInsert = b.start === b.end
  // Both inserted at the same spot (e.g. both added a list item at the end):
  // keep both, ours first.
  if (aInsert && bInsert) return false
  if (aInsert) return b.start < a.start && a.start < b.end
  if (bInsert) return a.start < b.start && b.start < a.end
  return a.start < b.end && b.start < a.end
}

/**
 * Three-way merge of token sequences. Unlike classic diff3, changes that only
 * touch (e.g. edits to neighbouring paragraphs or list items) are not a
 * conflict; only changes to overlapping parts of the base are. Returns null
 * on conflict.
 */
export function merge3<T>(base: T[], local: T[], remote: T[]): T[] | null {
  const all: Hunk<T>[] = []
  const remoteHunks = hunks(base, remote)
  for (const h of hunks(base, local)) all.push(h)
  for (const r of remoteHunks) {
    if (all.some((l) => sameHunk(l, r))) continue // same change on both sides
    if (all.some((l) => overlaps(l, r))) return null
    all.push(r)
  }

  // Apply in base order; at the same position, insertions go before
  // replacements (sort is stable, so ours stay before theirs)
  all.sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start))
  const out: T[] = []
  let i = 0
  for (const h of all) {
    out.push(...base.slice(i, h.start), ...h.content)
    i = h.end
  }
  out.push(...base.slice(i))
  return out
}

/** Words and the whitespace between them, so joining tokens is lossless. */
function tokenizeWords(s: string): string[] {
  return s.split(/(\s+)/).filter((t) => t !== '')
}

/**
 * Split editor HTML into block-level chunks (paragraphs, list items,
 * headings...) so edits to different blocks merge cleanly. Lossless: joining
 * the tokens gives back the input.
 */
export function tokenizeHtmlBlocks(html: string): string[] {
  return html
    .split(
      /(?<=<\/(?:p|h[1-6]|li|blockquote|pre|tr|ul|ol|table|thead|tbody|div)>|<br\s*\/?>|<hr\s*\/?>|\n)/i
    )
    .filter((t) => t !== '')
}

/**
 * Merge list notes item by item (items have stable ids): order via diff3 on
 * the id sequences, then each item's text/checked/indent three-way.
 */
function mergeListContent(base: string, local: string, remote: string): string | null {
  const parse = (s: string): ListItem[] | null => {
    try {
      const items = JSON.parse(s || '{"items":[]}').items
      return Array.isArray(items) ? items : null
    } catch {
      return null
    }
  }
  const b = parse(base)
  const l = parse(local)
  const r = parse(remote)
  if (!b || !l || !r) return null

  const byId = (items: ListItem[]) => new Map(items.map((i) => [i.id, i]))
  const bMap = byId(b)
  const lMap = byId(l)
  const rMap = byId(r)

  const ids = merge3(
    b.map((i) => i.id),
    l.map((i) => i.id),
    r.map((i) => i.id)
  )
  if (ids === null) return null

  // An item deleted on one side but edited on the other: don't drop the edit.
  const kept = new Set(ids)
  for (const [id, baseItem] of bMap) {
    if (kept.has(id)) continue
    const li = lMap.get(id)
    const ri = rMap.get(id)
    if ((li && !sameItem(li, baseItem)) || (ri && !sameItem(ri, baseItem))) return null
  }

  const items: ListItem[] = []
  for (const id of ids) {
    const bi = bMap.get(id)
    const li = lMap.get(id)
    const ri = rMap.get(id)
    if (!li || !ri || !bi) {
      // Added on one side only (or both identically)
      items.push((li ?? ri)!)
      continue
    }
    const text = mergeText(bi.text, li.text, ri.text, tokenizeWords)
    if (text === null) return null
    items.push({
      ...li,
      text,
      checked: pick3(bi.checked, li.checked, ri.checked),
      indent: pick3(bi.indent ?? 0, li.indent ?? 0, ri.indent ?? 0),
    })
  }

  return JSON.stringify({ items })
}

function sameItem(a: ListItem, b: ListItem): boolean {
  return a.text === b.text && a.checked === b.checked && (a.indent ?? 0) === (b.indent ?? 0)
}

/** Scalar three-way pick; if both changed, local wins. */
function pick3<T>(base: T, local: T, remote: T): T {
  return local === base ? remote : local
}
