/**
 * Timetable Grid Editor with Real-Time Clash Detection
 * Visual Day-Period matrix, subject/teacher/room assignment, conflict validator
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { TimetableSlot, SchoolClass, Subject, Teacher } from '../../types/index.ts';
import { CalendarDays, AlertTriangle, CheckCircle2, Plus, Clock, X } from 'lucide-react';

export const TimetableView: React.FC = () => {
  const { school, isReadOnly, t } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [timetable, setTimetable] = useState<TimetableSlot[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [clashWarning, setClashWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'class' | 'teacher' | 'day'>('class');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedDay, setSelectedDay] = useState('Monday');
  const [settings, setSettings] = useState({ firstPeriodStart: '08:00', periodMinutes: 40, breakAfterPeriod: 3, breakMinutes: 20 });
  const [unavailableSlots, setUnavailableSlots] = useState<Array<{ id: string; teacherId: string; dayOfWeek: string; periodNumber: number }>>([]);
  const [swapMode, setSwapMode] = useState(false);
  const [firstSwapSlot, setFirstSwapSlot] = useState<string | null>(null);
  const [unfilledSlots, setUnfilledSlots] = useState<Array<{ subjectId: string; teacherId: string; occurrence: number }>>([]);

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
  const periodTime = (period: number) => {
    const [hour, minute] = settings.firstPeriodStart.split(':').map(Number);
    const start = hour * 60 + minute + (period - 1) * settings.periodMinutes + (period > settings.breakAfterPeriod ? settings.breakMinutes : 0);
    const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    return `${clock(start)} - ${clock(start + settings.periodMinutes)}`;
  };

  const fetchData = async () => {
    if (!school) return;
    try {
      const [clsList, subList, tchList, schedule, schoolSettings, unavailable] = await Promise.all([
        ApiClient.getClasses(),
        ApiClient.getSubjects(school.id),
        ApiClient.getTeachers(school.id),
        ApiClient.getTimetable(),
        ApiClient.getTimetableSettings(),
        ApiClient.getTeacherUnavailability()
      ]);
      setClasses(clsList);
      setSubjects(subList);
      setTeachers(tchList);
      setTimetable(schedule);
      setSettings({ firstPeriodStart: schoolSettings.firstPeriodStart, periodMinutes: schoolSettings.periodMinutes, breakAfterPeriod: schoolSettings.breakAfterPeriod, breakMinutes: schoolSettings.breakMinutes });
      setUnavailableSlots(unavailable);
      if (clsList.length > 0 && !selectedClassId) {
        setSelectedClassId(clsList[0].id);
        setRoomNumber(clsList[0].roomNumber);
      }
      if (subList.length > 0) setSubjectId(subList[0].id);
      if (tchList.length > 0) setTeacherId(tchList[0].id);

      if (tchList.length && !selectedTeacherId) setSelectedTeacherId(tchList[0].id);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [school]);

  // Clash detector
  const checkClash = (day: string, period: number, tchId: string, room: string) => {
    const teacherClash = timetable.find(s => 
      s.dayOfWeek === day && s.periodNumber === period && s.teacherId === tchId && !(s.classId === selectedClassId && s.dayOfWeek === day && s.periodNumber === period)
    );
    if (teacherClash) {
      const tch = teachers.find(t => t.id === tchId);
      return `Teacher Clash: ${tch?.fullName || 'Teacher'} is already teaching another class during ${day} Period ${period}!`;
    }

    const roomClash = timetable.find(s => 
      s.dayOfWeek === day && s.periodNumber === period && s.roomNumber.toLowerCase() === room.toLowerCase() && !(s.classId === selectedClassId && s.dayOfWeek === day && s.periodNumber === period)
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

  const handleGenerate = async () => {
    if (!selectedClassId) return;
    try {
      const result = await ApiClient.generateTimetable(selectedClassId);
      setTimetable(prev => [...prev.filter(slot => slot.classId !== selectedClassId), ...result.slots]);
      setUnfilledSlots(result.unfilled);
      setNotice(result.unfilled.length ? `Timetable generated with ${result.unfilled.length} unfilled subject periods.` : 'Timetable generated successfully.');
    } catch (err: any) { setNotice(err.message || 'Unable to generate timetable.'); }
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

  const handleSwapSlot = async (slot: TimetableSlot) => {
    if (!swapMode) return;
    if (!firstSwapSlot) { setFirstSwapSlot(slot.id); setNotice(t('timetable_swap_select')); return; }
    try {
      await ApiClient.swapTimetableSlots(firstSwapSlot, slot.id);
      setTimetable(await ApiClient.getTimetable());
      setNotice(t('timetable_swapped'));
      setFirstSwapSlot(null); setSwapMode(false);
    } catch (err: any) { setNotice(err.message || 'Unable to swap these timetable periods.'); setFirstSwapSlot(null); }
  };

  const handleAvailability = async (day: string, period: number, unavailable: boolean) => {
    if (!selectedTeacherId) return;
    try {
      await ApiClient.setTeacherUnavailability({ teacherId: selectedTeacherId, dayOfWeek: day, periodNumber: period, unavailable });
      setUnavailableSlots(prev => unavailable
        ? [...prev.filter(item => !(item.teacherId === selectedTeacherId && item.dayOfWeek === day && item.periodNumber === period)), { id: '', teacherId: selectedTeacherId, dayOfWeek: day, periodNumber: period }]
        : prev.filter(item => !(item.teacherId === selectedTeacherId && item.dayOfWeek === day && item.periodNumber === period)));
    } catch (err: any) { setNotice(err.message || 'Unable to update teacher availability.'); }
  };

  const selectedClass = classes.find(c => c.id === selectedClassId);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Timetable
          </h1>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <select value={viewMode} onChange={e => setViewMode(e.target.value as any)} className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-xs bg-white">
            <option value="class">{t('timetable_view_class')}</option>
            <option value="teacher">{t('timetable_view_teacher')}</option>
            <option value="day">{t('timetable_view_day')}</option>
          </select>
          <select
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-xs bg-white text-[#334155] font-medium"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.roomNumber})</option>
            ))}
          </select>
          {viewMode === 'teacher' && <select value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)} className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-xs bg-white">{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}</select>}
          {viewMode === 'day' && <select value={selectedDay} onChange={e => setSelectedDay(e.target.value)} className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-xs bg-white">{days.map(day => <option key={day} value={day}>{day}</option>)}</select>}
          <button onClick={handleGenerate} disabled={isReadOnly || !selectedClassId} className="px-3 py-1.5 rounded-lg bg-[#0F766E] text-white text-xs disabled:opacity-50">{t('timetable_generate')}</button>
          <button onClick={() => { setSwapMode(value => !value); setFirstSwapSlot(null); }} disabled={isReadOnly} className={`px-3 py-1.5 rounded-lg border text-xs ${swapMode ? 'bg-amber-100 border-amber-300' : 'border-[#CBD5E1]'}`}>{t('timetable_swap')}</button>
          <button onClick={() => window.print()} className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-xs">{t('timetable_print')}</button>

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
      {unfilledSlots.length > 0 && <section className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900"><h2 className="font-bold mb-2">{t('timetable_unfilled')}</h2><ul className="list-disc pl-5">{unfilledSlots.map((item, index) => <li key={`${item.subjectId}-${item.occurrence}-${index}`}>{subjects.find(subject => subject.id === item.subjectId)?.name || item.subjectId} · occurrence {item.occurrence}{item.teacherId ? '' : ' · no teacher assigned'}</li>)}</ul></section>}

      <section className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-3">
        <h2 className="text-sm font-bold text-[#132A29]">{t('timetable_times')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end text-xs">
          <label className="space-y-1"><span>{t('timetable_start_time')}</span><input type="time" value={settings.firstPeriodStart} onChange={e => setSettings(prev => ({ ...prev, firstPeriodStart: e.target.value }))} className="w-full border border-[#DCE7E4] rounded-lg px-3 py-2 text-xs text-[#102522] focus:outline-none focus:ring-2 focus:ring-[#0E8078]/20 focus:border-[#0E8078]" /></label>
          <label className="space-y-1"><span>{t('timetable_period_minutes')}</span><input type="number" min="20" max="120" value={settings.periodMinutes} onChange={e => setSettings(prev => ({ ...prev, periodMinutes: Number(e.target.value) }))} className="w-full border rounded px-2 py-1.5" /></label>
          <label className="space-y-1"><span>{t('timetable_break_after')}</span><select value={settings.breakAfterPeriod} onChange={e => setSettings(prev => ({ ...prev, breakAfterPeriod: Number(e.target.value) }))} className="w-full border rounded px-2 py-1.5">{[1,2,3,4,5].map(period => <option key={period} value={period}>{period}</option>)}</select></label>
          <label className="space-y-1"><span>{t('timetable_break_minutes')}</span><input type="number" min="0" max="120" value={settings.breakMinutes} onChange={e => setSettings(prev => ({ ...prev, breakMinutes: Number(e.target.value) }))} className="w-full border rounded px-2 py-1.5" /></label>
          <button onClick={handleSaveSettings} disabled={isReadOnly} className="px-3 py-2 rounded-lg bg-slate-100 text-xs disabled:opacity-50">{t('timetable_save_times')}</button>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-3">
        <h2 className="text-sm font-bold text-[#132A29]">{t('timetable_unavailability')}</h2>
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <select value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)} className="border border-[#DCE7E4] rounded-lg px-3 py-2 text-xs text-[#102522] bg-white focus:outline-none focus:ring-2 focus:ring-[#0E8078]/20 focus:border-[#0E8078]">{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}</select>
          {days.map(day => periods.filter(period => day !== 'Friday' || period <= 5).map(period => {
            const unavailable = unavailableSlots.some(item => item.teacherId === selectedTeacherId && item.dayOfWeek === day && item.periodNumber === period);
            return <label key={`${day}-${period}`} className="inline-flex items-center gap-1 rounded border px-2 py-1"><input type="checkbox" checked={unavailable} disabled={isReadOnly} onChange={e => handleAvailability(day, period, e.target.checked)} />{day.slice(0, 3)} P{period}</label>;
          }))}
        </div>
      </section>

      {/* Grid Timetable Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs border-collapse">
            <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
              <tr>
                <th className="px-3 py-3 border-r border-[#E2E8F0] w-28">Day / Period</th>
                {periods.map(p => (
                  <th key={p} className="px-3 py-3 border-r border-[#E2E8F0] text-center min-w-[130px]">
                    Period {p}
                    <span className="block text-[10px] font-mono text-[#64748B]">
                  {periodTime(p)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {(viewMode === 'day' ? days.filter(day => day === selectedDay) : days).map(day => (
                <tr key={day} className="hover:bg-[#F8FAFC]/50">
                  <td className="px-3 py-3 font-semibold text-[#132A29] border-r border-[#E2E8F0] bg-[#FAFAFA]">
                    {day}
                  </td>
                  {periods.map(p => {
                    const slot = timetable.find(s => (viewMode === 'teacher' ? s.teacherId === selectedTeacherId : s.classId === selectedClassId) && s.dayOfWeek === day && s.periodNumber === p);
                    if (day === 'Friday' && p === 6) return <td key={p} className="p-2 border-r border-[#E2E8F0] text-center text-[10px] text-slate-400">—</td>;
                    const sub = subjects.find(s => s.id === slot?.subjectId);
                    const tch = teachers.find(t => t.id === slot?.teacherId);

                    return (
                      <td key={p} className="p-2 border-r border-[#E2E8F0] align-top">
                        {slot ? (
                          <div onClick={() => swapMode ? handleSwapSlot(slot) : (setSelectedClassId(slot.classId), setDayOfWeek(day), setPeriodNumber(p), setSubjectId(slot.subjectId), setTeacherId(slot.teacherId), setRoomNumber(slot.roomNumber), setShowAddModal(true))} className={`p-2 bg-[#F0FDFA] border rounded-lg space-y-0.5 cursor-pointer ${firstSwapSlot === slot.id ? 'border-amber-500' : 'border-[#CCFBF1]'}`}>
                            <span className="font-bold text-[#0F766E] block truncate">{sub?.name || 'Subject'}</span>
                            <span className="text-[11px] text-[#334155] block truncate">{tch?.fullName || 'Teacher'}</span>
                            <span className="text-[10px] font-mono text-[#64748B] block">{viewMode === 'teacher' ? classes.find(klass => klass.id === slot.classId)?.name : slot.roomNumber}</span>
                            {!isReadOnly && <button type="button" onClick={event => { event.stopPropagation(); handleRemovePeriod(slot); }} className="text-rose-700 underline text-[10px]">{t('timetable_remove_period')}</button>}
                          </div>
                        ) : (
                          <div className="h-14 border border-dashed border-[#E2E8F0] rounded flex items-center justify-center text-[10px] text-[#94A3B8]">
                            Free
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
                  <label className="block font-medium text-[#334155]">Day of Week</label>
                  <select
                    value={dayOfWeek}
                    onChange={e => setDayOfWeek(e.target.value as any)}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                  >
                    {days.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#334155]">Period Number (1-7)</label>
                  <select
                    value={periodNumber}
                    onChange={e => setPeriodNumber(parseInt(e.target.value, 10))}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                  >
                    {periods.filter(p => dayOfWeek !== 'Friday' || p <= 5).map(p => <option key={p} value={p}>Period {p}</option>)}
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
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#334155]">Teacher</label>
                <select
                  value={teacherId}
                  onChange={e => setTeacherId(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                >
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.fullName} ({t.department})</option>)}
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
