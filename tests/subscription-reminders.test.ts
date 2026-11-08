import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReminderEmail, reminderStageFor } from '../src/server/subscription-reminders.ts';

const sub = (validUntil: string, extra: Record<string, unknown> = {}) => ({ cadence: 'monthly', status: 'active', validUntil, graceDays: 7, ...extra });
const at = (iso: string) => new Date(iso);

test('reminder stage follows the days left before expiry', () => {
  const end = '2026-12-01T00:00:00.000Z';
  assert.equal(reminderStageFor(sub(end), at('2026-11-20T00:00:00.000Z')), null);
  assert.equal(reminderStageFor(sub(end), at('2026-11-24T00:00:00.000Z')), 'before_7');
  assert.equal(reminderStageFor(sub(end), at('2026-11-28T00:00:00.000Z')), 'before_3');
  assert.equal(reminderStageFor(sub(end), at('2026-11-30T12:00:00.000Z')), 'before_1');
});

test('reminder stage after expiry is grace, then read_only', () => {
  const end = '2026-12-01T00:00:00.000Z';
  assert.equal(reminderStageFor(sub(end), at('2026-12-03T00:00:00.000Z')), 'grace');
  assert.equal(reminderStageFor(sub(end), at('2026-12-09T00:00:00.000Z')), 'read_only');
});

test('lifetime, suspended and invalid subscriptions get no reminder', () => {
  const end = '2026-12-01T00:00:00.000Z';
  assert.equal(reminderStageFor(sub(end, { cadence: 'lifetime' }), at('2026-11-30T00:00:00.000Z')), null);
  assert.equal(reminderStageFor(sub(end, { status: 'suspended' }), at('2026-11-30T00:00:00.000Z')), null);
  assert.equal(reminderStageFor(sub('not-a-date'), at('2026-11-30T00:00:00.000Z')), null);
  assert.equal(reminderStageFor(undefined, at('2026-11-30T00:00:00.000Z')), null);
});

test('reminder email is localized and escapes the school name', () => {
  const en = buildReminderEmail('before_7', 'en', 'A <b>School</b>', '2026-12-01T00:00:00.000Z');
  assert.match(en.text, /2026-12-01/);
  assert.ok(!en.html.includes('<b>School</b>'));
  const so = buildReminderEmail('grace', 'so', 'Dugsi', '2026-12-01T00:00:00.000Z');
  assert.match(so.subject, /Rukhsadda/);
});
