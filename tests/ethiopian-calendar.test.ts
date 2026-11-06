import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ethiopianToGregorian,
  formatSchoolDate,
  gregorianAcademicYearToSchool,
  gregorianToEthiopian,
  gregorianToSchoolDate,
  schoolAcademicYearToGregorian,
  schoolDateToGregorian
} from '../src/lib/ethiopian-calendar.ts';

test('converts Ethiopian New Year dates across Gregorian year boundaries', () => {
  assert.deepEqual(gregorianToEthiopian('2015-09-12'), { year: 2008, month: 1, day: 1 });
  assert.equal(ethiopianToGregorian({ year: 2008, month: 1, day: 1 }), '2015-09-12');
  assert.deepEqual(gregorianToEthiopian('2016-09-11'), { year: 2009, month: 1, day: 1 });
});

test('round-trips Ethiopian dates including the short thirteenth month', () => {
  for (const date of [
    { year: 2007, month: 13, day: 6 },
    { year: 2008, month: 13, day: 5 },
    { year: 2019, month: 2, day: 27 }
  ]) {
    const gregorian = ethiopianToGregorian(date);
    assert.deepEqual(gregorianToEthiopian(gregorian), date);
  }
});

test('rejects invalid Ethiopian and Gregorian dates', () => {
  assert.throws(() => ethiopianToGregorian({ year: 2008, month: 13, day: 6 }), /Invalid Ethiopian date/);
  assert.throws(() => ethiopianToGregorian({ year: 2008, month: 14, day: 1 }), /Invalid Ethiopian date/);
  assert.throws(() => gregorianToEthiopian('2026-02-30'), /Invalid Gregorian date/);
});

test('school date adapters preserve Gregorian storage and format Ethiopian display dates', () => {
  assert.equal(schoolDateToGregorian('2019-02-27', 'ethiopian'), '2026-11-06');
  assert.equal(gregorianToSchoolDate('2026-11-06', 'ethiopian'), '2019-02-27');
  assert.equal(schoolDateToGregorian('2026-11-06', 'gregorian'), '2026-11-06');
  assert.equal(gregorianToSchoolDate('2026-11-06', 'gregorian'), '2026-11-06');
  assert.ok(formatSchoolDate('2026-11-06', 'ethiopian').length > 0);
});

test('converts academic year labels while keeping Gregorian database values', () => {
  assert.equal(gregorianAcademicYearToSchool('2026-2027', 'ethiopian'), '2019-2020');
  assert.equal(schoolAcademicYearToGregorian('2019-2020', 'ethiopian'), '2026-2027');
  assert.equal(gregorianAcademicYearToSchool('2026-2027', 'gregorian'), '2026-2027');
  assert.equal(schoolAcademicYearToGregorian('2026-2027', 'gregorian'), '2026-2027');
});
