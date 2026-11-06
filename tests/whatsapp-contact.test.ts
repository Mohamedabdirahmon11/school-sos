import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { normalizeWhatsAppNumber } from '../src/lib/whatsapp.ts';
import { sanitizeSchoolSettings } from '../src/server/school-settings.ts';

test('WhatsApp numbers must be explicitly international and normalize to wa.me digits', () => {
  assert.equal(normalizeWhatsAppNumber('+251 91 234 5678'), '251912345678');
  assert.equal(normalizeWhatsAppNumber('00251 (91) 234-5678'), '251912345678');
  assert.equal(normalizeWhatsAppNumber('0912345678'), null);
  assert.equal(normalizeWhatsAppNumber('251912345678'), null);
  assert.equal(normalizeWhatsAppNumber('+1234567'), null);
  assert.equal(normalizeWhatsAppNumber('+1234567890123456'), null);
  assert.equal(normalizeWhatsAppNumber('+251ABC1234567'), null);
});

test('school WhatsApp contact is validated by the server settings sanitizer', () => {
  assert.equal(sanitizeSchoolSettings({ phone: '+251912345678' }).phone, '+251912345678');
  assert.throws(() => sanitizeSchoolSettings({ phone: '0912345678' }), /international number/);
});

test('attendance and manual WhatsApp actions use the same validator and never auto-send', () => {
  const attendance = readFileSync(new URL('../src/components/schooladmin/AttendanceView.tsx', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/components/schooladmin/SchoolSettingsView.tsx', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const guide = readFileSync(new URL('../docs/notification-providers.md', import.meta.url), 'utf8');
  assert.ok(attendance.includes("import { normalizeWhatsAppNumber } from '../../lib/whatsapp.ts'"));
  assert.ok(settings.includes("import { normalizeWhatsAppNumber } from '../../lib/whatsapp.ts'"));
  assert.ok(attendance.includes('window.open(url'));
  assert.ok(attendance.includes('if (!adminWhatsAppNumber)'));
  assert.ok(attendance.includes('window.open(url, \'_blank\''));
  assert.ok(settings.includes('if (phone.trim() && !normalizeWhatsAppNumber(phone))'));
  assert.ok(api.includes('Paid provider settings and queued delivery endpoints are intentionally disabled.'));
  assert.match(guide, /administrator-owned WhatsApp account/);
  assert.match(guide, /does not send WhatsApp messages automatically/);
});


test('attendance WhatsApp action is clearly labeled and aligned with its table column', () => {
  const attendance = readFileSync(new URL('../src/components/schooladmin/AttendanceView.tsx', import.meta.url), 'utf8');
  assert.match(attendance, /Parent WhatsApp/);
  assert.match(attendance, /After saving, open WhatsApp for each absent student's parent and send the prepared message manually/);
  assert.match(attendance, /std\.fatherPhone \|\| std\.motherPhone \|\| 'N\/A'/);
});
