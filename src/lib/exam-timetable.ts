export interface ExamRoomSession {
  id: string;
  subjectId: string;
  subjectName?: string;
  examDate: string;
  startTime: string;
  endTime: string;
  examName: string;
  examType: string;
  semester: string;
  shiftName?: string;
  roomName?: string;
  status: string;
  [key: string]: unknown;
}

export interface GroupedExamRoomSessions {
  key: string;
  sessions: ExamRoomSession[];
  roomNames: string[];
  allPublished: boolean;
}

/** Groups room-level sessions into a single school-wide subject row without deleting or merging records. */
export function groupExamRoomSessions(schedules: ExamRoomSession[]): GroupedExamRoomSessions[] {
  const groups = new Map<string, ExamRoomSession[]>();
  for (const schedule of schedules) {
    const key = [
      schedule.subjectId, schedule.examDate, String(schedule.startTime).slice(0, 5),
      String(schedule.endTime).slice(0, 5)
    ].join('|');
    const sessions = groups.get(key) || [];
    sessions.push(schedule);
    groups.set(key, sessions);
  }
  return [...groups.entries()].map(([key, sessions]) => ({
    key,
    sessions,
    roomNames: [...new Set(sessions.map(session => session.roomName).filter((name): name is string => Boolean(name)))],
    allPublished: sessions.every(session => session.status === 'published')
  })).sort((a, b) =>
    String(a.sessions[0]?.examDate).localeCompare(String(b.sessions[0]?.examDate)) ||
    String(a.sessions[0]?.startTime).localeCompare(String(b.sessions[0]?.startTime)) ||
    String(a.sessions[0]?.subjectName).localeCompare(String(b.sessions[0]?.subjectName))
  );
}
