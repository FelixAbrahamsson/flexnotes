/**
 * Minimal in-memory fake of the Supabase client, covering the query-builder
 * subset used by `services/sync.ts` and the stores:
 *
 *   from(t).select(cols).eq(col,val).single()
 *   from(t).select('*').eq(col,val)          (awaited directly)
 *   from(t).insert(obj)
 *   from(t).update(obj).eq(col,val)
 *   from(t).upsert(obj)
 *   from(t).delete().eq(col,val)[.eq(col,val)]
 *   from(t).select(...).gte(col,val)
 *
 * The builder is a thenable, so it works with both `await from().insert()` and
 * `await from().select().eq().single()`. Tests seed/inspect `serverTables`
 * directly and call `resetServer()` between cases.
 *
 * Not a full reimplementation of PostgREST — just enough to exercise the
 * local-first sync logic against a controllable server.
 */

export type Row = Record<string, unknown>

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
  kind: 'eq' | 'gte'
}

class QueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: Op = 'select'
  private payload: Row | Row[] | null = null
  private filters: Filter[] = []
  private isSingle = false

  constructor(private table: string) {}

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
  single() {
    this.isSingle = true
    return this
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      // Ignore filters on joined columns (e.g. "notes.owner_id").
      if (f.col.includes('.')) return true
      if (f.kind === 'eq') return row[f.col] === f.val
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
        const found = this.rows.filter((r) => this.matches(r))
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
        for (const item of items) this.rows.push({ ...item })
        return { data: null, error: null }
      }
      case 'update': {
        for (const row of this.rows) {
          if (this.matches(row)) Object.assign(row, this.payload)
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

export const fakeSupabase = {
  from(table: string) {
    return new QueryBuilder(table)
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
