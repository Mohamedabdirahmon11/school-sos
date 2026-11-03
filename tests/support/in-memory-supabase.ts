import { db } from '../../src/server/storage.ts';

type Filter = { column: string; operator: 'eq' | 'in' | 'ilike'; value: any };

const camel = (value: string) => value.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
const valueFor = (row: Record<string, any>, column: string) => row[column] ?? row[camel(column)];

class MemoryQuery implements PromiseLike<any> {
  private operation: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private columns = '*';
  private options: any = {};
  private filters: Filter[] = [];
  private orFilters: string[] = [];
  private sort: Array<{ column: string; ascending: boolean }> = [];
  private from = 0;
  private to = Number.POSITIVE_INFINITY;
  private payload: any;
  private conflict = 'id';
  private singleMode: 'single' | 'maybeSingle' | null = null;

  constructor(private readonly owner: InMemorySupabase, private readonly table: string) {}

  select(columns = '*', options: any = {}) { this.columns = columns; this.options = options; return this; }
  eq(column: string, value: any) { this.filters.push({ column, operator: 'eq', value }); return this; }
  in(column: string, values: any[]) { this.filters.push({ column, operator: 'in', value: values }); return this; }
  ilike(column: string, value: string) { this.filters.push({ column, operator: 'ilike', value }); return this; }
  or(expression: string) { if (expression) this.orFilters.push(expression); return this; }
  order(column: string, options: any = {}) { this.sort.push({ column, ascending: options.ascending !== false }); return this; }
  range(from: number, to: number) { this.from = Math.max(0, from); this.to = Math.max(this.from, to); return this; }
  limit(count: number) { this.to = Math.min(this.to, this.from + Math.max(0, count) - 1); return this; }
  maybeSingle() { this.singleMode = 'maybeSingle'; return this; }
  single() { this.singleMode = 'single'; return this; }
  insert(rows: any) { this.operation = 'insert'; this.payload = rows; return this; }
  upsert(rows: any, options: any = {}) { this.operation = 'upsert'; this.payload = rows; this.conflict = options.onConflict || 'id'; return this; }
  update(values: any) { this.operation = 'update'; this.payload = values; return this; }
  delete() { this.operation = 'delete'; return this; }

  private matches(row: Record<string, any>, filter: Filter): boolean {
    const value = valueFor(row, filter.column);
    if (filter.operator === 'eq') return String(value ?? '') === String(filter.value ?? '');
    if (filter.operator === 'in') return (filter.value || []).some((candidate: any) => String(value ?? '') === String(candidate ?? ''));
    const pattern = String(filter.value).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp('^' + pattern + '$', 'i').test(String(value ?? ''));
  }

  private matchesOr(row: Record<string, any>, expression: string): boolean {
    return expression.split(',').some(part => {
      const match = /^([a-zA-Z0-9_]+)\.(eq|ilike|in)\.(.*)$/.exec(part.trim());
      if (!match) return false;
      const [, column, operator, raw] = match;
      if (operator === 'eq') return String(valueFor(row, column) ?? '') === raw;
      if (operator === 'in') {
        const values = raw.replace(/^\(|\)$/g, '').split(',');
        return values.includes(String(valueFor(row, column) ?? ''));
      }
      const pattern = raw.replace(/^\*|\*$/g, '').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      return new RegExp(pattern, 'i').test(String(valueFor(row, column) ?? ''));
    });
  }

  private project(row: Record<string, any>) {
    if (!this.columns || this.columns === '*' || this.columns.includes('!inner')) return { ...row };
    const selected: Record<string, any> = {};
    for (const item of this.columns.split(',')) {
      const column = item.trim();
      if (!column || column.includes(':') || column.includes('(')) continue;
      selected[column] = valueFor(row, column);
    }
    return selected;
  }

  private async execute(): Promise<any> {
    const rows = this.owner.rows(this.table);
    if (this.operation === 'insert') {
      const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row: any) => ({ ...row }));
      rows.push(...inserted);
      return { data: inserted, error: null, count: inserted.length };
    }
    if (this.operation === 'upsert') {
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row: any) => ({ ...row }));
      const keys = this.conflict.split(',').map((key: string) => key.trim());
      const written = incoming.map((row: any) => {
        const existing = rows.find(current => keys.every(key => String(valueFor(current, key) ?? '') === String(valueFor(row, key) ?? '')));
        if (existing) { Object.assign(existing, row); return existing; }
        rows.push(row);
        return row;
      });
      return { data: written, error: null, count: written.length };
    }

    let selected = rows.filter(row => this.filters.every(filter => this.matches(row, filter)));
    if (this.orFilters.length) selected = selected.filter(row => this.orFilters.every(filter => this.matchesOr(row, filter)));

    if (this.operation === 'delete') {
      const removed = new Set(selected);
      const remaining = rows.filter(row => !removed.has(row));
      this.owner.replaceRows(this.table, remaining);
      return { data: selected, error: null, count: selected.length };
    }
    if (this.operation === 'update') {
      for (const row of selected) Object.assign(row, this.payload);
      return { data: selected, error: null, count: selected.length };
    }

    for (const sort of [...this.sort].reverse()) {
      selected.sort((left, right) => {
        const a = valueFor(left, sort.column);
        const b = valueFor(right, sort.column);
        const comparison = String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true });
        return sort.ascending ? comparison : -comparison;
      });
    }
    const count = selected.length;
    if (this.options.head) return { data: null, error: null, count };
    selected = selected.slice(this.from, Number.isFinite(this.to) ? this.to + 1 : undefined);
    let data = selected.map(row => this.project(row));
    if (this.singleMode) {
      if (data.length === 0 && this.singleMode === 'maybeSingle') data = [];
      else if (data.length !== 1) return { data: null, error: { message: 'Expected a single row.' }, count };
      else return { data: data[0], error: null, count };
    }
    return { data, error: null, count };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled || undefined, onrejected || undefined);
  }
}

export class InMemorySupabase {
  readonly supportsSeparateAuthQueries = true;
  private tables = new Map<string, any[]>();

  rows(table: string): any[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  replaceRows(table: string, rows: any[]) { this.tables.set(table, rows); }
  from(table: string) { return new MemoryQuery(this, table); }
  async rpc(_name: string, _args?: any) { return { data: null, error: null }; }
}

export function createHttpTestStorage(memory: InMemorySupabase) {
  db.setTestClient(memory);
  return db;
}
