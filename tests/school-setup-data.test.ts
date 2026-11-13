import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSchoolSetupSchoolUpdates, validateSchoolSetupStep } from '../src/server/school-setup-data.ts';

test('school profile requires valid contact details and a supported school type', () => {
  assert.equal(validateSchoolSetupStep(1, { schoolInformation: { name: 'Jijiga School', address: 'Main road', phone: '+251911234567', email: 'office@example.edu', schoolType: 'combined' } }), null);
  assert.match(validateSchoolSetupStep(1, { schoolInformation: { name: 'School', address: '', phone: '123', email: 'bad', schoolType: 'other' } }) || '', /required/);
});

test('academic year requires consecutive years and valid Gregorian dates', () => {
  assert.equal(validateSchoolSetupStep(2, { academicYear: { name: '2026/2027', isCurrent: true, startDate: '2026-09-01', endDate: '2027-06-30' } }), null);
  assert.match(validateSchoolSetupStep(2, { academicYear: { name: '2026/2028', isCurrent: true, startDate: '2026-02-31', endDate: '2027-06-30' } }) || '', /valid academic year/);
});

test('academic year cannot be changed to exclude already saved terms', () => {
  const existingData = { terms: [{ name: 'Term 1', startDate: '2026-09-01', endDate: '2027-01-01' }] };
  assert.equal(validateSchoolSetupStep(2, { academicYear: { name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30' } }, existingData), null);
  assert.match(validateSchoolSetupStep(2, { academicYear: { name: '2026/2027', startDate: '2026-10-01', endDate: '2027-06-30' } }, existingData) || '', /would exclude saved terms/);
});

test('terms allow one to three non-overlapping periods only', () => {
  assert.equal(validateSchoolSetupStep(3, { terms: [{ name: 'Term 1', startDate: '2026-09-01', endDate: '2027-01-01' }, { name: 'Term 2', startDate: '2027-01-02', endDate: '2027-06-30' }] }), null);
  assert.match(validateSchoolSetupStep(3, { terms: [{ name: 'Term 1', startDate: '2026-09-01', endDate: '2027-02-01' }, { name: 'Term 2', startDate: '2027-01-15', endDate: '2027-06-30' }] }) || '', /must not overlap/);
  assert.match(validateSchoolSetupStep(3, { terms: [] }) || '', /1–3 terms/);
});

test('terms must stay within the configured academic year', () => {
  const academicYear = { name: '2026/2027', isCurrent: true, startDate: '2026-09-01', endDate: '2027-06-30' };
  assert.equal(validateSchoolSetupStep(3, { terms: [{ name: 'Term 1', startDate: '2026-09-01', endDate: '2027-01-01' }] }, { academicYear }), null);
  assert.match(validateSchoolSetupStep(3, { terms: [{ name: 'Term 1', startDate: '2026-08-31', endDate: '2027-01-01' }] }, { academicYear }) || '', /within the selected academic year/);
  assert.match(validateSchoolSetupStep(3, { terms: [{ name: 'Term 1', startDate: '2026-09-01', endDate: '2027-07-01' }] }, { academicYear }) || '', /within the selected academic year/);
});

test('academic calendar requires non-overlapping working days and valid holidays', () => {
  const calendar = { workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], weeklyHolidays: ['Saturday', 'Sunday'], calendarType: 'both', nationalHolidays: [{ name: 'New Year', date: '2026-09-11', calendar: 'ethiopian' }], schoolHolidays: [{ name: 'Break', startDate: '2026-12-20', endDate: '2026-12-25' }] };
  assert.equal(validateSchoolSetupStep(4, { calendar }), null);
  assert.match(validateSchoolSetupStep(4, { calendar: { ...calendar, weeklyHolidays: ['Monday'] } }) || '', /seven days/);
  assert.match(validateSchoolSetupStep(4, { calendar: { ...calendar, workingDays: ['Monday'], weeklyHolidays: ['Saturday', 'Sunday'] } }) || '', /seven days/);
});

test('working hours enforce time ordering and a bounded period count', () => {
  const workingHours = { openingTime: '07:30', classStartTime: '08:00', closingTime: '16:00', breakStartTime: '10:00', breakEndTime: '10:30', periodsPerDay: 8 };
  assert.equal(validateSchoolSetupStep(5, { workingHours }), null);
  assert.match(validateSchoolSetupStep(5, { workingHours: { ...workingHours, breakEndTime: '07:00' } }) || '', /not in the correct order/);
  assert.match(validateSchoolSetupStep(5, { workingHours: { ...workingHours, periodsPerDay: 20 } }) || '', /1–16 daily periods/);
});

test('academic year is only made current when the administrator selects the current-year option', () => {
  const school = { academicYear: '2025-2026', terms: undefined } as any;
  const data = { academicYear: { name: '2026/2027', isCurrent: false }, completedSteps: [1, 2] };
  const updates = buildSchoolSetupSchoolUpdates(2, data, school, { currentStep: 3, completedSteps: [1, 2], skippedSteps: [], completedAt: null });
  assert.equal(updates.academicYear, undefined);
  assert.deepEqual(updates.setupData, data);
  const currentUpdates = buildSchoolSetupSchoolUpdates(2, { ...data, academicYear: { ...data.academicYear, isCurrent: true } }, school, undefined);
  assert.equal(currentUpdates.academicYear, '2026-2027');
});

test('three configured terms are preserved and legacy semester dates span the first and last terms', () => {
  const school = { terms: undefined } as any;
  const data = { terms: [
    { name: 'Term 1', startDate: '2026-09-01', endDate: '2026-11-30' },
    { name: 'Term 2', startDate: '2026-12-01', endDate: '2027-03-01' },
    { name: 'Term 3', startDate: '2027-03-02', endDate: '2027-06-30' }
  ] };
  const updates = buildSchoolSetupSchoolUpdates(3, data, school, undefined);
  assert.deepEqual(updates.terms, {
    semester1Start: '2026-09-01', semester1End: '2026-11-30',
    semester2Start: '2027-03-02', semester2End: '2027-06-30'
  });
});
