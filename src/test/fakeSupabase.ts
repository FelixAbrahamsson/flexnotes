/**
 * Minimal in-memory fake of the Supabase client, covering the query-builder
 * subset used by `services/sync.ts` and the stores:
 *
 *   from(t).select(cols).eq(col,val).single() / .maybeSingle()
 *   from(t).select('*').eq(col,val)          (awaited directly)
 *   from(t).insert(obj)
 *   from(t).update(obj).eq(col,val)
 *   from(t).upsert(obj)
 *   from(t).delete().eq(col,val)[.eq(col,val)]
 *   from(t).select(...).gte(col,val) / .gt(col,val) / .in(col,vals)
 *   from(t).select(...).order(col).limit(n)
 *   rpc('push_note', { p_id, p_base_version, p_fields })
 *
 * Writes to `notes` behave like the database trigger: they get a fresh
 * `server_seq` and `updated_at` (see the sync_redesign migration).
 *
 * The builder is a thenable, so it works with both `await from().insert()` and
 * `await from().select().eq().single()`. Tests seed/inspect `serverTables`
 * directly and call `resetServer()` between cases.
 *
 * Not a full reimplementation of PostgREST — just enough to exercise the
 * local-first sync logic against a controllable server.
 */

export type Row = Record<string, unknown>

let seq = 0
let clock = Date.parse('2030-01-01T00:00:00.000Z')
/** Stamp a notes row like the server trigger does. */
function stampNote(row: Row): void {
  row.server_seq = ++seq
  row.updated_at = new Date(clock++).toISOString()
}

/**
 * Seed a server note as if it had been written through the API (assigns
 * server_seq/updated_at and default fields). Returns the stored row.
 */
export function seedServerNote(row: Row): Row {
  const full: Row = {
    owner_id: 'user-1',
    title: null,
    content: '',
    note_type: 'text',
    is_pinned: false,
    is_archived: false,
    is_deleted: false,
    deleted_at: null,
    folder_id: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    ...row,
  }
  stampNote(full)
  serverTables.notes.push(full)
  return full
}

/** Simulate another device editing a server note (bumps version like push_note). */
export function editServerNote(id: string, changes: Row): Row {
  const row = serverTables.notes.find((r) => r.id === id)
  if (!row) throw new Error(`no server note ${id}`)
  Object.assign(row, changes, { version: (row.version as number) + 1 })
  stampNote(row)
  return row
}

export const serverTables: Record<string, Row[]> = {
  notes: [],
  tags: [],
  note_tags: [],
  folders: [],
  note_images: [],
  note_shares: [],
  saved_shares: [],
  profiles: [],
}

export function resetServer() {
  for (const key of Object.keys(serverTables)) {
    serverTables[key] = []
  }
  rpcHooks.beforePushNote = undefined
  QueryBuilder.maxRows = Infinity
}

/** Cap every select at `n` rows, like the PostgREST max-rows setting. */
export function setMaxRows(n: number) {
  QueryBuilder.maxRows = n
}

// Lets a test force the next matching operation to fail, to exercise
// retry/error branches. Cleared after it fires once.
let forcedError: { table: string; op: string; error: { code?: string; message: string } } | null =
  null
export function forceNextError(
  table: string,
  op: string,
  error: { code?: string; message: string }
) {
  forcedError = { table, op, error }
}

type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert'
interface Filter {
  col: string
  val: unknown
  kind: 'eq' | 'gte' | 'gt' | 'in'
}

class QueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  private table: string
  private op: Op = 'select'
  private payload: Row | Row[] | null = null
  private filters: Filter[] = []
  private isSingle = false
  private isMaybeSingle = false
  private orderBy: { col: string; ascending: boolean } | null = null
  private limitN: number | null = null
  private rangeFrom = 0
  /** Like PostgREST's max-rows: responses never exceed this many rows. */
  static maxRows = Infinity

  constructor(table: string) {
    this.table = table
  }

  private get rows(): Row[] {
    return (serverTables[this.table] ??= [])
  }

  select(_cols?: string) {
    this.op = 'select'
    return this
  }
  insert(payload: Row | Row[]) {
    this.op = 'insert'
    this.payload = payload
    return this
  }
  update(payload: Row) {
    this.op = 'update'
    this.payload = payload
    return this
  }
  upsert(payload: Row | Row[]) {
    this.op = 'upsert'
    this.payload = payload
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val, kind: 'eq' })
    return this
  }
  gte(col: string, val: unknown) {
    this.filters.push({ col, val, kind: 'gte' })
    return this
  }
  gt(col: string, val: unknown) {
    this.filters.push({ col, val, kind: 'gt' })
    return this
  }
  in(col: string, vals: unknown[]) {
    this.filters.push({ col, val: vals, kind: 'in' })
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, ascending: opts?.ascending ?? true }
    return this
  }
  limit(n: number) {
    this.limitN = n
    return this
  }
  range(from: number, to: number) {
    this.rangeFrom = from
    this.limitN = to - from + 1
    return this
  }
  single() {
    this.isSingle = true
    return this
  }
  maybeSingle() {
    this.isMaybeSingle = true
    return this
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      // Ignore filters on joined columns (e.g. "notes.owner_id").
      if (f.col.includes('.')) return true
      if (f.kind === 'eq') return row[f.col] === f.val
      if (f.kind === 'in') return (f.val as unknown[]).includes(row[f.col])
      if (f.kind === 'gt') {
        const v = row[f.col]
        return typeof v === 'string' ? v > (f.val as string) : (v as number) > (f.val as number)
      }
      return (
        row[f.col] != null &&
        new Date(String(row[f.col])).getTime() >= new Date(String(f.val)).getTime()
      )
    })
  }

  private execute(): { data: unknown; error: unknown } {
    if (forcedError && forcedError.table === this.table && forcedError.op === this.op) {
      const err = forcedError.error
      forcedError = null
      return { data: null, error: err }
    }

    switch (this.op) {
      case 'select': {
        let found = this.rows.filter((r) => this.matches(r))
        if (this.orderBy) {
          const { col, ascending } = this.orderBy
          const cmp = (a: unknown, b: unknown) =>
            typeof a === 'string' ? a.localeCompare(b as string) : (a as number) - (b as number)
          found = [...found].sort((a, b) => cmp(a[col], b[col]) * (ascending ? 1 : -1))
        }
        const n = Math.min(this.limitN ?? Infinity, QueryBuilder.maxRows)
        found = found.slice(this.rangeFrom, this.rangeFrom + n)
        if (this.isMaybeSingle) {
          return { data: found[0] ? { ...found[0] } : null, error: null }
        }
        if (this.isSingle) {
          if (found.length === 0) {
            return { data: null, error: { code: 'PGRST116', message: 'No rows found' } }
          }
          return { data: { ...found[0] }, error: null }
        }
        return { data: found.map((r) => ({ ...r })), error: null }
      }
      case 'insert': {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload!]
        for (const item of items) {
          const row = { ...item }
          if (this.table === 'notes') stampNote(row)
          this.rows.push(row)
        }
        return { data: null, error: null }
      }
      case 'update': {
        for (const row of this.rows) {
          if (this.matches(row)) {
            Object.assign(row, this.payload)
            if (this.table === 'notes') stampNote(row)
          }
        }
        return { data: null, error: null }
      }
      case 'upsert': {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload!]
        for (const item of items) {
          const existing = this.rows.find((r) => r.id === item.id)
          if (existing) Object.assign(existing, item)
          else this.rows.push({ ...item })
        }
        return { data: null, error: null }
      }
      case 'delete': {
        const kept = this.rows.filter((r) => !this.matches(r))
        serverTables[this.table] = kept
        return { data: null, error: null }
      }
    }
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    try {
      const result = this.execute()
      return Promise.resolve(onfulfilled ? onfulfilled(result) : (result as unknown as TResult1))
    } catch (e) {
      return Promise.resolve(onrejected ? onrejected(e) : (Promise.reject(e) as never))
    }
  }
}

/** Set by tests to run code just before push_note applies (simulates a race). */
export const rpcHooks: { beforePushNote?: (id: string) => void } = {}

/** In-memory version of the push_note RPC (compare-and-swap on version). */
function pushNote(args: { p_id: string; p_base_version: number | null; p_fields: Row }) {
  rpcHooks.beforePushNote?.(args.p_id)
  const rows = serverTables.notes
  const existing = rows.find((r) => r.id === args.p_id)
  if (!existing && args.p_base_version !== null) {
    return { status: 'missing', note: null }
  }
  if (!existing) {
    const row: Row = {
      id: args.p_id,
      owner_id: 'user-1',
      title: null,
      content: '',
      note_type: 'text',
      is_pinned: false,
      is_archived: false,
      is_deleted: false,
      deleted_at: null,
      folder_id: null,
      sort_order: null,
      created_at: '2026-01-01T00:00:00.000Z',
      ...args.p_fields,
      version: 1,
    }
    stampNote(row)
    rows.push(row)
    return { status: 'ok', note: { ...row } }
  }
  if (args.p_base_version === null || existing.version !== args.p_base_version) {
    return { status: 'conflict', note: { ...existing } }
  }
  Object.assign(existing, args.p_fields, { version: (existing.version as number) + 1 })
  stampNote(existing)
  return { status: 'ok', note: { ...existing } }
}

export const fakeSupabase = {
  from(table: string) {
    return new QueryBuilder(table)
  },
  async rpc(name: string, args: Record<string, unknown>) {
    if (forcedError && forcedError.table === 'rpc' && forcedError.op === name) {
      const error = forcedError.error
      forcedError = null
      return { data: null, error }
    }
    if (name === 'push_note') {
      return { data: pushNote(args as Parameters<typeof pushNote>[0]), error: null }
    }
    return { data: null, error: { message: `unknown rpc ${name}` } }
  },
  storage: {
    from() {
      return {
        remove: async () => ({ error: null }),
        upload: async () => ({ error: null }),
      }
    },
  },
}
