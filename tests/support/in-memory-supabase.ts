import { db } from '../../src/server/storage.ts';

type Filter = { column: string; operator: 'eq' | 'in' | 'ilike'; value: any };

const camel = (value: string) => value.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
const valueFor = (row: Record<string, any>, column: string) => row[column] ?? row[camel(column)];

function splitOrTerms(expression: string): string[] {
  const terms: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < expression.length; index += 1) {
    if (expression[index] === '(') depth += 1;
    else if (expression[index] === ')') depth = Math.max(0, depth - 1);
    else if (expression[index] === ',' && depth === 0) {
      terms.push(expression.slice(start, index));
      start = index + 1;
    }
  }
  terms.push(expression.slice(start));
  return terms.filter(Boolean);
}

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
    return splitOrTerms(expression).some(part => {
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
      if (data.length === 0 && this.singleMode === 'maybeSingle') return { data: null, error: null, count };
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
  supportsSeparateAuthQueries = true;
  private tables = new Map<string, any[]>();

  rows(table: string): any[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  replaceRows(table: string, rows: any[]) { this.tables.set(table, rows); }
  from(table: string) { return new MemoryQuery(this, table); }
  private failBulkImport = false;
  private failAdmissionApproval = false;

  failNextBulkImport() { this.failBulkImport = true; }
  failNextAdmissionApproval() { this.failAdmissionApproval = true; }

  async rpc(name: string, args?: any) {
    if (name === 'schoolos_next_fee_receipt') {
      const schoolId = String(args?.p_school_id || '');
      const academicYear = String(args?.p_academic_year || '');
      if (!schoolId || !academicYear) return { data: null, error: { message: 'School and academic year are required.' } };
      const sequenceRows = this.rows('fee_receipt_sequences');
      const sequenceId = `${schoolId}:${academicYear}`;
      const existing = sequenceRows.find(row => row.id === sequenceId);
      const maxReceipt = this.rows('fee_payments')
        .filter(row => (row.schoolId ?? row.school_id) === schoolId && (row.academicYear ?? row.academic_year) === academicYear)
        .reduce((max, row) => {
          const receipt = String(row.receiptNumber ?? row.receipt_number ?? '');
          const suffix = receipt.match(/(\d+)$/)?.[1];
          return suffix ? Math.max(max, Number(suffix) || 0) : max;
        }, 0);
      const nextValue = Math.max(Number(existing?.nextValue || 0) + 1, maxReceipt + 1);
      if (existing) existing.nextValue = nextValue;
      else sequenceRows.push({ id: sequenceId, schoolId, academicYear, nextValue });
      return { data: nextValue, error: null };
    }
    if (name === 'schoolos_apply_fee_installment') {
      const payment = this.rows('fee_payments').find(row =>
        String(row.id) === String(args?.p_payment_id)
        && String(row.schoolId ?? row.school_id) === String(args?.p_school_id)
      );
      if (!payment || payment.voidedAt || payment.voided_at) return { data: null, error: { message: 'The fee installment was not found or has been voided.' } };
      const keys = payment.idempotencyKeys ?? payment.idempotency_keys ?? [];
      const key = args?.p_idempotency_key || null;
      if (key && (payment.idempotencyKey === key || payment.idempotency_key === key || keys.includes(key))) return { data: payment, error: null };
      const amountDue = Number(payment.amountDue ?? payment.amount_due);
      const amountPaid = Number(payment.amountPaid ?? payment.amount_paid) + Number(args?.p_amount_paid || 0);
      if (String(payment.status) === 'paid') return { data: null, error: { message: 'This fee is already fully paid for the selected billing period.' } };
      if (amountPaid > amountDue) return { data: null, error: { message: 'Cash paid cannot exceed the remaining fee balance.' } };
      const remaining = amountDue - amountPaid;
      const status = remaining === 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';
      const nextKeys = key ? [...keys, key] : keys;
      const notes = args?.p_notes ? [payment.notes, String(args.p_notes).trim()].filter(Boolean).join(' · ') : payment.notes;
      Object.assign(payment, {
        amountPaid, amount_paid: amountPaid, remainingAmount: remaining, remaining_amount: remaining,
        status, date: new Date().toISOString().slice(0, 10), recordedBy: args?.p_recorded_by, recorded_by: args?.p_recorded_by,
        idempotencyKeys: nextKeys, idempotency_keys: nextKeys, notes
      });
      return { data: payment, error: null };
    }
    if (name === 'schoolos_void_fee_payment') {
      const payment = this.rows('fee_payments').find(row =>
        String(row.id) === String(args?.p_payment_id)
        && String(row.schoolId ?? row.school_id) === String(args?.p_school_id)
      );
      if (!payment || payment.voidedAt || payment.voided_at) return { data: null, error: null };
      const now = new Date().toISOString();
      Object.assign(payment, {
        voidedAt: now,
        voided_at: now,
        voidedBy: args?.p_user_id,
        voided_by: args?.p_user_id,
        voidReason: String(args?.p_reason || '').trim(),
        void_reason: String(args?.p_reason || '').trim()
      });
      return { data: payment, error: null };
    }
    if (name === 'schoolos_approve_admission') {
      const payload = args?.p_payload || {};
      const tables = ['admission_applications', 'classes', 'students', 'users', 'audit_logs'];
      const snapshots = new Map<string, any[]>(tables.map(table => [table, structuredClone(this.rows(table))] as [string, any[]]));
      const field = (row: any, camel: string, snake: string) => row?.[camel] ?? row?.[snake];
      try {
        const application = this.rows('admission_applications').find(row =>
          String(row.id) === String(payload.application_id)
          && String(field(row, 'schoolId', 'school_id')) === String(payload.school_id)
        );
        if (!application) throw new Error('Admission application not found.');
        if (field(application, 'status', 'status') !== 'pending') throw new Error('Admission application has already been processed.');
        const classId = field(application, 'classId', 'class_id');
        const klass = this.rows('classes').find(row =>
          String(row.id) === String(classId)
          && String(field(row, 'schoolId', 'school_id')) === String(payload.school_id)
          && field(row, 'isArchived', 'is_archived') !== true
        );
        if (!klass) throw new Error('The selected class is unavailable or belongs to another school.');
        const enrolled = this.rows('students').filter(row =>
          String(field(row, 'schoolId', 'school_id')) === String(payload.school_id)
          && String(field(row, 'classId', 'class_id')) === String(classId)
          && field(row, 'status', 'status') === 'active'
        ).length;
        if (enrolled >= Number(field(klass, 'capacity', 'capacity') ?? 40)) throw new Error('The selected class has reached capacity.');
        const camelize = (row: Record<string, any>) => Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_m, letter) => letter.toUpperCase()), value])
        );
        const student = camelize({
          id: payload.student_record_id, school_id: payload.school_id,
          branch_id: field(klass, 'branchId', 'branch_id') || null,
          student_id: payload.student_id, first_name: field(application, 'firstName', 'first_name'),
          middle_name: field(application, 'middleName', 'middle_name') || '',
          last_name: field(application, 'lastName', 'last_name'),
          gender: field(application, 'gender', 'gender'),
          admission_date: new Date().toISOString().slice(0, 10),
          father_phone: field(application, 'fatherPhone', 'father_phone') || '',
          mother_phone: field(application, 'motherPhone', 'mother_phone') || null,
          class_id: classId, section: field(klass, 'section', 'section') || 'A',
          status: 'active', pin_hash: payload.pin_hash
        });
        this.rows('students').push(student);
        this.rows('users').push(camelize({
          id: payload.student_user_id, school_id: payload.school_id, role: 'student',
          full_name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' '),
          phone: student.fatherPhone || student.motherPhone, student_id: payload.student_id,
          password_hash: '', pin_hash: payload.pin_hash, is_blocked: false, failed_login_attempts: 0
        }));
        const parentPhones = [...new Set([student.fatherPhone, student.motherPhone].filter(Boolean).map((p: string) => p.trim()))];
        for (const phone of parentPhones) {
          const normalize = (value: string) => value.replace(/[\\s()-]/g, '');
          const existing = this.rows('users').find(row =>
            String(field(row, 'schoolId', 'school_id')) === String(payload.school_id)
            && field(row, 'role', 'role') === 'parent'
            && [field(row, 'phone', 'phone'), field(row, 'parentPhone', 'parent_phone')].some((value: string) => value && normalize(value) === normalize(phone))
          );
          if (existing) {
            const links = field(existing, 'linkedStudentIds', 'linked_student_ids') || [];
            if (!links.includes(payload.student_record_id)) existing.linkedStudentIds = [...links, payload.student_record_id];
            if (!existing.phone) existing.phone = phone;
            if (!existing.parentPhone) existing.parentPhone = phone;
          } else {
            this.rows('users').push({
              id: 'usr-parent-' + payload.student_record_id + '-' + this.rows('users').length,
              schoolId: payload.school_id, role: 'parent',
              fullName: 'Parent of ' + student.firstName, phone, parentPhone: phone,
              passwordHash: '', pinHash: payload.pin_hash,
              linkedStudentIds: [payload.student_record_id], isBlocked: false, failedLoginAttempts: 0
            });
          }
        }
        if (this.failAdmissionApproval) {
          this.failAdmissionApproval = false;
          throw new Error('Simulated failure before admission commit.');
        }
        application.status = 'approved';
        application.studentId = payload.student_id;
        this.rows('audit_logs').push({
          id: 'audit-admission-' + payload.student_record_id,
          action: 'ADMISSION_APPLICATION_APPROVED', category: 'school',
          schoolId: payload.school_id, userId: payload.approved_by,
          userName: payload.approved_by_name, userRole: payload.approved_by_role,
          details: 'Admission application ' + payload.application_id + ' approved.',
          severity: 'info', timestamp: new Date().toISOString()
        });
        return { data: { status: 'approved', student_id: payload.student_id }, error: null };
      } catch (error) {
        for (const [table, rows] of snapshots) this.replaceRows(table, rows);
        return { data: null, error: { message: error instanceof Error ? error.message : 'Atomic admission approval failed.' } };
      }
    }
    if (name !== 'schoolos_bulk_import') return { data: null, error: null };
    if (this.failBulkImport) {
      this.failBulkImport = false;
      return { data: null, error: { message: 'Simulated atomic bulk import failure.' } };
    }

    const payload = args?.p_payload || {};
    const toCamel = (row: Record<string, any>) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase()), value])
    );
    const snapshots = new Map<string, any[]>(['classes', 'students', 'users', 'audit_logs'].map(table => [table, structuredClone(this.rows(table))] as [string, any[]]));
    try {
      this.rows('classes').push(...(payload.classes || []).map(toCamel));
      this.rows('students').push(...(payload.students || []).map((row: Record<string, any>) => ({
        ...toCamel(row), admissionDate: new Date().toISOString().slice(0, 10), status: 'active'
      })));
      for (const incoming of (payload.users || []).map(toCamel)) {
        const existing = this.rows('users').find(row => row.id === incoming.id);
        if (existing) {
          existing.linkedStudentIds = incoming.linkedStudentIds;
          if (!existing.pinHash) existing.pinHash = incoming.pinHash;
          if (existing.role === 'parent' && existing.fullName === '') existing.fullName = incoming.fullName;
          if (!existing.phone) existing.phone = incoming.phone;
          if (!existing.parentPhone) existing.parentPhone = incoming.parentPhone;
        } else {
          this.rows('users').push({ ...incoming, passwordHash: '', isBlocked: false, failedLoginAttempts: 0 });
        }
      }
      this.rows('audit_logs').push(...(payload.audit_logs || []).map((row: Record<string, any>) => ({
        ...toCamel(row), severity: 'info'
      })));
      return { data: null, error: null };
    } catch (error) {
      for (const [table, rows] of snapshots) this.replaceRows(table, rows);
      return { data: null, error: { message: error instanceof Error ? error.message : 'Atomic import failed.' } };
    }
  }
}

export function createHttpTestStorage(memory: InMemorySupabase) {
  db.setTestClient(memory);
  return db;
}
