import React, { useEffect, useMemo, useState } from 'react';
import { ApiClient } from '../../services/api.ts';

type SessionDraft = { name: string; startTime: string; endTime: string; shiftTag: 'morning' | 'afternoon' | 'all' };
type PeriodData = {
  period: any | null;
  days: any[];
  sessions: any[];
  schedules: any[];
  invigilators: any[];
  roomAssignments: Array<{ sessionId: string; roomId: string; roomName: string; capacity: number; studentCount: number; classRanges: Array<{ classId: string; fromNumber: number; toNumber: number; studentCount: number }>; seats: Array<{ seatNumber: number; examNumber: number; studentId: string; rollNumber: string; studentName: string; classId: string; subjectId: string; examDate: string }> }>;
};

const defaultSessions: SessionDraft[] = [
  { name: 'Fadhi 1', startTime: '08:00', endTime: '10:00', shiftTag: 'morning' },
  { name: 'Fadhi 2', startTime: '13:00', endTime: '15:00', shiftTag: 'afternoon' }
];

export const TermExamSchedulingPanel: React.FC<{ isReadOnly?: boolean }> = ({ isReadOnly = false }) => {
  const [terms, setTerms] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [selectedTermId, setSelectedTermId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [periodName, setPeriodName] = useState('Imtixaanka Term-ka');
  const [sessions, setSessions] = useState<SessionDraft[]>(defaultSessions);
  const [classShifts, setClassShifts] = useState<Record<string, 'morning' | 'afternoon'>>({});
  const [periodData, setPeriodData] = useState<PeriodData>({ period: null, days: [], sessions: [], schedules: [], invigilators: [], roomAssignments: [] });
  const [invigilators, setInvigilators] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      ApiClient.getTimetableTerms(), ApiClient.request<any[]>('/classes?page=1&pageSize=100'), ApiClient.request<any[]>('/subjects?page=1&pageSize=100'),
      ApiClient.getTeachers({ page: 1, pageSize: 100 })
    ]).then(([termRows, classRows, subjectRows, teacherRows]) => {
      if (!active) return;
      const availableTerms = Array.isArray(termRows) ? termRows : [];
      setTerms(availableTerms);
      setClasses(Array.isArray(classRows) ? classRows.filter((item: any) => !(item.isArchived ?? item.is_archived)) : []);
      setSubjects(Array.isArray(subjectRows) ? subjectRows : []);
      setTeachers(Array.isArray(teacherRows) ? teacherRows : []);
      const current = availableTerms.find((item: any) => item.isCurrent) || availableTerms[0];
      if (current) {
        setSelectedTermId(current.id);
        setStartDate(current.startDate || '');
        setEndDate(current.endDate || '');
      }
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Xogta term-ka lama soo dejin karin.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const subjectNames = useMemo(() => new Map(subjects.map((item: any) => [item.id, item.name])), [subjects]);
  const classNames = useMemo(() => new Map(classes.map((item: any) => [item.id, item.name])), [classes]);
  const dayById = useMemo(() => new Map(periodData.days.map((item: any) => [item.id, item.exam_date])), [periodData.days]);
  const sessionById = useMemo(() => new Map(periodData.sessions.map((item: any) => [item.id, item])), [periodData.sessions]);
  const usedRoomsBySession = useMemo(() => {
    const grouped = new Map<string, typeof periodData.roomAssignments>();
    for (const item of periodData.roomAssignments) grouped.set(item.sessionId, [...(grouped.get(item.sessionId) || []), item]);
    return grouped;
  }, [periodData.roomAssignments]);

  const loadPeriod = async (termId: string) => {
    if (!termId) {
      setPeriodData({ period: null, days: [], sessions: [], schedules: [], invigilators: [], roomAssignments: [] });
      setClassShifts({});
      setInvigilators({});
      return;
    }
    const data = await ApiClient.getTermExamPeriod(termId);
    setPeriodData({ ...data, roomAssignments: data.roomAssignments || [], classExamSettings: data.classExamSettings || [] });
    if (data.period) {
      setPeriodName(data.period.name || 'Imtixaanka Term-ka');
      setStartDate(data.period.start_date || '');
      setEndDate(data.period.end_date || '');
      if (data.sessions?.length) setSessions(data.sessions.map((row: any) => ({
        name: row.name, startTime: String(row.start_time).slice(0, 5), endTime: String(row.end_time).slice(0, 5),
        shiftTag: row.shift_tag === 'morning' || row.shift_tag === 'afternoon' ? row.shift_tag : 'all'
      })));
    } else {
      setPeriodName('Imtixaanka Term-ka');
      setSessions(defaultSessions);
    }
    setClassShifts(Object.fromEntries((data.classExamSettings || []).map((row: any) => [row.class_id, row.exam_shift])));
    const next: Record<string, string> = {};
    for (const row of data.invigilators || []) next[row.exam_session_id + ':' + row.room_id] = row.teacher_id;
    setInvigilators(next);
  };

  useEffect(() => {
    if (!selectedTermId) return;
    let active = true;
    loadPeriod(selectedTermId).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Jadwalka term-ka lama soo dejin karin.');
    });
    return () => { active = false; };
  }, [selectedTermId]);

  const handleTermChange = (termId: string) => {
    setSelectedTermId(termId);
    const term = terms.find(item => item.id === termId);
    setStartDate(term?.startDate || '');
    setEndDate(term?.endDate || '');
    setError('');
  };

  const updateSession = (index: number, patch: Partial<SessionDraft>) => {
    setSessions(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  };

  const resizeSessions = (count: number) => {
    const safeCount = Math.max(1, Math.min(8, count));
    setSessions(current => Array.from({ length: safeCount }, (_, index) => current[index] || {
      name: 'Fadhi ' + (index + 1),
      startTime: index < 2 ? (index === 0 ? '08:00' : '13:00') : '15:30',
      endTime: index < 2 ? (index === 0 ? '10:00' : '15:00') : '17:00',
      shiftTag: index === 0 ? 'morning' : index === 1 ? 'afternoon' : 'all'
    }));
  };

  const handleGenerate = async () => {
    if (isReadOnly || !selectedTermId || !startDate || !endDate) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await ApiClient.generateTermExamPeriod({
        termId: selectedTermId, name: periodName, startDate, endDate, sessions,
        classExamShifts: classShifts
      });
      await loadPeriod(selectedTermId);
      setNotice('Jadwalka imtixaanka term-ka waa la diyaariyey. Hubi qolalka iyo kormeerayaasha ka hor daabacaadda.');
      if (!result.schedules?.length) setNotice('Muddada waa la sameeyey, balse ma jiraan maaddooyin la jadwaleeyey.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Jadwalka lama samayn karin.');
    } finally { setSaving(false); }
  };

  const handleSaveInvigilators = async () => {
    if (isReadOnly || !periodData.period) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const assignments = periodData.roomAssignments.map(room => ({
        sessionId: room.sessionId, roomId: room.roomId,
        teacherId: invigilators[room.sessionId + ':' + room.roomId] || ''
      })).filter(item => item.teacherId);
      await ApiClient.assignTermExamInvigilators(periodData.period.id, assignments);
      await loadPeriod(selectedTermId);
      setNotice('Kormeerayaasha waa la kaydiyey. Qol kasta oo la isticmaalayo waa inuu yeeshaa kormeere.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kormeerayaasha lama kaydin karin.');
    } finally { setSaving(false); }
  };

  const handleCancelPeriod = async () => {
    if (isReadOnly || !periodData.period || periodData.period.status !== 'draft') return;
    if (!window.confirm('Ma hubtaa inaad tirtirayso jadwalkan draft-ka ah iyo kuraastiisa?')) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await ApiClient.deleteTermExamPeriod(periodData.period.id);
      setPeriodData({ period: null, days: [], sessions: [], schedules: [], invigilators: [], roomAssignments: [] });
      setClassShifts({});
      setInvigilators({});
      setSessions(defaultSessions);
      setNotice('Jadwalkii draft-ka ahaa waa la joojiyey.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Jadwalka lama joojin karin.');
    } finally { setSaving(false); }
  };

  const handlePublish = async () => {
    if (isReadOnly || !periodData.period) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await ApiClient.publishTermExamPeriod(periodData.period.id);
      await loadPeriod(selectedTermId);
      setNotice('Jadwalka imtixaanka term-ka waa la daabacay.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Jadwalka lama daabici karin.');
    } finally { setSaving(false); }
  };

  const printTimetable = () => window.print();

  if (loading) return <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-[#64748B]">Waa la soo dejinayaa xogta term-ka…</div>;

  return (
    <div className="term-exam-panel space-y-5">
      <style>{`
        .term-exam-print { display: none; }
        .dark .term-exam-panel section { background-color: #0f172a !important; border-color: #334155 !important; color: #e2e8f0 !important; }
        .dark .term-exam-panel h2, .dark .term-exam-panel h3, .dark .term-exam-panel strong { color: #f1f5f9; }
        .dark .term-exam-panel label, .dark .term-exam-panel p { color: #cbd5e1; }
        .dark .term-exam-panel input, .dark .term-exam-panel select { background-color: #1e293b !important; border-color: #475569 !important; color: #f1f5f9 !important; }
        .dark .term-exam-panel .bg-\\[\\#F8FAFC\\], .dark .term-exam-panel .bg-\\[\\#F1F5F9\\] { background-color: #1e293b !important; }
        .dark .term-exam-panel .border-\\[\\#E2E8F0\\] { border-color: #334155 !important; }
        @media print {
          body * { visibility: hidden !important; }
          .term-exam-print, .term-exam-print * { visibility: visible !important; }
          .term-exam-print { display: block !important; position: absolute; inset: 0; width: 100%; padding: 8mm; color: #111; background: #fff; }
          .term-exam-no-print { display: none !important; }
          .term-exam-print table { width: 100%; border-collapse: collapse; font-size: 10px; }
          .term-exam-print th, .term-exam-print td { border: 1px solid #222; padding: 7px; text-align: left; }
          .term-exam-print h1, .term-exam-print h2 { text-align: center; }
        }
      `}</style>
      <section className="term-exam-no-print rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-base font-bold text-[#132A29]">Jadwalka Imtixaanka Term-ka</h2><p className="mt-1 text-xs text-[#64748B]">Term 1 iyo Term 2 oo keliya. Quizzes-ka macallimiinta halkan laguma jadwaleeyo.</p></div>
          {periodData.period && <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${periodData.period.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{periodData.period.status === 'published' ? 'La daabacay' : 'Draft'}</span>}
        </div>
        {error && <div role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        {notice && <div role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-[#475569]">Term-ka
            <select value={selectedTermId} onChange={event => handleTermChange(event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 font-normal">
              <option value="">Dooro term</option>{terms.map(term => <option key={term.id} value={term.id}>{term.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-[#475569]">Magaca imtixaanka
            <input value={periodName} onChange={event => setPeriodName(event.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-normal" />
          </label>
          <label className="text-xs font-semibold text-[#475569]">Taariikhda bilowga
            <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-normal" />
          </label>
          <label className="text-xs font-semibold text-[#475569]">Taariikhda dhammaadka
            <input type="date" value={endDate} min={startDate} onChange={event => setEndDate(event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-normal" />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-sm font-bold text-[#132A29]">Fadhiyada maalin kasta</h3><p className="mt-1 text-[11px] text-[#64748B]">Dooro tirada fadhiyada, waqtiga iyo shift-ka fasallada loo oggol yahay.</p></div>
          <label className="text-xs font-semibold text-[#475569]">Tirada fadhiyada
            <input type="number" min={1} max={8} value={sessions.length} onChange={event => resizeSessions(Number(event.target.value) || 1)} className="ml-2 w-20 rounded-lg border border-[#CBD5E1] px-2 py-2 font-normal" />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {sessions.map((session, index) => <div key={index} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <label className="block text-[11px] font-semibold text-[#475569]">Magaca fadhiga<input value={session.name} onChange={event => updateSession(index, { name: event.target.value })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-2 font-normal" /></label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-[11px] font-semibold text-[#475569]">Bilow<input type="time" value={session.startTime} onChange={event => updateSession(index, { startTime: event.target.value })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-2 font-normal" /></label>
              <label className="text-[11px] font-semibold text-[#475569]">Dhammaad<input type="time" value={session.endTime} onChange={event => updateSession(index, { endTime: event.target.value })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-2 font-normal" /></label>
            </div>
            <label className="mt-2 block text-[11px] font-semibold text-[#475569]">Shift-ka fadhiga
              <select value={session.shiftTag} onChange={event => updateSession(index, { shiftTag: event.target.value as SessionDraft['shiftTag'] })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-2 font-normal">
                <option value="morning">Subax</option><option value="afternoon">Galab</option><option value="all">Dhammaan / Full day</option>
              </select>
            </label>
          </div>)}
        </div>
        <div className="mt-5">
          <h3 className="text-sm font-bold text-[#132A29]">Shift-ka imtixaanka ee fasallada</h3>
          <p className="mt-1 text-[11px] text-[#64748B]">Fasal walba hal shift ayuu ku jiraa. Default-ku wuxuu ka imanayaa shift-ka caadiga ah ee fasalka; term-kan waad ka beddeli kartaa.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map(klass => <label key={klass.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs">
              <span className="font-semibold text-[#334155]">{klass.name}</span>
              <select value={classShifts[klass.id] || ((klass.normalExamShift ?? klass.normal_exam_shift) === 'morning' || (klass.normalExamShift ?? klass.normal_exam_shift) === 'afternoon' ? (klass.normalExamShift ?? klass.normal_exam_shift) : klass.shift === 2 ? 'afternoon' : 'morning')} onChange={event => setClassShifts(current => ({ ...current, [klass.id]: event.target.value as 'morning' | 'afternoon' }))} className="rounded-md border border-[#CBD5E1] bg-white px-2 py-1.5">
                <option value="morning">Subax</option><option value="afternoon">Galab</option>
              </select>
            </label>)}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => void handleGenerate()} disabled={isReadOnly || saving || !selectedTermId || !startDate || !endDate || periodData.period?.status === 'published'} className="rounded-lg bg-[#0F766E] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Waa la shaqaynayaa…' : 'Samee jadwalka term-ka'}</button>
        </div>
      </section>

      {periodData.period && <section className="term-exam-no-print rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-[#132A29]">Qolalka iyo kormeerayaasha</h2><p className="mt-1 text-xs text-[#64748B]">Ardayda fasallo kala duwan ayaa hal qol lagu dhex qasaa; exam number-kuna fasal kasta ayuu si gooni ah uga sii socdaa qolalka.</p></div><button type="button" onClick={() => void handleSaveInvigilators()} disabled={isReadOnly || saving || periodData.period.status === 'published'} className="rounded-lg border border-[#0F766E] px-3 py-2 text-xs font-bold text-[#0F766E] disabled:opacity-50">Kaydi kormeerayaasha</button></div>
        <div className="mt-4 space-y-4">
          {periodData.sessions.map(session => {
            const date = dayById.get(session.exam_day_id);
            const roomRows = usedRoomsBySession.get(session.id) || [];
            if (!roomRows.length) return null;
            return <div key={session.id} className="rounded-lg border border-[#E2E8F0] p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-[#132A29]">{date} · {session.name} · {String(session.start_time).slice(0,5)}–{String(session.end_time).slice(0,5)}</strong><span className="text-[10px] text-[#64748B]">{session.shift_tag === 'all' ? 'Dhammaan shifts' : session.shift_tag}</span></div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {roomRows.map(room => <div key={room.roomId} className="rounded-lg bg-[#F8FAFC] p-3">
                  <div className="flex items-center justify-between gap-2"><strong className="text-xs">{room.roomName}</strong><span className="text-[10px] text-[#64748B]">{room.studentCount}/{room.capacity} arday</span></div>
                  <div className="mt-2 space-y-1">{room.classRanges.map(range => <p key={range.classId} className="text-[10px] text-[#64748B]">{classNames.get(range.classId) || range.classId}: exam no. {range.fromNumber}–{range.toNumber} ({range.studentCount})</p>)}</div>
                  <label className="mt-3 block text-[11px] font-semibold text-[#475569]">Kormeeraha
                    <select value={invigilators[session.id + ':' + room.roomId] || ''} onChange={event => setInvigilators(current => ({ ...current, [session.id + ':' + room.roomId]: event.target.value }))} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-2 font-normal">
                      <option value="">Dooro macallin</option>{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}
                    </select>
                  </label>
                </div>)}
              </div>
            </div>;
          })}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={printTimetable} className="rounded-lg border border-[#CBD5E1] px-4 py-2.5 text-xs font-bold text-[#334155]">Daabac A4 (jadwalka + liisaska qolalka)</button>
          <button type="button" onClick={() => void handleCancelPeriod()} disabled={isReadOnly || saving || periodData.period.status === 'published'} className="rounded-lg border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-700 disabled:opacity-50">Jooji draft-ka</button>
          <button type="button" onClick={() => void handlePublish()} disabled={isReadOnly || saving || periodData.period.status === 'published' || !periodData.schedules.length} className="rounded-lg bg-[#0F766E] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Daabac jadwalka (Publish)</button>
        </div>
      </section>}

      {periodData.period && <section className="term-exam-no-print rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-[#132A29]">Jadwalka maaddooyinka</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[680px] border-collapse text-xs">
          <thead><tr className="bg-[#F1F5F9] text-left"><th className="p-3">Taariikh</th><th className="p-3">Fadhi</th><th className="p-3">Maaddo</th><th className="p-3">Shift</th><th className="p-3">Arday</th><th className="p-3">Xaalad</th></tr></thead>
          <tbody>{periodData.schedules.map(schedule => {
            const session = sessionById.get(schedule.exam_session_id);
            return <tr key={schedule.id} className="border-t border-[#E2E8F0]"><td className="p-3">{schedule.exam_date}</td><td className="p-3">{session?.name || '—'} · {String(schedule.start_time).slice(0,5)}</td><td className="p-3 font-semibold">{subjectNames.get(schedule.subject_id) || schedule.subject_id}</td><td className="p-3">{schedule.exam_shift === 'morning' ? 'Subax' : 'Galab'}</td><td className="p-3">{schedule.seat_capacity}</td><td className="p-3">{schedule.status === 'published' ? 'La daabacay' : 'Draft'}</td></tr>;
          })}</tbody>
        </table></div>
      </section>}

      <section className="term-exam-print">
        <h1>{periodName}</h1><h2>{terms.find(term => term.id === selectedTermId)?.name || 'Term Exam'}</h2>
        <p style={{ textAlign: 'center' }}>{startDate} — {endDate}</p>
        <table><thead><tr><th>Taariikh</th><th>Fadhi</th><th>Waqti</th><th>Maaddo</th><th>Shift</th></tr></thead>
          <tbody>{periodData.schedules.map(schedule => {
            const session = sessionById.get(schedule.exam_session_id);
            return <tr key={schedule.id}><td>{schedule.exam_date}</td><td>{session?.name || '—'}</td><td>{String(schedule.start_time).slice(0,5)}–{String(schedule.end_time).slice(0,5)}</td><td>{subjectNames.get(schedule.subject_id) || schedule.subject_id}</td><td>{schedule.exam_shift}</td></tr>;
          })}</tbody>
        </table>
      </section>
      <section className="term-exam-print">
        <h1>{periodName} — Liisaska Fadhiyada Qolalka</h1>
        <h2>{terms.find(term => term.id === selectedTermId)?.name || 'Term Exam'}</h2>
        {periodData.sessions.map(session => {
          const roomRows = usedRoomsBySession.get(session.id) || [];
          if (!roomRows.length) return null;
          const examDay = periodData.days.find(day => day.id === session.exam_day_id);
          return roomRows.map(room => <div key={session.id + ':' + room.roomId} style={{ pageBreakAfter: 'always', breakAfter: 'page' }}>
            <h2>{examDay?.exam_date || ''} · {session.name} · {String(session.start_time).slice(0,5)}–{String(session.end_time).slice(0,5)}</h2>
            <h3>{room.roomName} — {room.studentCount}/{room.capacity} arday</h3>
            <table><thead><tr><th>Kursi</th><th>Exam No.</th><th>Student ID</th><th>Roll No.</th><th>Magaca ardayga</th><th>Fasal</th><th>Maaddo</th></tr></thead>
              <tbody>{room.seats.map(seat => <tr key={seat.studentId + ':' + seat.subjectId}>
                <td>{seat.seatNumber}</td><td>{seat.examNumber}</td><td>{seat.studentId}</td><td>{seat.rollNumber || '—'}</td>
                <td>{seat.studentName || '—'}</td><td>{classNames.get(seat.classId) || seat.classId}</td><td>{subjectNames.get(seat.subjectId) || seat.subjectId}</td>
              </tr>)}</tbody>
            </table>
          </div>);
        })}
      </section>
    </div>
  );
};
