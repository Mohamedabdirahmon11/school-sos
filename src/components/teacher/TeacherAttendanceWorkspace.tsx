import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, LockKeyhole, Phone, Printer, RefreshCw, Users } from 'lucide-react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import type { AttendanceStatus, Student } from '../../types/index.ts';
import { PageHeader, Card, Button, Pill, EmptyState, FormRow } from '../SchoolDesignSystem.tsx';

type Tab = 'today' | 'timetable' | 'classes' | 'attendance' | 'reports';
type Mark = { status: AttendanceStatus; note: string };
const STATUS_LABELS: Record<AttendanceStatus, string> = { present: 'Jooga', absent: 'Maqan', late: 'Daahay', excused: 'Cudur-daar' };
const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-600 text-white border-emerald-600',
  absent: 'bg-rose-600 text-white border-rose-600',
  late: 'bg-amber-500 text-white border-amber-500',
  excused: 'bg-sky-700 text-white border-sky-700'
};
const dateDaysAgo = (date: string, days: number) => {
  const value = new Date(date + 'T12:00:00.000Z');
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
};

export const TeacherAttendanceWorkspace: React.FC = () => {
  const { school, user, isReadOnly } = useAuth();
  const [tab, setTab] = useState<Tab>('today');
  const [overview, setOverview] = useState<any>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [attendanceDate, setAttendanceDate] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [session, setSession] = useState<any>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [rosterClassId, setRosterClassId] = useState('');
  const [roster, setRoster] = useState<Student[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadOverview = async () => {
    setLoadingOverview(true); setError('');
    try {
      const result = await ApiClient.getTeacherAttendanceOverview();
      setOverview(result);
      setAttendanceDate(result.date);
      if (!selectedClassId && result.classes?.length) setSelectedClassId(result.classes[0].id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Xogta macallinka lama soo dejin karin.'); }
    finally { setLoadingOverview(false); }
  };

  useEffect(() => { void loadOverview(); }, [school?.id, user?.id]);

  const classes = overview?.classes || [];
  const timetable = overview?.timetable || [];
  const todayLessons = overview?.todayLessons || [];
  const attendanceMode = overview?.settings?.attendanceMode || 'daily';
  const selectedClass = classes.find((item: any) => item.id === selectedClassId);
  const classSubjects = selectedClass?.subjects || [];
  const assignedSectionIds = [...new Set(classSubjects.map((item: any) => item.sectionId).filter(Boolean))];
  const availableSections = (selectedClass?.sections || []).filter((section: any) => !assignedSectionIds.length || assignedSectionIds.includes(section.id));
  const lessonOptions = useMemo(() => timetable.filter((item: any) =>
    item.classId === selectedClassId && item.subjectId === selectedSubjectId && item.dayOfWeek === (attendanceDate ? new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(attendanceDate + 'T12:00:00.000Z')) : overview?.weekday)
  ), [timetable, selectedClassId, selectedSubjectId, attendanceDate, overview?.weekday]);
  const activeLesson = lessonOptions.find((item: any) => item.periodId === selectedPeriodId) || lessonOptions[0];
  const isLocked = Boolean(session?.is_locked || (session?.submitted_at && Date.now() > new Date(session.submitted_at).getTime() + Number(overview?.settings?.editWindowHours ?? 2) * 3600000));
  const counts = useMemo(() => {
    const result = { present: 0, absent: 0, late: 0, excused: 0 };
    students.forEach(student => { const status = marks[student.id]?.status || 'present'; result[status] += 1; });
    return result;
  }, [students, marks]);

  useEffect(() => {
    if (!selectedClassId || !classes.length) return;
    const current = classes.find((item: any) => item.id === selectedClassId);
    if (!current) setSelectedClassId(classes[0].id);
  }, [classes, selectedClassId]);

  useEffect(() => {
    if (!classSubjects.some((item: any) => item.id === selectedSubjectId)) setSelectedSubjectId(classSubjects[0]?.id || '');
  }, [selectedClassId, classSubjects, selectedSubjectId]);

  useEffect(() => {
    const subjectSection = classSubjects.find((item: any) => item.id === selectedSubjectId)?.sectionId;
    if (subjectSection && availableSections.some((section: any) => section.id === subjectSection)) setSelectedSectionId(subjectSection);
    else if (!availableSections.some((section: any) => section.id === selectedSectionId)) setSelectedSectionId(availableSections[0]?.id || '');
  }, [selectedClassId, selectedSubjectId, availableSections, classSubjects, selectedSectionId]);

  useEffect(() => {
    if (attendanceMode !== 'per_period') { setSelectedPeriodId(''); return; }
    if (!lessonOptions.some((item: any) => item.periodId === selectedPeriodId)) setSelectedPeriodId(lessonOptions[0]?.periodId || '');
  }, [attendanceMode, lessonOptions, selectedPeriodId]);

  useEffect(() => {
    if (tab !== 'attendance' || !selectedClassId || !attendanceDate) return;
    let cancelled = false;
    setLoadingAttendance(true); setError(''); setNotice('');
    setStudents([]); setMarks({}); setSession(null);
    const subjectId = attendanceMode === 'per_period' ? selectedSubjectId : '';
    const periodId = attendanceMode === 'per_period' ? selectedPeriodId : '';
    if (attendanceMode === 'per_period' && (!subjectId || !periodId)) { setLoadingAttendance(false); return; }
    Promise.all([
      ApiClient.getAttendanceSession({ classId: selectedClassId, date: attendanceDate, subjectId: subjectId || null, periodId: periodId || null, sectionId: selectedSectionId || null })
    ]).then(([sessionData]) => {
      if (cancelled) return;
      const rosterRows = (sessionData.students || []) as Student[];
      setStudents(rosterRows);
      setSession(sessionData.session);
      const existing = new Map((sessionData.records || []).map((row: any) => [row.student_id, row]));
      setMarks(Object.fromEntries(rosterRows.map(student => {
        const row: any = existing.get(student.id);
        return [student.id, { status: row?.status || 'present', note: row?.note || '' }];
      })));
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Xaadirinta lama soo dejin karin.'); })
      .finally(() => { if (!cancelled) setLoadingAttendance(false); });
    return () => { cancelled = true; };
  }, [tab, selectedClassId, attendanceDate, attendanceMode, selectedSubjectId, selectedPeriodId, selectedSectionId, school?.id]);

  useEffect(() => {
    if (tab !== 'attendance' || !overview?.date) return;
    let cancelled = false;
    setHistoryLoading(true);
    ApiClient.getTeacherAttendanceSessions(dateDaysAgo(overview.date, 30))
      .then(rows => { if (!cancelled) setSessionHistory(rows); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Taariikhda xaadirinta lama soo dejin karin.'); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [tab, overview?.date, school?.id, user?.id]);

  const openAttendance = (lesson?: any) => {
    if (lesson) {
      setSelectedClassId(lesson.classId);
      setSelectedSubjectId(lesson.subjectId || '');
      setSelectedPeriodId(lesson.periodId || '');
      setSelectedSectionId(lesson.sectionId || '');
      setAttendanceDate(overview?.date || attendanceDate);
    }
    setTab('attendance');
  };

  const openRoster = async (classId: string) => {
    setRosterClassId(classId); setRoster([]); setRosterLoading(true); setError('');
    try { setRoster(await ApiClient.getTeacherAttendanceStudents(classId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Liiska ardayda lama soo dejin karin.'); }
    finally { setRosterLoading(false); }
  };

  const saveAttendance = async () => {
    if (isReadOnly || saving || loadingAttendance || !students.length || isLocked) return;
    if (attendanceMode === 'per_period' && (!selectedSubjectId || !selectedPeriodId)) { setError('Dooro maaddada iyo casharka.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await ApiClient.submitAttendanceSession({
        classId: selectedClassId, date: attendanceDate,
        subjectId: attendanceMode === 'per_period' ? selectedSubjectId : null,
        periodId: attendanceMode === 'per_period' ? selectedPeriodId : null,
        sectionId: selectedSectionId || activeLesson?.sectionId || null,
        records: students.map(student => ({ studentId: student.id, status: marks[student.id]?.status || 'present', note: marks[student.id]?.note || '' }))
      });
      setSession(result.session); setNotice('Xaadirinta si guul leh ayaa loo gudbiyey.'); await loadOverview();
    } catch (e) { setError(e instanceof Error ? e.message : 'Xaadirinta lama kaydin karin. Calaamadaha aad dooratay way sii joogayaan.'); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    if (tab !== 'reports' || !overview?.date) return;
    let cancelled = false; setReportLoading(true); setError('');
    ApiClient.getAttendanceReport({ startDate: dateDaysAgo(overview.date, 30), endDate: overview.date })
      .then(value => { if (!cancelled) setReport(value); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Warbixinta lama soo dejin karin.'); })
      .finally(() => { if (!cancelled) setReportLoading(false); });
    return () => { cancelled = true; };
  }, [tab, overview?.date, school?.id, user?.id]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'today', label: 'Maanta' }, { id: 'timetable', label: 'Jadwalkayga' },
    { id: 'classes', label: 'Fasalladayda' }, { id: 'attendance', label: 'Xaadiris' }, { id: 'reports', label: 'Warbixin' }
  ];

  if (loadingOverview) return <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-8"><div className="h-9 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /><div className="h-48 animate-pulse rounded-2xl bg-white dark:bg-slate-900" /></main>;

  return <main className="mx-auto min-w-0 w-full max-w-6xl space-y-5 p-3 pb-24 md:p-8">
    <PageHeader title="Xarunta Macallinka" subtitle="Casharradaada, fasalladaada iyo xaadirinta ardayda." />
    <nav className="sticky top-0 z-10 grid grid-cols-5 gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95" aria-label="Qaybaha macallinka">
      {tabs.map(item => <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-current={tab === item.id ? 'page' : undefined}
        className={'min-h-12 rounded-xl px-1 text-[11px] font-bold sm:text-sm ' + (tab === item.id ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>
        {item.label}
      </button>)}
    </nav>
    {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"><span>{error}</span><Button onClick={() => { setError(''); if (tab === 'attendance') setTab('today'); void loadOverview(); }}>Mar kale isku day</Button></div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div>}

    {tab === 'today' && <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4"><p className="text-xs text-slate-500">Fasalladaada</p><p className="mt-1 text-2xl font-bold">{classes.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Casharrada maanta</p><p className="mt-1 text-2xl font-bold">{todayLessons.length}</p></Card>
      </div>
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Casharrada maanta</h2><Pill>{overview?.date || ''}</Pill></div>
      {!todayLessons.length ? <Card><EmptyState><CalendarDays className="mx-auto h-8 w-8 text-teal-700" /><p className="font-semibold">Maanta cashar jadwalkaaga kuma jiro.</p><p>Ka eeg jadwalka toddobaadka ama fasallada laguu xilsaaray.</p></EmptyState></Card> :
        <div className="grid gap-3 sm:grid-cols-2">{todayLessons.map((lesson: any, index: number) => <Card key={lesson.id} className={'space-y-3 p-4 ' + (lesson.isNextLesson ? 'border-teal-400 ring-1 ring-teal-100 dark:ring-teal-900' : '')}>
          <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-teal-700">{lesson.startTime} – {lesson.endTime}</p><h3 className="mt-1 text-base font-bold">{lesson.subjectName}</h3><p className="text-sm text-slate-500">{lesson.className}</p></div>
            <Pill>{lesson.attendanceTaken ? 'La qaaday' : 'Sugaya'}</Pill></div>
          <Button variant="primary" className="min-h-12 w-full" onClick={() => openAttendance(lesson)}>{lesson.attendanceTaken ? 'Eeg / wax ka beddel' : 'Qaado xaadiris'}</Button>
        </Card>)}</div>}
    </section>}

    {tab === 'timetable' && <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Jadwalkayga toddobaadlaha</h2><Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Daabac / PDF</Button></div>
      {!timetable.length ? <Card><EmptyState><CalendarDays className="mx-auto h-8 w-8" /><p>Jadwal laguu qoondeeyey weli ma jiro.</p></EmptyState></Card> :
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800"><tr><th className="px-3 py-3 text-xs font-bold">Cashar / Waqti</th>{[{key:'Monday',label:'Isniin'},{key:'Tuesday',label:'Talaado'},{key:'Wednesday',label:'Arbaco'},{key:'Thursday',label:'Khamiis'},{key:'Friday',label:'Jimce'},{key:'Saturday',label:'Sabti'}].map(day => <th key={day.key} className={'px-3 py-3 text-xs font-bold ' + (day.key === overview?.weekday ? 'bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200' : '')}>{day.label}{day.key === overview?.weekday ? ' · Maanta' : ''}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{Array.from(new Set<number>(timetable.map((item: any) => Number(item.periodNumber)))).sort((a,b) => a-b).map((period: number) => {
              const periodLessons = timetable.filter((item: any) => item.periodNumber === period);
              const first = periodLessons[0];
              return <tr key={period}><th className="whitespace-nowrap px-3 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">Cashar {period}<span className="mt-1 block font-normal text-slate-400">{first?.startTime}–{first?.endTime}</span></th>
                {[{key:'Monday',label:'Isniin'},{key:'Tuesday',label:'Talaado'},{key:'Wednesday',label:'Arbaco'},{key:'Thursday',label:'Khamiis'},{key:'Friday',label:'Jimce'},{key:'Saturday',label:'Sabti'}].map(day => {
                  const lesson = periodLessons.find((item: any) => item.dayOfWeek === day.key);
                  return <td key={day.key} className={'min-w-32 px-3 py-3 align-top ' + (day.key === overview?.weekday ? 'bg-teal-50/60 dark:bg-teal-950/20' : '')}>{lesson ? <><p className="font-semibold">{lesson.subjectName}</p><p className="mt-1 text-xs text-slate-500">{lesson.className}</p><p className="text-xs text-slate-500">{lesson.startTime}–{lesson.endTime}</p></> : <span className="text-slate-300">—</span>}</td>;
                })}</tr>;
            })}</tbody>
          </table>
        </div>}
    </section>}

    {tab === 'classes' && <section className="space-y-3">
      <h2 className="text-lg font-bold">Fasallada iyo maaddooyinka laguu qoondeeyey</h2>
      {!classes.length ? <Card><EmptyState><Users className="mx-auto h-8 w-8" /><p className="font-semibold">Weli fasal laguma qoondeyn.</p><p>La xiriir Maamulka Dugsiga si laguugu xiro fasal iyo maaddo.</p></EmptyState></Card> :
        <div className="grid gap-3 sm:grid-cols-2">{classes.map((klass: any) => <Card key={klass.id} className="space-y-3 p-4"><div><h3 className="font-bold">{klass.name}{klass.section ? ' · ' + klass.section : ''}</h3><p className="mt-1 text-xs text-slate-500">{(klass.subjects || []).map((subject: any) => subject.name).join(' · ') || 'Form Teacher'}</p><p className="mt-1 text-xs font-semibold text-teal-700">{klass.studentCount || 0} arday</p></div>
          <Button className="min-h-11 w-full" onClick={() => { setSelectedClassId(klass.id); void openRoster(klass.id); }}>Fur liiska ardayda</Button>
          {rosterClassId === klass.id && <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">{rosterLoading ? <p className="text-sm text-slate-500">Liiska waa la soo dejinayaa…</p> : roster.map(student => <div key={student.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800"><div className="min-w-0"><p className="truncate text-sm font-semibold">{student.firstName} {student.middleName} {student.lastName}</p><p className="text-xs text-slate-500">{student.studentId}</p></div>{(student.fatherPhone || student.motherPhone) && <a className="flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-teal-700" href={'tel:' + (student.fatherPhone || student.motherPhone)}><Phone className="h-4 w-4" />Wac</a>}</div>)}</div>}
        </Card>)}</div>}
    </section>}

    {tab === 'attendance' && <section className="space-y-4">
      <Card className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
        <FormRow label="Fasal"><select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">{classes.map((item: any) => <option key={item.id} value={item.id}>{item.name}{item.section ? ' · ' + item.section : ''}</option>)}</select></FormRow>
        <FormRow label="Taariikh"><input type="date" max={overview?.date} value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900" /></FormRow>
        {availableSections.length > 0 && <FormRow label="Qaybta fasalka"><select value={selectedSectionId} onChange={e => setSelectedSectionId(e.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900"><option value="">Dhammaan qaybaha</option>{availableSections.map((section: any) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></FormRow>}
        {attendanceMode === 'per_period' && <>
          <FormRow label="Maaddo"><select value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">{classSubjects.map((subject: any) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></FormRow>
          <FormRow label="Cashar"><select value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">{lessonOptions.map((lesson: any) => <option key={lesson.periodId} value={lesson.periodId}>Cashar {lesson.periodNumber} · {lesson.startTime}–{lesson.endTime}</option>)}</select></FormRow>
        </>}
      </Card>
      {isLocked && <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><LockKeyhole className="h-5 w-5" />Xaadirintan waa xiran tahay. Maamulka dugsiga ayaa furi kara.</div>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(['present','absent','late','excused'] as AttendanceStatus[]).map(status => <Card key={status} className="p-3"><p className="text-xs text-slate-500">{STATUS_LABELS[status]}</p><p className="text-2xl font-black">{counts[status]}</p></Card>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold">Liiska ardayda</h2><Pill>{counts.present} jooga · {counts.absent} maqan</Pill></div><Button disabled={isLocked || saving || isReadOnly || !students.length} onClick={() => setMarks(Object.fromEntries(students.map(student => [student.id, { status: 'present' as AttendanceStatus, note: marks[student.id]?.note || '' }]))) }>Dhammaan Jooga</Button></div>
      {loadingAttendance ? <Card><p className="p-6 text-center text-sm text-slate-500">Liiska iyo xaadirinta waa la soo dejinayaa…</p></Card> :
        !students.length ? <Card><EmptyState><Users className="mx-auto h-8 w-8" /><p>Arday lama helin fasalkan.</p></EmptyState></Card> :
        <div className="space-y-3">{students.map(student => {
          const current = marks[student.id] || { status: 'present' as AttendanceStatus, note: '' };
          return <Card key={student.id} className="space-y-3 p-3"><div className="flex items-center justify-between gap-2"><div><p className="font-bold">{student.firstName} {student.lastName}</p><p className="text-xs text-slate-500">{student.studentId}</p></div><Pill>{STATUS_LABELS[current.status]}</Pill></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(['present','absent','late','excused'] as AttendanceStatus[]).map(status => <button key={status} type="button" disabled={isLocked || saving || isReadOnly} aria-pressed={current.status === status} onClick={() => setMarks(old => ({ ...old, [student.id]: { ...old[student.id], status } }))} className={'min-h-12 rounded-xl border px-2 text-sm font-bold disabled:opacity-50 ' + (current.status === status ? STATUS_STYLES[status] : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}>{STATUS_LABELS[status]}</button>)}</div>
            <input disabled={isLocked || saving || isReadOnly} value={current.note} onChange={e => setMarks(old => ({ ...old, [student.id]: { ...old[student.id], note: e.target.value } }))} placeholder="Faallo ikhtiyaari ah…" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
          </Card>;
        })}</div>}
      <Button variant="primary" disabled={isReadOnly || saving || loadingAttendance || isLocked || !students.length} className="min-h-14 w-full text-base" onClick={() => void saveAttendance()}>{saving ? 'Waa la gudbinayaa…' : 'Gudbi xaadirinta'}</Button>
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2"><h2 className="font-bold">Taariikhda xaadirinta (30 maalmood)</h2><Pill>{sessionHistory.length} kulan</Pill></div>
        {historyLoading ? <p className="text-sm text-slate-500">Taariikhda waa la soo dejinayaa…</p> : !sessionHistory.length
          ? <EmptyState><Clock3 className="mx-auto h-7 w-7" /><p>Weli kulan xaadirin hore lama helin.</p></EmptyState>
          : <div className="space-y-2">{sessionHistory.map((item: any) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="min-w-0"><p className="font-semibold">{item.className} · {item.subjectName || 'Maalinle'}</p><p className="text-xs text-slate-500">{item.date} · {item.period_id ? 'Cashar' : 'Maalinle'} · {item.submitted_at ? new Date(item.submitted_at).toLocaleString() : 'Aan la gudbin'}</p></div>
              <div className="flex items-center gap-2"><Pill>{item.is_locked ? 'Xiran' : 'Furan'}</Pill><Button className="min-h-10 px-3 text-xs" disabled={isReadOnly} onClick={() => { setSelectedClassId(item.class_id); setSelectedSubjectId(item.subject_id || ''); setSelectedPeriodId(item.period_id || ''); setSelectedSectionId(item.section_id || ''); setAttendanceDate(item.date); }}>{item.is_locked || (item.submitted_at && Date.now() > new Date(item.submitted_at).getTime() + Number(overview?.settings?.editWindowHours ?? 2) * 3600000) ? 'Eeg' : 'Dib u eeg'}</Button></div>
            </div>)}</div>}
      </Card>
    </section>}

    {tab === 'reports' && <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Warbixinta 30-ka maalmood</h2><Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Daabac / PDF</Button></div>
      {reportLoading ? <Card><p className="p-6 text-center">Warbixinta waa la soo dejinayaa…</p></Card> : !report?.summaries?.length ? <Card><EmptyState><CheckCircle2 className="mx-auto h-8 w-8" /><p>Weli xog xaadirin kuma filna warbixin.</p></EmptyState></Card> :
        <div className="space-y-3">{report.summaries.filter((item: any) => item.absent > 0).sort((a: any,b: any) => b.absenceStreak - a.absenceStreak).map((item: any) => <Card key={item.studentId} className="flex items-center justify-between gap-3 p-4"><div><p className="font-bold">{item.studentName}</p><p className="text-xs text-slate-500">{item.className} · {item.studentId}</p></div><div className="text-right"><p className="font-bold">{item.attendancePercentage}%</p><p className={'text-xs ' + (item.absenceStreak >= 3 ? 'font-bold text-rose-600' : 'text-slate-500')}>{item.absenceStreak} maalmood maqnaansho isku xigta</p></div></Card>)}</div>}
    </section>}
  </main>;
};
