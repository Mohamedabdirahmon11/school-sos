/**
 * Timetable Grid Editor with Real-Time Clash Detection
 * Visual Day-Period matrix, subject/teacher/room assignment, conflict validator
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { TimetableSlot, SchoolClass, Subject, Teacher } from '../../types/index.ts';
import { CalendarDays, AlertTriangle, CheckCircle2, Plus, X, Printer, Settings2, WandSparkles } from 'lucide-react';

export const TimetableView: React.FC = () => {
  const { school, isReadOnly, t } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [timetable, setTimetable] = useState<TimetableSlot[]>([]);
  const [classSubjectAssignments, setClassSubjectAssignments] = useState<Array<{ id: string; teacherId?: string; subject: Subject | null; teacher: { id: string; fullName: string } | null }>>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [clashWarning, setClashWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'class' | 'teacher'>('class');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedTeacherShift, setSelectedTeacherShift] = useState<1 | 2>(1);
  const [settings, setSettings] = useState({ firstPeriodStart: '08:00', periodMinutes: 40, breakAfterPeriod: 3, breakMinutes: 20, shift2FirstPeriodStart: '13:00', shift2PeriodMinutes: 40, shift2BreakAfterPeriod: 3, shift2BreakMinutes: 20 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [printAllClasses, setPrintAllClasses] = useState(false);
  const [displayClassIds, setDisplayClassIds] = useState<string[]>([]);

  // New slot form state
  const [dayOfWeek, setDayOfWeek] = useState<any>('Monday');
  const [periodNumber, setPeriodNumber] = useState(1);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('08:45');
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [roomNumber, setRoomNumber] = useState('');

  const days: ('Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday')[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const periods = [1, 2, 3, 4, 5, 6];
  const periodsForDay = (day: string) => periods.filter(period => day !== 'Friday' || period <= 5);
  const periodTime = (period: number, shift: number = 1) => {
    const afternoon = shift === 2;
    const firstPeriodStart = afternoon ? settings.shift2FirstPeriodStart : settings.firstPeriodStart;
    const periodMinutes = afternoon ? settings.shift2PeriodMinutes : settings.periodMinutes;
    const breakAfterPeriod = afternoon ? settings.shift2BreakAfterPeriod : settings.breakAfterPeriod;
    const breakMinutes = afternoon ? settings.shift2BreakMinutes : settings.breakMinutes;
    const [hour, minute] = firstPeriodStart.split(':').map(Number);
    const start = hour * 60 + minute + (period - 1) * periodMinutes + (period > breakAfterPeriod ? breakMinutes : 0);
    const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    return `${clock(start)} - ${clock(start + periodMinutes)}`;
  };

  const fetchData = async () => {
    if (!school) return;
    setLoadError(null);
    const results = await Promise.allSettled([
      ApiClient.getClasses(),
      ApiClient.getSubjects(school.id),
      ApiClient.getTeachers(school.id),
      ApiClient.getTimetable(),
      ApiClient.getTimetableSettings()
    ]);
    const errors: string[] = [];
    const [classResult, subjectResult, teacherResult, timetableResult, settingsResult] = results;
    const clsList = classResult.status === 'fulfilled' && Array.isArray(classResult.value) ? classResult.value : [];
    const subList = subjectResult.status === 'fulfilled' && Array.isArray(subjectResult.value) ? subjectResult.value : [];
    const tchList = teacherResult.status === 'fulfilled' && Array.isArray(teacherResult.value) ? teacherResult.value : [];
    const schedule = timetableResult.status === 'fulfilled' && Array.isArray(timetableResult.value) ? timetableResult.value : [];
    const schoolSettings = settingsResult.status === 'fulfilled' ? settingsResult.value : null;
    if (classResult.status === 'rejected') errors.push('Fasallada lama soo dejin: ' + (classResult.reason instanceof Error ? classResult.reason.message : 'API error'));
    if (subjectResult.status === 'rejected') errors.push('Maaddooyinka lama soo dejin.');
    if (teacherResult.status === 'rejected') errors.push('Macallimiinta lama soo dejin.');
    if (timetableResult.status === 'rejected') errors.push('Jadwalkii hore lama soo dejin.');
    if (settingsResult.status === 'rejected') errors.push('Dejimaha waqtiga lama soo dejin; waqtiga caadiga ah ayaa la isticmaalayaa.');
    setClasses(clsList);
    setDisplayClassIds(current => {
      const valid = current.filter(id => clsList.some(item => item.id === id)).slice(0, 5);
      return valid.length ? valid : clsList.slice(0, 5).map(item => item.id);
    });
    setSubjects(subList);
    setTeachers(tchList);
    setTimetable(schedule);
    if (schoolSettings) setSettings({
      firstPeriodStart: schoolSettings.firstPeriodStart || '08:00',
      periodMinutes: schoolSettings.periodMinutes || 40,
      breakAfterPeriod: schoolSettings.breakAfterPeriod || 3,
      breakMinutes: schoolSettings.breakMinutes ?? 20,
      shift2FirstPeriodStart: schoolSettings.shift2FirstPeriodStart || '13:00',
      shift2PeriodMinutes: schoolSettings.shift2PeriodMinutes || 40,
      shift2BreakAfterPeriod: schoolSettings.shift2BreakAfterPeriod || 3,
      shift2BreakMinutes: schoolSettings.shift2BreakMinutes ?? 20
    });
    if (clsList.length > 0) {
      const activeClassId = clsList.some(item => item.id === selectedClassId) ? selectedClassId : clsList[0].id;
      setSelectedClassId(activeClassId);
      setRoomNumber(clsList.find(item => item.id === activeClassId)?.roomNumber || '');
    } else {
      setSelectedClassId('');
      if (classResult.status === 'fulfilled') errors.push('Dugsigan weli fasal firfircoon kuma jiro. Marka hore samee fasal.');
    }
    if (subList.length > 0) setSubjectId(subList[0].id);
    if (tchList.length > 0) {
      setTeacherId(tchList[0].id);
      if (!selectedTeacherId) setSelectedTeacherId(tchList[0].id);
    }
    setLoadError(errors.join(' '));
  };

  useEffect(() => {
    fetchData();
  }, [school]);

  useEffect(() => {
    setRoomNumber(classes.find(klass => klass.id === selectedClassId)?.roomNumber || '');
  }, [classes, selectedClassId]);

  useEffect(() => {
    if (!selectedClassId) { setClassSubjectAssignments([]); return; }
    let active = true;
    ApiClient.getClassDetails(selectedClassId, { page: 1, pageSize: 1 })
      .then(details => {
        if (!active) return;
        const assignments = details.subjects.filter(item => item.subject).map(item => ({ id: item.id, teacherId: item.teacher?.id, subject: item.subject, teacher: item.teacher }));
        setClassSubjectAssignments(assignments);
        if (assignments.length) {
          setSubjectId(current => assignments.some(item => item.subject?.id === current) ? current : assignments[0].subject!.id);
          const firstTeacher = assignments.find(item => item.subject?.id === subjectId)?.teacher?.id || assignments[0].teacher?.id;
          if (firstTeacher) setTeacherId(firstTeacher);
        }
      })
      .catch(() => { if (active) setClassSubjectAssignments([]); });
    return () => { active = false; };
  }, [selectedClassId]);

  const assignedSubjectsForClass = classSubjectAssignments
    .map(item => item.subject)
    .filter((item): item is Subject => Boolean(item));
  const selectedSubjectAssignment = classSubjectAssignments.find(item => item.subject?.id === subjectId);
  const assignedTeachersForSubject = selectedSubjectAssignment?.teacher
    ? teachers.filter(item => item.id === selectedSubjectAssignment.teacher?.id)
    : [];

  // Clash detector
  const checkClash = (day: string, period: number, tchId: string, room: string) => {
    const selectedShift = Number(classes.find(item => item.id === selectedClassId)?.shift) === 2 ? 2 : 1;
    const teacherClash = tchId ? timetable.find(s =>
      s.dayOfWeek === day && s.periodNumber === period && s.teacherId === tchId && (Number(s.shift) === 2 ? 2 : 1) === selectedShift && !(s.classId === selectedClassId && s.dayOfWeek === day && s.periodNumber === period)
    ) : undefined;
    if (teacherClash) {
      const tch = teachers.find(t => t.id === tchId);
      return `Teacher Clash: ${tch?.fullName || 'Teacher'} is already teaching another class during ${day} Period ${period}!`;
    }

    const roomClash = timetable.find(s =>
      s.dayOfWeek === day && s.periodNumber === period && (Number(s.shift) === 2 ? 2 : 1) === selectedShift && String(s.roomNumber || '').trim().toLowerCase() === String(room || '').trim().toLowerCase() && !(s.classId === selectedClassId && s.dayOfWeek === day && s.periodNumber === period)
    );
    if (roomClash) {
      return `Room Clash: ${room} is already occupied during ${day} Period ${period}!`;
    }

    return null;
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    const clash = checkClash(dayOfWeek, periodNumber, teacherId, roomNumber);
    if (clash) { setClashWarning(clash); return; }
    try {
      const newSlot = await ApiClient.setTimetableSlot({ classId: selectedClassId, dayOfWeek, periodNumber, startTime, endTime, subjectId, teacherId, roomNumber });
      setTimetable(prev => [...prev.filter(s => !(s.dayOfWeek === dayOfWeek && s.periodNumber === periodNumber && s.classId === selectedClassId)), newSlot]);
      setShowAddModal(false); setClashWarning(null); setNotice('Timetable period saved.');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) { setClashWarning(err.message || 'Unable to save this timetable period.'); }
  };

  const handleGenerateAll = async () => {
    if (isReadOnly || !classes.length) return;
    if (!window.confirm('Dhammaan fasallada jadwalkooda ma dib ayaa loo sameeyaa? Jadwalkii hore ee fasallada leh maaddooyin loo qoondeeyay waa la beddelayaa.')) return;
    setNotice('Jadwalka dhammaan fasallada ayaa la diyaarinayaa…');
    try {
      const result = await ApiClient.generateAllTimetables();
      const generatedIds = new Set(result.generatedClassIds || []);
      setTimetable(current => [...current.filter(slot => !generatedIds.has(slot.classId)), ...result.slots]);
      const unfilledCount = result.unfilled.length;
      const skippedCount = result.skipped.length;
      setNotice(`Jadwalka ${generatedIds.size} fasal ayaa la sameeyay. ${unfilledCount} cashar lama meelayn; ${skippedCount} fasal waa la dhaafay, jadwalkoodii hore waa la ilaaliyay.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Auto-generate dhammaan fasallada wuu fashilmay.');
    }
  };

  const handleRemovePeriod = async (slot: TimetableSlot) => {
    try {
      await ApiClient.removeTimetablePeriod(slot.classId, slot.dayOfWeek, slot.periodNumber);
      setTimetable(prev => prev.filter(item => item.id !== slot.id));
    } catch (err: any) { setNotice(err.message || 'Unable to remove this period.'); }
  };

  const handleSaveSettings = async () => {
    try { await ApiClient.saveTimetableSettings(settings); setNotice('Timetable period times saved.'); }
    catch (err: any) { setNotice(err.message || 'Unable to save timetable settings.'); }
  };

  const openClassPeriodEditor = async (klass: SchoolClass) => {
    setSelectedClassId(klass.id);
    setRoomNumber(klass.roomNumber || '');
    setDayOfWeek('Monday');
    setPeriodNumber(1);
    setClashWarning(null);
    try {
      const details = await ApiClient.getClassDetails(klass.id, { page: 1, pageSize: 1 });
      const assignments = details.subjects.filter(item => item.subject).map(item => ({ id: item.id, teacherId: item.teacher?.id, subject: item.subject, teacher: item.teacher }));
      setClassSubjectAssignments(assignments);
      const first = assignments[0];
      setSubjectId(first?.subject?.id || '');
      setTeacherId(first?.teacher?.id || '');
      setShowAddModal(true);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to load subjects for this class.');
    }
  };

  const orderedClasses = [...classes].sort((a, b) => {
    const grade = (klass: SchoolClass) => {
      const label = String(klass.gradeLevel || klass.name || '').toLowerCase();
      if (/kg|kindergarten|nursery/.test(label)) return 0;
      return Number(label.match(/\\d+/)?.[0] || 99);
    };
    return grade(a) - grade(b) || String(a.section || '').localeCompare(String(b.section || ''));
  });
  const displayedClasses = viewMode === 'teacher'
    ? orderedClasses.filter(klass => timetable.some(slot => slot.classId === klass.id && slot.teacherId === selectedTeacherId && (Number(slot.shift) === 2 ? 2 : 1) === selectedTeacherShift)).slice(0, 5)
    : orderedClasses.filter(klass => displayClassIds.includes(klass.id)).slice(0, 5);
  const handlePrintAllClasses = () => {
    if (!displayedClasses.length) { setNotice('Select at least one class (maximum five) with a timetable to print.'); return; }
    setPrintAllClasses(true);
    window.setTimeout(() => {
      window.print();
      setPrintAllClasses(false);
    }, 100);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            School Timetable
          </h1>
          <p className="text-xs text-[#64748B]">
            Jadwal fasal kasta gooni ayuu u yahay. Waxaa muuqda maaddada iyo waqtiga oo keliya.
          </p>
        </div>
        {loadError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 sm:max-w-md">
          <p>{loadError}</p><button type="button" onClick={() => void fetchData()} className="mt-2 font-bold underline">Retry loading timetable</button>
        </div>}

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <select value={viewMode} onChange={e => setViewMode(e.target.value as any)} className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-xs bg-white">
            <option value="class">{t('timetable_view_class')}</option>
            <option value="teacher">{t('timetable_view_teacher')}</option>
          </select>
          <select
            value={selectedClassId}
            onChange={e => {
              const nextClassId = e.target.value;
              setSelectedClassId(nextClassId);
              setRoomNumber(classes.find(klass => klass.id === nextClassId)?.roomNumber || '');
            }}
            className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-xs bg-white text-[#334155] font-medium"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.roomNumber}) · Shift {c.shift || 1}</option>
            ))}
          </select>
          {viewMode === 'teacher' && <>
            <select value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)} className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-xs bg-white">{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}</select>
            <select value={selectedTeacherShift} onChange={e => setSelectedTeacherShift(Number(e.target.value) as 1 | 2)} className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-xs bg-white"><option value={1}>Shift 1 · Morning</option><option value={2}>Shift 2 · Afternoon</option></select>
          </>}
          
          <button onClick={() => void handleGenerateAll()} disabled={isReadOnly || !classes.length} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><WandSparkles className="h-3.5 w-3.5" /> Auto-generate All</button>
          <button onClick={handlePrintAllClasses} className="px-3 py-1.5 rounded-lg border border-[#0F766E] text-xs font-semibold text-[#0F766E]"><Printer className="w-3.5 h-3.5" /> Print A4 (max 5)</button>

          <button
            onClick={() => {
              setClashWarning(null);
              setShowAddModal(true);
            }}
            disabled={isReadOnly}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Add / Edit Period</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      <details className="group rounded-xl border border-[#E2E8F0] bg-white p-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[#334155]"><Settings2 className="h-4 w-4 text-[#0F766E]" /> Jadwal waqtigiisa iyo dejimaha fasallada</summary>
        <div className="mt-4 space-y-3">
        <h2 className="text-sm font-bold text-[#132A29]">{t('timetable_times')}</h2>
        <h3 className="text-xs font-semibold text-[#475569]">Shift 1 · Morning</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end text-xs">
          <label className="space-y-1"><span>{t('timetable_start_time')}</span><input type="time" value={settings.firstPeriodStart} onChange={e => setSettings(prev => ({ ...prev, firstPeriodStart: e.target.value }))} className="w-full border border-[#DCE7E4] rounded-lg px-3 py-2 text-xs text-[#102522] focus:outline-none focus:ring-2 focus:ring-[#0E8078]/20 focus:border-[#0E8078]" /></label>
          <label className="space-y-1"><span>{t('timetable_period_minutes')}</span><input type="number" min="20" max="120" value={settings.periodMinutes} onChange={e => setSettings(prev => ({ ...prev, periodMinutes: Number(e.target.value) }))} className="w-full border rounded px-2 py-1.5" /></label>
          <label className="space-y-1"><span>{t('timetable_break_after')}</span><select value={settings.breakAfterPeriod} onChange={e => setSettings(prev => ({ ...prev, breakAfterPeriod: Number(e.target.value) }))} className="w-full border rounded px-2 py-1.5">{[1,2,3,4,5].map(period => <option key={period} value={period}>{period}</option>)}</select></label>
          <label className="space-y-1"><span>{t('timetable_break_minutes')}</span><input type="number" min="0" max="120" value={settings.breakMinutes} onChange={e => setSettings(prev => ({ ...prev, breakMinutes: Number(e.target.value) }))} className="w-full border rounded px-2 py-1.5" /></label>
        </div>
        <h3 className="text-xs font-semibold text-[#475569] pt-2">Shift 2 · Afternoon</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end text-xs">
          <label className="space-y-1"><span>First period starts</span><input type="time" value={settings.shift2FirstPeriodStart} onChange={e => setSettings(prev => ({ ...prev, shift2FirstPeriodStart: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-xs" /></label>
          <label className="space-y-1"><span>Period minutes</span><input type="number" min="20" max="120" value={settings.shift2PeriodMinutes} onChange={e => setSettings(prev => ({ ...prev, shift2PeriodMinutes: Number(e.target.value) }))} className="w-full border rounded px-2 py-1.5" /></label>
          <label className="space-y-1"><span>Break after period</span><select value={settings.shift2BreakAfterPeriod} onChange={e => setSettings(prev => ({ ...prev, shift2BreakAfterPeriod: Number(e.target.value) }))} className="w-full border rounded px-2 py-1.5">{[1,2,3,4,5].map(period => <option key={period} value={period}>{period}</option>)}</select></label>
          <label className="space-y-1"><span>Break minutes</span><input type="number" min="0" max="120" value={settings.shift2BreakMinutes} onChange={e => setSettings(prev => ({ ...prev, shift2BreakMinutes: Number(e.target.value) }))} className="w-full border rounded px-2 py-1.5" /></label>
          <button onClick={handleSaveSettings} disabled={isReadOnly} className="px-3 py-2 rounded-lg bg-slate-100 text-xs disabled:opacity-50">{t('timetable_save_times')}</button>
        </div>
      </div>
      </details>
      <style>{`@page { size: A4 portrait; margin: 8mm; } @media print { body * { visibility: hidden !important; } .timetable-print-all, .timetable-print-all * { visibility: visible !important; } .timetable-print-all { display: block !important; position: absolute; inset: 0; width: 100%; padding: 0; background: white; } .timetable-print-grid { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5mm; align-items: start; } .timetable-print-class { break-inside: avoid; page-break-inside: avoid; margin: 0 !important; min-height: 0; } .timetable-print-class h2 { font-size: 9pt; margin-bottom: 2mm; } .timetable-print-class table { font-size: 6pt; } .timetable-print-class th, .timetable-print-class td { padding: 1.2mm !important; } }`}</style>
      {printAllClasses && <section className="timetable-print-all hidden">
        <h1 className="mb-1 text-lg font-bold">{school?.name || 'School'} · Timetables</h1>
        <p className="mb-3 text-xs">Up to five selected classes · one A4 sheet</p>
        <div className="timetable-print-grid grid grid-cols-2 gap-3">
        {displayedClasses.map(klass => (
          <article key={klass.id} className="timetable-print-class">
            <h2 className="mb-2 text-sm font-bold">{klass.name}{klass.section ? ` · Section ${klass.section}` : ''} {klass.roomNumber ? `· Room ${klass.roomNumber}` : ''}</h2>
            <table className="w-full border-collapse text-[7px]">
              <thead><tr><th className="border p-1 text-left">Day</th>{periods.map(period => <th key={period} className="border p-1">P{period}<span className="block font-normal">{periodTime(period, Number(klass.shift) === 2 ? 2 : 1)}</span></th>)}</tr></thead>
              <tbody>{days.map(day => <tr key={day}><th className="border p-1 text-left">{day.slice(0, 3)}</th>{periods.map(period => {
                const slot = timetable.find(item => item.classId === klass.id && item.dayOfWeek === day && item.periodNumber === period);
                const subject = subjects.find(item => item.id === slot?.subjectId);
                return <td key={period} className={`border p-1 text-center ${day === 'Friday' && period === 6 ? 'text-transparent' : ''}`}>{slot ? <><strong>{subject?.name || 'Subject'}</strong><span className="block">{slot.startTime}–{slot.endTime}</span></> : day === 'Friday' && period === 6 ? '' : '—'}</td>;
              })}</tr>)}</tbody>
            </table>
          </article>
        ))}
        </div>
      </section>}

      {viewMode !== 'teacher' && (
        <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#132A29]">Fasallada shaashadda ka muuqda</h2>
              <p className="text-xs text-[#64748B]">Dooro ugu badnaan 5 fasal. Jadwal kasta si gooni ah ayaa loo muujinayaa.</p>
            </div>
            <span className="text-xs font-semibold text-[#0F766E]">{displayClassIds.length}/5 selected</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {orderedClasses.map(klass => (
              <label key={klass.id} className="inline-flex items-center gap-2 text-xs text-[#334155]">
                <input type="checkbox" checked={displayClassIds.includes(klass.id)} disabled={!displayClassIds.includes(klass.id) && displayClassIds.length >= 5}
                  onChange={event => setDisplayClassIds(current => event.target.checked ? [...current, klass.id].slice(0, 5) : current.filter(id => id !== klass.id))}
                />
                {klass.name}{klass.section ? ` · ${klass.section}` : ''}
              </label>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {displayedClasses.map(klass => (
          <article key={klass.id} className="min-w-0 overflow-hidden rounded-xl border border-[#DCE7E4] bg-white shadow-sm">
            <header className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-[#132A29]">{klass.name}{klass.section ? ` · Section ${klass.section}` : ''}</h2>
                <p className="text-[10px] text-[#64748B]">{klass.roomNumber || 'Room not set'} · Shift {klass.shift || 1}</p>
              </div>
              {!isReadOnly && <button type="button" onClick={() => void openClassPeriodEditor(klass)} className="rounded-lg border border-[#CBD5E1] px-2.5 py-1.5 text-[10px] font-semibold text-[#0F766E]">Add period</button>}
            </header>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[9px]">
                <thead className="bg-white text-[#64748B]">
                  <tr>
                    <th className="w-16 border-b border-r p-2 text-left">Day</th>
                    {periods.map(period => <th key={period} className="border-b border-r p-2 text-center">P{period}<span className="block font-normal">{periodTime(period, Number(klass.shift) === 2 ? 2 : 1)}</span></th>)}
                  </tr>
                </thead>
                <tbody>
                  {days.map(day => (
                    <tr key={day}>
                      <th className="border-b border-r bg-[#FAFAFA] p-2 text-left font-semibold">{day.slice(0, 3)}</th>
                      {periods.map(period => {
                        const slot = timetable.find(item => item.classId === klass.id && item.dayOfWeek === day && item.periodNumber === period);
                        const subject = subjects.find(item => item.id === slot?.subjectId);
                        const isClosedPeriod = day === 'Friday' && period === 6;
                        return (
                          <td key={period} className={`h-14 border-b border-r p-1 text-center align-middle ${day === 'Friday' && period === 6 ? 'hidden' : ''}`}>
                            {isClosedPeriod ? <span className="text-slate-300">—</span> : slot ? (
                              <div className={`rounded-md border border-[#CCFBF1] bg-[#F0FDFA] p-1.5 ${!isReadOnly ? 'cursor-pointer hover:border-[#0F766E]' : ''}`}
                                onClick={() => { if (!isReadOnly) { setSelectedClassId(klass.id); setDayOfWeek(day); setPeriodNumber(period); setSubjectId(slot.subjectId); setTeacherId(slot.teacherId || ''); setRoomNumber(slot.roomNumber || klass.roomNumber || ''); setShowAddModal(true); } }}>
                                <strong className="block break-words text-[10px] text-[#0F766E]">{subject?.name || 'Subject'}</strong>
                                <span className="mt-1 block font-mono text-[9px] text-[#64748B]">{slot.startTime}–{slot.endTime}</span>
                                {!isReadOnly && <button type="button" onClick={event => { event.stopPropagation(); void handleRemovePeriod(slot); }} className="mt-1 text-[9px] text-rose-700 underline">{t('timetable_remove_period')}</button>}
                              </div>
                            ) : <span className="text-[9px] text-[#CBD5E1]">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
        {displayedClasses.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center text-sm text-[#64748B]">{classes.length === 0 ? 'Fasallo lama helin. Hubi in fasallada dugsiga la sameeyay iyo in koontadu leedahay rukhsadda School Admin.' : viewMode === 'teacher' ? 'Macallinkan weli jadwal looma qorin. U beddel Class view si aad u aragto fasallada.' : 'Fasal lama dooran. Dooro ugu yaraan hal fasal qaybta kore.'}</div>}
      </section>

      {/* ADD / EDIT PERIOD MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-[#E2E8F0]">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
              <h2 className="text-base font-bold text-[#132A29] flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-[#0F766E]" />
                <span>Assign Timetable Period</span>
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-[#64748B] hover:text-[#132A29]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {clashWarning && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-800">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{clashWarning}</span>
              </div>
            )}

            <form onSubmit={handleAddSlot} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#334155]">Day</label>
                  <select
                    value={dayOfWeek}
                    onChange={e => { const nextDay = e.target.value as typeof dayOfWeek; setDayOfWeek(nextDay); if (nextDay === 'Friday' && periodNumber > 5) setPeriodNumber(5); }}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                  >
                    {days.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#334155]">Period</label>
                  <select
                    value={periodNumber}
                    onChange={e => setPeriodNumber(parseInt(e.target.value, 10))}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                  >
                    {periodsForDay(dayOfWeek).map(p => <option key={p} value={p}>Period {p}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#334155]">Subject</label>
                <select
                  value={subjectId}
                  onChange={e => setSubjectId(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                >
                  {assignedSubjectsForClass.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#334155]">Teacher</label>
                <select
                  value={teacherId}
                  onChange={e => setTeacherId(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                >
                  <option value="">— Lama qoondeyn —</option>
                  {(assignedTeachersForSubject.length ? assignedTeachersForSubject : teachers.filter(item => classSubjectAssignments.some(assignment => assignment.teacher?.id === item.id))).map(t => <option key={t.id} value={t.id}>{t.fullName} ({t.department})</option>)}
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#334155]">Classroom Number</label>
                <input
                  type="text"
                  required
                  value={roomNumber}
                  onChange={e => setRoomNumber(e.target.value)}
                  placeholder="e.g. Room 201"
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-[#334155]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg font-semibold shadow-sm"
                >
                  Save Period
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
