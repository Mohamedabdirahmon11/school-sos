import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { InMemorySupabase } from './support/in-memory-supabase.ts';

process.env.NODE_ENV = 'test';
process.env.SUPER_ADMIN_EMAIL = 'academics-test@example.test';
process.env.SUPER_ADMIN_PASSWORD = randomBytes(32).toString('hex');

test('exam limits and top-N pass-mark promotions are enforced and archived', async () => {
  const memory = new InMemorySupabase();
  const storage = await import('../src/server/storage.ts');
  storage.installTestSupabaseClient(memory);
  await storage.initializeStorage();
  const db = storage.db;
  const school = db.createSchool({
    name: 'Academic Rules', code: 'ACAD', address: '', city: '', phone: '', email: 'academic@example.test', currency: 'USD',
    academicYear: '2026-2027', currentSemester: 'Semester 1', defaultClassCapacity: 30, studentAccessEnabled: false,
    subscription: { plan: 'basic', cadence: 'yearly', status: 'active', startDate: '2026-01-01', validUntil: '2099-01-01', graceDays: 7, pricePaid: 0, autoRenew: false }
  } as any);
  const source = db.createClass({ schoolId: school.id, name: 'Grade 1', gradeLevel: 1, section: 'A', roomNumber: '', capacity: 30, monthlyFee: 0 });
  const target = db.createClass({ schoolId: school.id, name: 'Grade 2', gradeLevel: 2, section: 'A', roomNumber: '', capacity: 30, monthlyFee: 0 });
  const subject = db.createSubject({ schoolId: school.id, name: 'Mathematics', code: 'MATH', category: 'core', isActive: true } as any);
  const students = [90, 70, 60, 40].map((score, index) => db.createStudent({
    schoolId: school.id, studentId: `ACAD-${index + 1}`, firstName: `Pupil${index + 1}`, middleName: '', lastName: 'Test', gender: 'female',
    admissionDate: '2026-01-01', fatherPhone: '', classId: source.id, status: 'active'
  } as any));
  await db.updateExamConfig(school.id, { academicYear: '2026-2027', smallExamMax: 20, bigExamMax: 80, passMarkPercentage: 60 });
  await assert.rejects(() => db.updateExamConfig(school.id, { smallExamMax: 0 }), /maximum marks/);
  await assert.rejects(() => db.updateExamConfig(school.id, { passMarkPercentage: 101 }), /pass mark/);
  await db.flush();

  const marks = students.map((student, index) => ({ studentId: student.id, smallExamMarks: [18, 14, 12, 8][index], bigExamMarks: [72, 56, 48, 32][index], status: 'submitted' as const }));
  const firstSemester = await db.saveStudentMarks(school.id, source.id, subject.id, 'Semester 1', marks, 'teacher-1');
  assert.deepEqual(firstSemester.map(mark => mark.percentage), [90, 70, 60, 40]);
  await assert.rejects(() => db.saveStudentMarks(school.id, source.id, subject.id, 'Semester 2', [{ ...marks[0], smallExamMarks: 21 }], 'teacher-1'), /configured maximums/);
  await assert.rejects(() => db.saveStudentMarks(school.id, source.id, subject.id, 'Semester 2', [{ ...marks[0], bigExamMarks: -1 }], 'teacher-1'), /configured maximums/);
  await db.saveStudentMarks(school.id, source.id, subject.id, 'Semester 2', marks, 'teacher-1');
  await db.flush();

  const rankings = await db.getClassYearlyRankings(school.id, source.id);
  assert.deepEqual(rankings.map(row => row.yearlyRank), [1, 2, 3, 4]);
  assert.deepEqual(rankings.map(row => row.isPass), [true, true, true, false]);
  const payload = rankings.map((row, index) => ({
    studentId: row.student.id, classFromId: source.id, classToId: index < 3 ? target.id : source.id,
    yearlyPercentage: row.yearlyPercentage, yearlyRank: row.yearlyRank, decision: index < 3 ? 'promoted' as const : 'repeated' as const,
    adminOverride: index === 2, notes: index === 2 ? 'School board decision' : `Rank ${row.yearlyRank}`
  }));
  await assert.rejects(() => db.confirmYearEndPromotions(school.id, source.id, 2, payload.map(row => ({ ...row, adminOverride: false })), 'admin-1'), /reason is required/);
  const confirmed = await db.confirmYearEndPromotions(school.id, source.id, 2, payload, 'admin-1');
  assert.equal(confirmed.length, 4);
  assert.equal(confirmed[2].yearlyPercentage, 60);
  assert.match(confirmed[2].notes || '', /^ADMIN OVERRIDE:/);
  await db.flush();
  assert.deepEqual((await db.getStudents(school.id, target.id)).map(student => student.id).sort(), [students[0].id, students[1].id, students[2].id].sort());
  assert.equal(memory.rows('promotions').length, 4);
  assert.equal(memory.rows('promotion_history').length, 4);
  assert.equal(memory.rows('audit_logs').some(row => row.action === 'YEAR_END_PROMOTION_CONFIRMED'), true);
});
