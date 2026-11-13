import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSchoolSetupStep } from '../src/server/school-setup-data.ts';

test('school profile requires valid contact details and a supported school type', () => {
  assert.equal(validateSchoolSetupStep(1, { schoolInformation: { name: 'Jijiga School', address: 'Main road', phone: '+251911234567', email: 'office@example.edu', schoolType: 'combined' } }), null);
  assert.match(validateSchoolSetupStep(1, { schoolInformation: { name: 'School', address: '', phone: '123', email: 'bad', schoolType: 'other' } }) || '', /required/);
});

test('academic year requires consecutive years and valid Gregorian dates', () => {
  assert.equal(validateSchoolSetupStep(2, { academicYear: { name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30' } }), null);
  assert.match(validateSchoolSetupStep(2, { academicYear: { name: '2026/2028', startDate: '2026-02-31', endDate: '2027-06-30' } }) || '', /valid academic year/);
});

test('terms allow one to three non-overlapping periods only', () => {
  assert.equal(validateSchoolSetupStep(3, { terms: [{ name: 'Term 1', startDate: '2026-09-01', endDate: '2027-01-01' }, { name: 'Term 2', startDate: '2027-01-02', endDate: '2027-06-30' }] }), null);
  assert.match(validateSchoolSetupStep(3, { terms: [{ name: 'Term 1', startDate: '2026-09-01', endDate: '2027-02-01' }, { name: 'Term 2', startDate: '2027-01-15', endDate: '2027-06-30' }] }) || '', /must not overlap/);
  assert.match(validateSchoolSetupStep(3, { terms: [] }) || '', /1–3 terms/);
});

test('terms must stay within the configured academic year', () => {
  const academicYear = { name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30' };
  assert.equal(validateSchoolSetupStep(3, { terms: [{ name: 'Term 1', startDate: '2026-09-01', endDate: '2027-01-01' }] }, { academicYear }), null);
  assert.match(validateSchoolSetupStep(3, { terms: [{ name: 'Term 1', startDate: '2026-08-31', endDate: '2027-01-01' }] }, { academicYear }) || '', /within the selected academic year/);
  assert.match(validateSchoolSetupStep(3, { terms: [{ name: 'Term 1', startDate: '2026-09-01', endDate: '2027-07-01' }] }, { academicYear }) || '', /within the selected academic year/);
});

test('academic calendar requires non-overlapping working days and valid holidays', () => {
  const calendar = { workingDays: ['Monday', 'Tuesday'], weeklyHolidays: ['Saturday', 'Sunday'], calendarType: 'both', nationalHolidays: [{ name: 'New Year', date: '2026-09-11', calendar: 'ethiopian' }], schoolHolidays: [{ name: 'Break', startDate: '2026-12-20', endDate: '2026-12-25' }] };
  assert.equal(validateSchoolSetupStep(4, { calendar }), null);
  assert.match(validateSchoolSetupStep(4, { calendar: { ...calendar, weeklyHolidays: ['Monday'] } }) || '', /without overlap/);
});

test('working hours enforce time ordering and a bounded period count', () => {
  const workingHours = { openingTime: '07:30', classStartTime: '08:00', closingTime: '16:00', breakStartTime: '10:00', breakEndTime: '10:30', periodsPerDay: 8 };
  assert.equal(validateSchoolSetupStep(5, { workingHours }), null);
  assert.match(validateSchoolSetupStep(5, { workingHours: { ...workingHours, breakEndTime: '07:00' } }) || '', /not in the correct order/);
  assert.match(validateSchoolSetupStep(5, { workingHours: { ...workingHours, periodsPerDay: 20 } }) || '', /1–16 daily periods/);
});
