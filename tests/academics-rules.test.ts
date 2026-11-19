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
  await memory.from('class_subjects').insert([{
    id: 'class-subject-math', school_id: school.id, class_id: source.id,
    subject_id: subject.id, teacher_id: 'teacher-profile-1', periods_per_week: 3,
    small_exam_enabled: true, big_exam_enabled: true, is_active: true
  }]);
  await assert.rejects(() => db.forwardClassMarks(school.id, source.id, 'Semester 1', 'fomester-1'), /Cannot forward results yet/);

  const marks = students.map((student, index) => ({ studentId: student.id, smallExamMarks: [18, 14, 12, 8][index], bigExamMarks: [72, 56, 48, 32][index], status: 'submitted' as const }));
  const firstSemester = await db.saveStudentMarks(school.id, source.id, subject.id, 'Semester 1', marks, 'teacher-1');
  assert.deepEqual(firstSemester.map(mark => mark.percentage), [90, 70, 60, 40]);
  await assert.rejects(() => db.saveStudentMarks(school.id, source.id, subject.id, 'Semester 2', [{ ...marks[0], smallExamMarks: 21 }], 'teacher-1'), /configured maximums/);
  await assert.rejects(() => db.saveStudentMarks(school.id, source.id, subject.id, 'Semester 2', [{ ...marks[0], bigExamMarks: -1 }], 'teacher-1'), /configured maximums/);
  const secondSemester = await db.saveStudentMarks(school.id, source.id, subject.id, 'Semester 2', marks, 'teacher-1');
  await db.flush();

  const unapprovedSemesterRanks = await db.getClassSemesterRankings(school.id, source.id, 'Semester 1');
  assert.equal(unapprovedSemesterRanks.every(row => row.subjectCount === 0), true, 'submitted marks must not affect official semester rankings');
  const unapprovedYearlyRanks = await db.getClassYearlyRankings(school.id, source.id);
  assert.equal(unapprovedYearlyRanks.every(row => row.subjectResults.length === 0), true, 'draft/submitted marks must not affect official yearly rankings');

  await db.forwardClassMarks(school.id, source.id, 'Semester 1', 'fomester-1');
  await db.forwardClassMarks(school.id, source.id, 'Semester 2', 'fomester-1');
  const approved = db.approveMarks(school.id, [...firstSemester, ...secondSemester].map(mark => mark.id), 'admin-1');
  assert.equal(approved.length, 8);
  await db.flush();

  const semesterRanks = await db.getClassSemesterRankings(school.id, source.id, 'Semester 1');
  assert.deepEqual(semesterRanks.map(row => row.averagePercentage), [90, 70, 60, 40]);
  const rankings = await db.getClassYearlyRankings(school.id, source.id);
  assert.deepEqual(rankings.map(row => row.yearlyRank), [1, 2, 3, 4]);
  assert.deepEqual(rankings.map(row => row.isPass), [true, true, true, false]);
  assert.equal(rankings.every(row => row.annualComplete), true);
  const undersizedTarget = db.createClass({ schoolId: school.id, name: 'Small Grade 2', gradeLevel: 2, section: 'B', roomNumber: '', capacity: 2, monthlyFee: 0 });
  const payload = rankings.map((row, index) => ({
    studentId: row.student.id, classFromId: source.id, classToId: index < 3 ? target.id : source.id,
    yearlyPercentage: row.yearlyPercentage, yearlyRank: row.yearlyRank, decision: index < 3 ? 'promoted' as const : 'repeated' as const,
    adminOverride: index === 2, notes: index === 2 ? 'School board decision' : `Rank ${row.yearlyRank}`
  }));
  await assert.rejects(() => db.confirmYearEndPromotions(school.id, source.id, 2, payload.map(row => ({ ...row, adminOverride: false })), 'admin-1'), /reason is required/);
  await assert.rejects(
    () => db.confirmYearEndPromotions(school.id, source.id, 2, payload.map(row => ({ ...row, classToId: row.decision === 'promoted' ? undersizedTarget.id : row.classToId })), 'admin-1'),
    /does not have enough capacity/
  );
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

test('school-defined four small tests and one final exam calculate a 100-mark result', async () => {
  const memory = new InMemorySupabase();
  const storage = await import('../src/server/storage.ts');
  storage.installTestSupabaseClient(memory);
  await storage.initializeStorage();
  const db = storage.db;
  const school = db.createSchool({
    name: 'Assessment Plan', code: 'ASSESS', address: '', city: '', phone: '', email: 'assessment@example.test', currency: 'ETB',
    academicYear: '2026-2027', currentSemester: 'Semester 1', defaultClassCapacity: 30, studentAccessEnabled: false,
    subscription: { plan: 'basic', cadence: 'yearly', status: 'active', startDate: '2026-01-01', validUntil: '2099-01-01', graceDays: 7, pricePaid: 0, autoRenew: false }
  } as any);
  const config = await db.getExamConfig(school.id);
  assert.equal(config.assessmentComponents.length, 5);
  assert.equal(config.assessmentComponents.reduce((sum, item) => sum + item.maxMarks, 0), 100);
  const klass = db.createClass({ schoolId: school.id, name: 'Grade 7', gradeLevel: 7, section: 'A', roomNumber: '', capacity: 30, monthlyFee: 0 });
  const subject = db.createSubject({ schoolId: school.id, name: 'Mathematics', code: 'MATH', category: 'core', isActive: true } as any);
  const student = db.createStudent({
    schoolId: school.id, studentId: 'ASSESS-001', firstName: 'Test', middleName: '', lastName: 'Student', gender: 'female',
    admissionDate: '2026-01-01', fatherPhone: '', classId: klass.id, status: 'active'
  } as any);
  const partial = await db.saveStudentMarks(school.id, klass.id, subject.id, 'Semester 1', [{
    studentId: student.id, assessmentScores: { 'test-1': 9 }, status: 'draft'
  }], 'teacher-1');
  assert.equal(partial[0].totalMarks, 9);
  assert.deepEqual(partial[0].assessmentScores, { 'test-1': 9 });
  await assert.rejects(
    () => db.saveStudentMarks(school.id, klass.id, subject.id, 'Semester 1', [{
      studentId: student.id, assessmentScores: { 'test-1': 9 }, status: 'submitted'
    }], 'teacher-1'),
    /every configured assessment/
  );
  const saved = await db.saveStudentMarks(school.id, klass.id, subject.id, 'Semester 1', [{
    studentId: student.id,
    assessmentScores: { 'test-1': 9, 'test-2': 8, 'test-3': 7, 'test-4': 6, 'final-exam': 50 },
    status: 'draft'
  }], 'teacher-1');
  assert.equal(saved[0].smallExamMarks, 30);
  assert.equal(saved[0].bigExamMarks, 50);
  assert.equal(saved[0].totalMarks, 80);
  assert.equal(saved[0].percentage, 80);
  assert.equal(saved[0].schemeVersion, 1);
  assert.deepEqual(saved[0].schemeSnapshot, config.assessmentComponents);
  assert.deepEqual(saved[0].assessmentScores, { 'test-1': 9, 'test-2': 8, 'test-3': 7, 'test-4': 6, 'final-exam': 50 });
  await db.flush();
  assert.deepEqual(memory.rows('student_marks')[0].assessment_scores, { 'test-1': 9, 'test-2': 8, 'test-3': 7, 'test-4': 6, 'final-exam': 50 });
  assert.equal(memory.rows('student_marks')[0].scheme_version, 1);
  assert.deepEqual(memory.rows('student_marks')[0].scheme_snapshot, config.assessmentComponents);

  const nextScheme = [
    { id: 'coursework', name: 'Coursework', maxMarks: 40, category: 'continuous' as const, order: 1 },
    { id: 'final-v2', name: 'Final Examination', maxMarks: 60, category: 'final' as const, order: 2 }
  ];
  const revised = await db.updateExamConfig(school.id, { assessmentComponents: nextScheme });
  assert.equal(revised.schemeVersion, 2);
  const preserved = await db.getMarks(school.id, klass.id, subject.id, 'Semester 1');
  assert.equal(preserved[0].schemeVersion, 1);
  assert.deepEqual(preserved[0].schemeSnapshot, config.assessmentComponents);
  await assert.rejects(
    () => db.saveStudentMarks(school.id, klass.id, subject.id, 'Semester 1', [{
      studentId: student.id, assessmentScores: { coursework: 30, 'final-v2': 50 }, status: 'draft'
    }], 'teacher-1'),
    /entered under scheme version 1/
  );
});

test('yearly report cards do not treat one approved semester as the full-year average', async () => {
  const memory = new InMemorySupabase();
  const storage = await import('../src/server/storage.ts');
  storage.installTestSupabaseClient(memory);
  await storage.initializeStorage();
  const db = storage.db;
  const school = db.createSchool({
    name: 'Incomplete Year Results', code: 'INCOMPLETE', address: '', city: '', phone: '', email: 'incomplete@example.test', currency: 'ETB',
    academicYear: '2026-2027', currentSemester: 'Semester 1', defaultClassCapacity: 30, studentAccessEnabled: false,
    subscription: { plan: 'basic', cadence: 'yearly', status: 'active', startDate: '2026-01-01', validUntil: '2099-01-01', graceDays: 7, pricePaid: 0, autoRenew: false }
  } as any);
  const klass = db.createClass({ schoolId: school.id, name: 'Grade 8', gradeLevel: 8, section: 'A', roomNumber: '', capacity: 30, monthlyFee: 0 });
  const subject = db.createSubject({ schoolId: school.id, name: 'Mathematics', code: 'MATH', category: 'core', isActive: true } as any);
  const student = db.createStudent({
    schoolId: school.id, studentId: 'INCOMPLETE-001', firstName: 'Amina', middleName: '', lastName: 'Test', gender: 'female',
    admissionDate: '2026-01-01', fatherPhone: '', classId: klass.id, status: 'active'
  } as any);
  await memory.from('class_subjects').insert([{
    id: 'incomplete-class-subject', school_id: school.id, class_id: klass.id,
    subject_id: subject.id, teacher_id: 'teacher-profile-incomplete', periods_per_week: 3,
    small_exam_enabled: true, big_exam_enabled: true, is_active: true
  }]);
  const submitted = await db.saveStudentMarks(school.id, klass.id, subject.id, 'Semester 1', [{
    studentId: student.id,
    assessmentScores: { 'test-1': 8, 'test-2': 8, 'test-3': 8, 'test-4': 8, 'final-exam': 48 },
    status: 'submitted'
  }], 'teacher-incomplete');
  await db.forwardClassMarks(school.id, klass.id, 'Semester 1', 'form-teacher-incomplete');
  db.approveMarks(school.id, submitted.map(mark => mark.id), 'admin-incomplete');
  await db.flush();

  const yearly = await db.getClassYearlyRankings(school.id, klass.id);
  assert.equal(yearly[0].subjectResults.length, 1);
  assert.equal(yearly[0].subjectResults[0].sem1Percentage, 80);
  assert.equal(yearly[0].subjectResults[0].sem2Percentage, null);
  assert.equal(yearly[0].subjectResults[0].yearlyPercentage, null);
  assert.equal(yearly[0].annualComplete, false);
  assert.equal(yearly[0].yearlyPercentage, 0, 'incomplete annual totals remain non-publishable and are not presented as a result');
  assert.equal(yearly[0].yearlyRank, 0, 'incomplete annual results must not receive a rank');
  assert.equal(yearly[0].isPass, false);
  await assert.rejects(() => db.confirmYearEndPromotions(school.id, klass.id, 3, [{
    studentId: student.id, classFromId: klass.id, yearlyPercentage: 0, yearlyRank: 0, decision: 'repeated'
  }], 'admin-incomplete'), /both semesters/);
});

test('school admin can choose five 10-mark tests and the final exam adjusts to 50', async () => {
  const memory = new InMemorySupabase();
  const storage = await import('../src/server/storage.ts');
  storage.installTestSupabaseClient(memory);
  await storage.initializeStorage();
  const db = storage.db;
  const school = db.createSchool({
    name: 'Five Test Plan', code: 'FIVE', address: '', city: '', phone: '', email: 'five@example.test', currency: 'ETB',
    academicYear: '2026-2027', currentSemester: 'Semester 1', defaultClassCapacity: 30, studentAccessEnabled: false,
    subscription: { plan: 'basic', cadence: 'yearly', status: 'active', startDate: '2026-01-01', validUntil: '2099-01-01', graceDays: 7, pricePaid: 0, autoRenew: false }
  } as any);
  const fiveTestPlan = [
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `five-test-${index + 1}`, name: `Test ${index + 1}`, maxMarks: 10,
      category: 'continuous' as const, order: index + 1
    })),
    { id: 'five-test-final', name: 'Final Examination', maxMarks: 50, category: 'final' as const, order: 6 }
  ];
  const saved = await db.updateExamConfig(school.id, { assessmentComponents: fiveTestPlan });
  assert.equal(saved.assessmentComponents.filter(item => item.category === 'continuous').length, 5);
  assert.equal(saved.assessmentComponents.find(item => item.category === 'final')?.maxMarks, 50);
  assert.equal(saved.smallExamMax, 50);
  assert.equal(saved.bigExamMax, 50);
  assert.equal(saved.assessmentComponents.reduce((sum, item) => sum + item.maxMarks, 0), 100);

  await assert.rejects(
    () => db.updateExamConfig(school.id, { assessmentComponents: [
      ...fiveTestPlan.slice(0, 5),
      { id: 'invalid-final', name: 'Final Examination', maxMarks: 60, category: 'final' as const, order: 6 }
    ] }),
    /Wadarta waa inay noqotaa 100/
  );
  await assert.rejects(
    () => db.updateExamConfig(school.id, { assessmentComponents: [
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `six-test-${index + 1}`, name: `Test ${index + 1}`, maxMarks: 10,
        category: 'continuous' as const, order: index + 1
      })),
      { id: 'six-test-final', name: 'Final Examination', maxMarks: 40, category: 'final' as const, order: 7 }
    ] }),
    /between 1 and 6 assessment components/
  );
});


test('submitted marks can be returned with an audit reason and only complete approved semesters can be published', async () => {
  const memory = new InMemorySupabase();
  const storage = await import('../src/server/storage.ts');
  storage.installTestSupabaseClient(memory);
  await storage.initializeStorage();
  const db = storage.db;
  const school = db.createSchool({
    name: 'Result Publication', code: 'PUBRESULT', address: '', city: '', phone: '', email: 'publish@example.test', currency: 'ETB',
    academicYear: '2026-2027', currentSemester: 'Semester 1', defaultClassCapacity: 30, studentAccessEnabled: false,
    subscription: { plan: 'basic', cadence: 'yearly', status: 'active', startDate: '2026-01-01', validUntil: '2099-01-01', graceDays: 7, pricePaid: 0, autoRenew: false }
  } as any);
  const klass = db.createClass({ schoolId: school.id, name: 'Grade 5', gradeLevel: 5, section: 'A', roomNumber: '', capacity: 30, monthlyFee: 0 });
  const subject = db.createSubject({ schoolId: school.id, name: 'Science', code: 'SCI', category: 'core', isActive: true } as any);
  const student = db.createStudent({
    schoolId: school.id, studentId: 'PUB-001', firstName: 'Hodan', middleName: '', lastName: 'Test', gender: 'female',
    admissionDate: '2026-01-01', fatherPhone: '', classId: klass.id, status: 'active'
  } as any);
  await memory.from('class_subjects').insert([{
    id: 'publish-class-subject', school_id: school.id, class_id: klass.id,
    subject_id: subject.id, teacher_id: 'teacher-profile-publish', periods_per_week: 3,
    small_exam_enabled: true, big_exam_enabled: true, is_active: true
  }]);
  const assessmentScores = { 'test-1': 8, 'test-2': 8, 'test-3': 8, 'test-4': 8, 'final-exam': 48 };
  const first = await db.saveStudentMarks(school.id, klass.id, subject.id, 'Semester 1', [{
    studentId: student.id, assessmentScores, status: 'submitted'
  }], 'teacher-publish', 'Subject Teacher', 'teacher');
  assert.equal(memory.rows('audit_logs').some(row => row.action === 'MARKS_CREATED'), true);
  assert.equal(memory.rows('audit_logs').some(row => row.action === 'MARKS_SUBMITTED'), true);
  await db.forwardClassMarks(school.id, klass.id, 'Semester 1', 'form-teacher-publish');
  assert.equal(memory.rows('audit_logs').some(row => row.action === 'CLASS_MARKS_FORWARDED_TO_ADMIN'), true);

  const returned = await db.returnMarksForCorrection(
    school.id, [first[0].id], 'admin-publish', 'Please verify the final exam score against the signed script.', 'Academic Admin', 'school_admin'
  );
  assert.equal(returned.length, 1);
  assert.equal(returned[0].status, 'draft');
  assert.equal(returned[0].correctionReason, 'Please verify the final exam score against the signed script.');
  assert.equal(returned[0].returnedBy, 'admin-publish');
  assert.equal(memory.rows('audit_logs').some(row => row.action === 'MARKS_RETURNED_FOR_CORRECTION' && JSON.stringify(row.details).includes('signed script')), true);

  const resubmitted = await db.saveStudentMarks(school.id, klass.id, subject.id, 'Semester 1', [{
    studentId: student.id, assessmentScores: { ...assessmentScores, 'final-exam': 49 }, status: 'submitted'
  }], 'teacher-publish');
  assert.equal(resubmitted[0].correctionReason, null);
  const editAudit = memory.rows('audit_logs').find(row => row.action === 'MARKS_EDITED');
  assert.ok(JSON.stringify(editAudit?.details).includes('oldValues'));
  assert.ok(JSON.stringify(editAudit?.details).includes('newValues'));
  await db.forwardClassMarks(school.id, klass.id, 'Semester 1', 'form-teacher-publish');
  db.approveMarks(school.id, [resubmitted[0].id], 'admin-publish', 'Academic Admin', 'school_admin');
  await db.flush();
  const approvalAudit = memory.rows('audit_logs').find(row => row.action === 'MARKS_APPROVED');
  assert.ok(JSON.stringify(approvalAudit?.details).includes('form_teacher_submitted'));
  assert.ok(JSON.stringify(approvalAudit?.details).includes('approved'));

  await assert.rejects(
    () => db.publishClassSemesterResults(school.id, klass.id, 'Semester 2', 'admin-publish', 'Academic Admin', 'school_admin'),
    /missing or not approved/
  );

  const firstPublication = await db.publishClassSemesterResults(school.id, klass.id, 'Semester 1', 'admin-publish', 'Academic Admin', 'school_admin');
  assert.equal(firstPublication.publishedCount, 1);
  assert.ok(firstPublication.publishedAt);
  const duplicatePublication = await db.publishClassSemesterResults(school.id, klass.id, 'Semester 1', 'admin-publish', 'Academic Admin', 'school_admin');
  assert.equal(duplicatePublication.publishedCount, 0);

  const second = await db.saveStudentMarks(school.id, klass.id, subject.id, 'Semester 2', [{
    studentId: student.id, assessmentScores, status: 'submitted'
  }], 'teacher-publish');
  await db.forwardClassMarks(school.id, klass.id, 'Semester 2', 'form-teacher-publish');
  db.approveMarks(school.id, [second[0].id], 'admin-publish');
  await db.flush();
  const secondPublication = await db.publishClassSemesterResults(school.id, klass.id, 'Semester 2', 'admin-publish', 'Academic Admin', 'school_admin');
  assert.equal(secondPublication.publishedCount, 1);

  const yearly = await db.getClassYearlyRankings(school.id, klass.id);
  assert.equal(yearly[0].annualComplete, true);
  assert.equal(yearly[0].annualPublished, true);
  const publishedMarks = await db.getStudentMarks(school.id, student.id);
  assert.equal(publishedMarks.length, 2);
  assert.equal(publishedMarks.every(mark => Boolean(mark.publishedAt)), true);
  assert.equal(memory.rows('audit_logs').some(row => row.action === 'MARKS_PUBLISHED_TO_PARENTS'), true);

  await memory.from('student_marks').insert([{
    id: 'old-academic-year-mark', school_id: school.id, class_id: klass.id,
    student_id: student.id, subject_id: subject.id, academic_year: '2025-2026',
    semester: 'Semester 1', status: 'approved', total_marks: 99, percentage: 99,
    published_at: new Date().toISOString()
  }]);
  const classYearMarks = await db.getMarks(school.id, klass.id, subject.id, 'Semester 1');
  assert.equal(classYearMarks.length, 1, 'class results must not mix marks from another academic year');
  assert.equal(classYearMarks[0].academicYear, '2026-2027');
});

// semester-lock-test-marker
