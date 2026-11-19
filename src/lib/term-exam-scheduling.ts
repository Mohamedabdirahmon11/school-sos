export type ExamShift = 'morning' | 'afternoon';
export type ExamSessionShift = ExamShift | 'all';

export interface ManhajClass {
  id: string;
  name: string;
  subjectIds: string[];
}

export interface ManhajGroup {
  key: string;
  classIds: string[];
  classNames: string[];
  subjectIds: string[];
}

export interface SeatingStudent {
  id: string;
  classId: string;
}

export interface SeatingClass {
  classId: string;
  className: string;
  students: SeatingStudent[];
}

export interface SeatingRoom {
  id: string;
  name: string;
  capacity: number;
}

export interface SeatAssignment {
  studentId: string;
  classId: string;
  roomId: string;
  roomName: string;
  /** Seat number unique across this subject/session schedule. */
  seatNumber: number;
  /** Exam number continues per class across all rooms. */
  examNumber: number;
}

export interface RoomClassRange {
  classId: string;
  className: string;
  fromNumber: number;
  toNumber: number;
  studentCount: number;
}

export interface MixedRoomAllocation {
  roomId: string;
  roomName: string;
  capacity: number;
  seats: SeatAssignment[];
  classRanges: RoomClassRange[];
}

const uniqueSorted = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** Classes with exactly the same active subject set share one timetable row. */
export function buildManhajGroups(classes: ManhajClass[]): ManhajGroup[] {
  const groups = new Map<string, { classes: ManhajClass[]; subjectIds: string[] }>();
  for (const klass of classes) {
    const subjectIds = uniqueSorted(klass.subjectIds);
    const key = subjectIds.length ? subjectIds.join('|') : `__no_subjects__:${klass.id}`;
    const group = groups.get(key) || { classes: [], subjectIds };
    group.classes.push(klass);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    classIds: group.classes.map(item => item.id).sort(),
    classNames: group.classes.map(item => item.name),
    subjectIds: group.subjectIds
  })).sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Interleaves candidates from different classes in each room. Rotation changes
 * the first class on each day/session. Exam numbers are sequential per class
 * across rooms, while seatNumber remains unique within the shared schedule.
 */
export function allocateMixedRoomSeating(
  classes: SeatingClass[],
  rooms: SeatingRoom[],
  rotation = 0
): MixedRoomAllocation[] {
  const candidates = classes
    .filter(item => item.students.length > 0)
    .map(item => ({
      classId: item.classId,
      className: item.className,
      students: [...item.students],
      cursor: 0,
      nextExamNumber: 1
    }))
    .sort((a, b) => a.classId.localeCompare(b.classId));

  const activeRooms = rooms
    .filter(room => Number.isInteger(room.capacity) && room.capacity > 0)
    .map(room => ({ ...room, capacity: Math.floor(room.capacity) }));
  const totalStudents = candidates.reduce((sum, item) => sum + item.students.length, 0);
  const totalCapacity = activeRooms.reduce((sum, room) => sum + room.capacity, 0);
  if (!totalStudents) throw new Error('Ma jiraan arday firfircoon oo imtixaanka gelaya.');
  if (!activeRooms.length || totalCapacity < totalStudents) {
    throw new Error(`Awoodda qolalku kuma filna ardayda: ${totalStudents} arday / ${totalCapacity} kursi.`);
  }

  const allocations: MixedRoomAllocation[] = activeRooms.map(room => ({
    roomId: room.id, roomName: room.name, capacity: room.capacity, seats: [], classRanges: []
  }));
  let globalSeatNumber = 1;
  let remaining = totalStudents;
  const offset = ((Math.floor(rotation) % candidates.length) + candidates.length) % candidates.length;

  for (const room of allocations) {
    const counts = new Map<string, { className: string; from: number; to: number; count: number }>();
    while (room.seats.length < room.capacity && remaining > 0) {
      let selected = false;
      for (let step = 0; step < candidates.length; step += 1) {
        const index = (offset + step + room.seats.length) % candidates.length;
        const candidate = candidates[index];
        if (candidate.cursor >= candidate.students.length) continue;
        const student = candidate.students[candidate.cursor++];
        const examNumber = candidate.nextExamNumber++;
        room.seats.push({
          studentId: student.id,
          classId: candidate.classId,
          roomId: room.roomId,
          roomName: room.roomName,
          seatNumber: globalSeatNumber++,
          examNumber
        });
        const range = counts.get(candidate.classId);
        if (range) {
          range.to = examNumber;
          range.count += 1;
        } else {
          counts.set(candidate.classId, {
            className: candidate.className, from: examNumber, to: examNumber, count: 1
          });
        }
        remaining -= 1;
        selected = true;
        break;
      }
      if (!selected) break;
    }
    room.classRanges = [...counts.entries()].map(([classId, range]) => ({
      classId, className: range.className, fromNumber: range.from,
      toNumber: range.to, studentCount: range.count
    }));
    if (remaining === 0) break;
  }

  return allocations.filter(room => room.seats.length > 0);
}

export function isSessionShiftCompatible(
  classExamShift: ExamShift,
  sessionShift: ExamSessionShift
): boolean {
  return sessionShift === 'all' || classExamShift === sessionShift;
}

export function teacherHasInvigilationConflict(
  teacherId: string,
  roomClassSubjects: Array<{ classId: string; subjectId: string; teacherId: string | null }>
): boolean {
  return roomClassSubjects.some(item => item.teacherId === teacherId);
}
