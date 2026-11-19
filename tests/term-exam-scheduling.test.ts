import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateMixedRoomSeating,
  buildManhajGroups,
  isSessionShiftCompatible,
  teacherHasInvigilationConflict
} from '../src/lib/term-exam-scheduling.ts';

test('classes with the same subject set share a manhaj group regardless of subject order', () => {
  const groups = buildManhajGroups([
    { id: 'c1', name: 'Grade 1', subjectIds: ['math', 'english'] },
    { id: 'c2', name: 'Grade 2', subjectIds: ['english', 'math', 'math'] },
    { id: 'c3', name: 'Grade 3', subjectIds: ['science'] }
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.find(group => group.classIds.includes('c1'))?.classIds, ['c1', 'c2']);
});

test('mixed seating interleaves classes and continues each class exam number across rooms', () => {
  const rooms = [
    { id: 'r1', name: 'Room 1', capacity: 5 },
    { id: 'r2', name: 'Room 2', capacity: 5 }
  ];
  const allocations = allocateMixedRoomSeating([
    { classId: 'c1', className: 'Grade 1', students: Array.from({ length: 6 }, (_, i) => ({ id: `a${i + 1}`, classId: 'c1' })) },
    { classId: 'c2', className: 'Grade 3', students: Array.from({ length: 4 }, (_, i) => ({ id: `b${i + 1}`, classId: 'c2' })) }
  ], rooms, 0);

  assert.equal(allocations[0].seats.length, 5);
  assert.equal(allocations[1].seats.length, 5);
  assert.equal(new Set(allocations.flatMap(room => room.seats.map(seat => seat.studentId))).size, 10);
  assert.deepEqual(
    allocations.flatMap(room => room.seats).filter(seat => seat.classId === 'c1').map(seat => seat.examNumber),
    [1, 2, 3, 4, 5, 6]
  );
  assert.deepEqual(
    allocations.flatMap(room => room.seats).filter(seat => seat.classId === 'c2').map(seat => seat.examNumber),
    [1, 2, 3, 4]
  );
  assert.ok(allocations[0].classRanges.length > 1);
});

test('mixed seating rejects insufficient room capacity', () => {
  assert.throws(() => allocateMixedRoomSeating([
    { classId: 'c1', className: 'Grade 1', students: [{ id: 's1', classId: 'c1' }, { id: 's2', classId: 'c1' }] }
  ], [{ id: 'r1', name: 'Room 1', capacity: 1 }]), /kuma filna/);
});

test('session shift rules keep classes in one shift unless the session is all-day', () => {
  assert.equal(isSessionShiftCompatible('morning', 'morning'), true);
  assert.equal(isSessionShiftCompatible('morning', 'afternoon'), false);
  assert.equal(isSessionShiftCompatible('afternoon', 'all'), true);
});

test('invigilator cannot supervise a class-subject they teach', () => {
  assert.equal(teacherHasInvigilationConflict('t1', [{ classId: 'c1', subjectId: 'math', teacherId: 't1' }]), true);
  assert.equal(teacherHasInvigilationConflict('t2', [{ classId: 'c1', subjectId: 'math', teacherId: 't1' }]), false);
});
