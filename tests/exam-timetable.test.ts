import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupExamRoomSessions } from '../src/lib/exam-timetable.ts';

test('groups same subject/date/time sessions into one timetable row and keeps every room', () => {
  const sessions = [
    { id: 'a', subjectId: 'math', subjectName: 'Mathematics', examDate: '2026-12-01', startTime: '08:00:00', endTime: '09:00:00', examName: 'Final', examType: 'big', semester: 'Semester 1', shiftName: 'Morning', roomName: 'Hall A', status: 'draft' },
    { id: 'b', subjectId: 'math', subjectName: 'Mathematics', examDate: '2026-12-01', startTime: '08:00', endTime: '09:00', examName: 'Final', examType: 'big', semester: 'Semester 1', shiftName: 'Morning', roomName: 'Hall B', status: 'published' },
    { id: 'c', subjectId: 'science', subjectName: 'Science', examDate: '2026-12-01', startTime: '09:00', endTime: '10:00', examName: 'Final', examType: 'big', semester: 'Semester 1', shiftName: 'Morning', roomName: 'Hall A', status: 'draft' }
  ] as any;
  const grouped = groupExamRoomSessions(sessions);
  assert.equal(grouped.length, 2);
  const maths = grouped.find(group => group.sessions[0].subjectId === 'math')!;
  assert.deepEqual(maths.sessions.map(row => row.id), ['a', 'b']);
  assert.deepEqual(maths.roomNames, ['Hall A', 'Hall B']);
  assert.equal(maths.allPublished, false);
});

test('keeps different subject dates and times in separate rows', () => {
  const base = { subjectId: 'math', subjectName: 'Mathematics', examDate: '2026-12-01', startTime: '08:00', endTime: '09:00', examName: 'Final', examType: 'big', semester: 'Semester 1', status: 'draft' };
  const grouped = groupExamRoomSessions([
    { ...base, id: 'a', roomName: 'A' },
    { ...base, id: 'b', roomName: 'B', examDate: '2026-12-02' },
    { ...base, id: 'c', roomName: 'C', startTime: '10:00' },
    { ...base, id: 'd', roomName: 'D', subjectId: 'science' }
  ] as any);
  assert.equal(grouped.length, 4);
});
