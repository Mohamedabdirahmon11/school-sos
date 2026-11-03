type Row = Record<string, any>;

class MemoryQuery {
  private action: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private filters: Array<(row: Row) => boolean> = [];
  private payload: Row[] = [];
  private updateValues: Row = {};
  private orderBy: Array<{ field: string; ascending: boolean }> = [];
  private from = 0;
  private to: number | null = null;
  private maxRows: number | null = null;
  private wantsCount = false;
  private headOnly = false;
  private singleResult = false;
  private conflictColumn = 'id';

  constructor(private client: InMemorySupabase, private table: string) {}

  select(_columns = '*', options?: { count?: string; head?: boolean }) {
    if (this.action === 'select') this.action = 'select';
    this.wantsCount = options?.count === 'exact';
    this.headOnly = options?.head === true;
    return this;
  }

  eq(field: string, value: unknown) { this.filters.push(row => row[field] === value); return this; }
  neq(field: string, value: unknown) { this.filters.push(row => row[field] !== value); return this; }
  in(field: string, values: unknown[]) { this.filters.push(row => values.includes(row[field])); return this; }
  is(field: string, value: unknown) { this.filters.push(row => row[field] === value); return this; }
  gte(field: string, value: any) { this.filters.push(row => row[field] >= value); return this; }
  gt(field: string, value: any) { this.filters.push(row => row[field] > value); return this; }
  lte(field: string, value: any) { this.filters.push(row => row[field] <= value); return this; }
  lt(field: string, value: any) { this.filters.push(row => row[field] < value); return this; }
  order(field: string, options?: { ascending?: boolean }) { this.orderBy.push({ field, ascending: options?.ascending !== false }); return this; }
  range(from: number, to: number) { this.from = Math.max(0, from); this.to = Math.max(from - 1, to); return this; }
  limit(value: number) { this.maxRows = Math.max(0, value); return this; }
  or(_expression: string) { return this; }
  single() { this.singleResult = true; return this; }
  maybeSingle() { this.singleResult = true; return this; }

  insert(value: Row | Row[]) { this.action = 'insert'; this.payload = Array.isArray(value) ? value : [value]; return this; }
  upsert(value: Row | Row[], options?: { onConflict?: string }) {
    this.action = 'upsert'; this.payload = Array.isArray(value) ? value : [value];
    this.conflictColumn = options?.onConflict || 'id'; return this;
  }
  update(value: Row) { this.action = 'update'; this.updateValues = value; return this; }
  delete() { this.action = 'delete'; return this; }

  private matches(row: Row) { return this.filters.every(filter => filter(row)); }

  private uniqueConflict(candidate: Row, existing: Row[], exceptId?: unknown): boolean {
    const uniqueKeys: string[][] = [];
    if (this.table === 'communication_settings') uniqueKeys.push(['school_id']);
    if (this.table === 'payroll_records') uniqueKeys.push(['school_id', 'user_id', 'payroll_month']);
    if (this.table === 'schools') uniqueKeys.push(['code']);
    return uniqueKeys.some(keys => existing.some(row =>
      row.id !== exceptId && keys.every(key => row[key] === candidate[key])
    ));
  }

  private async execute(): Promise<any> {
    const rows = this.client.rowsFor(this.table);
    if (this.action === 'select') {
      let result = rows.filter(row => this.matches(row)).map(row => ({ ...row }));
      const count = result.length;
      for (const order of this.orderBy) {
        result.sort((a, b) => {
          const left = a[order.field], right = b[order.field];
          const comparison = left === right ? 0 : left === undefined ? -1 : right === undefined ? 1 : left < right ? -1 : 1;
          return order.ascending ? comparison : -comparison;
        });
      }
      if (this.to !== null) result = result.slice(this.from, this.to + 1);
      else if (this.maxRows !== null) result = result.slice(0, this.maxRows);
      if (this.headOnly) return { data: null, error: null, count };
      if (this.singleResult) return { data: result[0] || null, error: null, count };
      return { data: result, error: null, count: this.wantsCount ? count : null };
    }

    if (this.action === 'delete') {
      const removed = rows.filter(row => this.matches(row));
      this.client.replaceRows(this.table, rows.filter(row => !this.matches(row)));
      return { data: null, error: null, count: removed.length };
    }

    if (this.action === 'update') {
      const updated: Row[] = [];
      const next = rows.map(row => {
        if (!this.matches(row)) return row;
        const value = { ...row, ...this.updateValues };
        updated.push(value);
        return value;
      });
      this.client.replaceRows(this.table, next);
      return { data: updated, error: null, count: updated.length };
    }

    const next = [...rows];
    for (const candidate of this.payload) {
      const existingIndex = next.findIndex(row => row[this.conflictColumn] === candidate[this.conflictColumn]);
      if (this.action === 'upsert' && existingIndex >= 0) {
        const merged = { ...next[existingIndex], ...candidate };
        if (this.uniqueConflict(merged, next, next[existingIndex].id)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        next[existingIndex] = merged;
      } else {
        if (this.uniqueConflict(candidate, next)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        next.push({ ...candidate });
      }
    }
    this.client.replaceRows(this.table, next);
    return { data: this.action === 'insert' ? this.payload : null, error: null, count: this.payload.length };
  }

  then(resolve: (value: any) => any, reject?: (reason: any) => any) {
    return this.execute().then(resolve, reject);
  }
}

export class InMemorySupabase {
  public supportsSeparateAuthQueries = false;
  private tables = new Map<string, Row[]>();

  from(table: string) { return new MemoryQuery(this, table); }
  rowsFor(table: string) {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }
  replaceRows(table: string, rows: Row[]) { this.tables.set(table, rows); }
  async rpc(_name: string, _args?: any) {
    return { data: null, error: { code: 'PGRST202', message: 'RPC is not implemented by the in-memory test adapter.' } };
  }
}
