import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const storage = read('../src/server/storage.ts');
const api = read('../src/server/api.ts');
const support = read('../src/components/superadmin/SupportAuditView.tsx');

test('support ticket creation and replies are persisted before returning', () => {
  const createStart = storage.indexOf('public async createTicket(');
  const replyStart = storage.indexOf('public async replyTicket(');
  const create = storage.slice(createStart, replyStart);
  const reply = storage.slice(replyStart, storage.indexOf('// SUBSCRIPTION INVOICES', replyStart));
  assert.match(create, /this\.save\(\);\s*await this\.flush\(\);\s*return ticket;/);
  assert.match(reply, /this\.save\(\);\s*await this\.flush\(\);\s*return ticket;/);
});

test('Super Admin can resolve, close, or keep a ticket in progress', () => {
  const routeStart = api.indexOf("apiRouter.post('/support/tickets/:id/reply'");
  const routeEnd = api.indexOf('// School Data Backup', routeStart);
  const route = api.slice(routeStart, routeEnd);
  assert.match(route, /allowedTicketStatuses = \['open', 'in_progress', 'resolved', 'closed'\]/);
  assert.match(route, /user\.role === 'super_admin' && requestedStatus/);
  assert.match(route, /status: requestedStatus/);
  assert.match(storage, /ticket\.status = reply\.status \|\| 'in_progress'/);
});

test('support reply UI prevents duplicate sends and displays persistence failures', () => {
  assert.match(support, /if \(!selectedTicket \|\| !replyText\.trim\(\) \|\| isReplying\) return/);
  assert.match(support, /setReplyError/);
  assert.match(support, /disabled=\{isReplying \|\| !replyText\.trim\(\)\}/);
  assert.match(support, /isReplying \? 'Sending…' : 'Send Reply'/);
});

test('manual and immediate platform broadcasts persist audit events before success', () => {
  const immediateStart = api.indexOf("apiRouter.post('/superadmin/broadcasts'");
  const manualStart = api.indexOf("apiRouter.post('/superadmin/broadcasts/:id/send'");
  const invoicesStart = api.indexOf("apiRouter.get('/superadmin/invoices'");
  const immediate = api.slice(immediateStart, manualStart);
  const manual = api.slice(manualStart, invoicesStart);
  assert.match(immediate, /db\.logAudit\([\s\S]*?await db\.flush\(\)/);
  assert.match(manual, /db\.logAudit\([\s\S]*?await db\.flush\(\)/);
});

test('school backup audit is written only after a backup is available and flushed before response', () => {
  const start = api.indexOf("apiRouter.get('/school/backup'");
  const end = api.indexOf("apiRouter.post('/school/backup/restore/preview'", start);
  const route = api.slice(start, end);
  assert.ok(route.indexOf('const backup = await db.generateSchoolBackup') < route.indexOf('db.logAudit('));
  assert.match(route, /await db\.flush\(\);\s*res\.json\(backup\)/);
});


test('support ticket desk supports server-side search and status filtering without widening tenant scope', () => {
  const routeStart = api.indexOf("apiRouter.get('/support/tickets'");
  const routeEnd = api.indexOf("apiRouter.post('/support/tickets'", routeStart);
  const route = api.slice(routeStart, routeEnd);
  assert.match(route, /filters\.school_id = user\.schoolId/);
  assert.match(route, /filters\.created_by_user_id = user\.id/);
  assert.match(route, /allowedStatuses = \['open', 'in_progress', 'resolved', 'closed'\]/);
  assert.match(route, /filters\.status = requestedStatus/);
  assert.match(route, /ticket_number\.ilike/);
  assert.match(route, /subject\.ilike/);
  assert.match(route, /school_name\.ilike/);
  assert.match(route, /sendDatabasePage\(req, res, 'support_tickets', filters, orFilter\)/);
  assert.match(support, /ticketSearch/);
  assert.match(support, /ticketStatus/);
  assert.match(support, /Search ticket number, subject, school, or description/);
  assert.match(support, /In progress/);
});
