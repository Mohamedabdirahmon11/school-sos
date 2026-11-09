import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeSchoolSettings } from '../src/server/school-settings.ts';

test('school telephone is independent from the dedicated admin WhatsApp number', () => {
  const settings = sanitizeSchoolSettings({
    phone: '011 123 4567',
    whatsappPhone: '+251 911 234 567'
  });
  assert.equal(settings.phone, '011 123 4567');
  assert.equal(settings.whatsappPhone, '+251 911 234 567');
});

test('admin WhatsApp number must use an international country code', () => {
  assert.throws(
    () => sanitizeSchoolSettings({ whatsappPhone: '0911234567' }),
    /international number/
  );
  assert.equal(sanitizeSchoolSettings({ whatsappPhone: '' }).whatsappPhone, '');
});

test('school telephone can be saved without an admin WhatsApp number', () => {
  const settings = sanitizeSchoolSettings({ phone: '011 123 4567' });
  assert.equal(settings.phone, '011 123 4567');
  assert.equal(settings.whatsappPhone, undefined);
});
