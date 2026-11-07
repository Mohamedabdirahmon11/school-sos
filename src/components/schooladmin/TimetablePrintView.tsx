import React from 'react';
import { SchoolClass, Subject, Teacher, TimetableSlot } from '../../types/index.ts';
import { getTimetablePeriodTimes } from '../../lib/timetable.ts';

type PrintMode = 'class' | 'shift' | 'teacher' | 'allTeachers';

interface Props {
  mode: PrintMode;
  shift: 1 | 2;
  selectedClassId: string;
  selectedTeacherId: string;
  onModeChange: (mode: PrintMode) => void;
  onShiftChange: (shift: 1 | 2) => void;
  onClassChange: (classId: string) => void;
  onTeacherChange: (teacherId: string) => void;
  selectedClass?: SchoolClass;
  selectedTeacher?: Teacher;
  classes: SchoolClass[];
  teachers: Teacher[];
  subjects: Subject[];
  timetable: TimetableSlot[];
  settings: {
    firstPeriodStart: string; periodMinutes: number; breakAfterPeriod: number; breakMinutes: number;
    shift2FirstPeriodStart: string; shift2PeriodMinutes: number; shift2BreakAfterPeriod: number; shift2BreakMinutes: number;
  };
  school: any;
  t: (key: string) => string;
  onClose: () => void;
  onPrint: () => void;
}

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
const periods = [1, 2, 3, 4, 5, 6] as const;

export const TimetablePrintView: React.FC<Props> = ({
  mode, shift, selectedClass, selectedTeacher, selectedClassId, selectedTeacherId, onModeChange, onShiftChange, onClassChange, onTeacherChange, classes, teachers, subjects, timetable, settings, school, t, onClose, onPrint
}) => {
  const shiftClasses = classes.filter(klass => (klass.shift || 1) === shift);
  const subjectName = (id: string) => subjects.find(subject => subject.id === id)?.name || id;
  const teacherName = (id: string) => teachers.find(teacher => teacher.id === id)?.fullName || id;
  const className = (id: string) => classes.find(klass => klass.id === id)?.name || id;
  const slotAt = (classId: string, day: string, period: number) =>
    timetable.find(slot => slot.classId === classId && slot.dayOfWeek === day && slot.periodNumber === period);
  const teacherSlotsAt = (teacherId: string, day: string, period: number) =>
    timetable.filter(slot => slot.teacherId === teacherId && slot.dayOfWeek === day && slot.periodNumber === period);
  const sheetShift = mode === 'class' ? Number(selectedClass?.shift || 1) as 1 | 2 : shift;
  const timeLabel = (period: number, classShift: number) => {
    const value = getTimetablePeriodTimes(settings, period, classShift);
    return `${value.startTime}–${value.endTime}`;
  };
  const heading = mode === 'class'
    ? selectedClass?.name || t('timetable_print_class')
    : mode === 'shift'
      ? t(shift === 1 ? 'timetable_shift_1' : 'timetable_shift_2')
      : mode === 'teacher'
        ? selectedTeacher?.fullName || t('timetable_print_teacher')
        : t('timetable_print_all_teachers');
  const rowClass = 'border border-slate-400 px-2 py-1.5 align-top';
  const periodHeader = (classShift?: number) => periods.map(period => (
    <th key={period} className={rowClass + ' text-center'}>
      <div>{t('timetable_period')} {period}</div>
      {classShift && <div className="font-normal text-[9px]">{timeLabel(period, classShift)}</div>}
    </th>
  ));
  const renderSlot = (slot?: TimetableSlot, showTeacher = true, showClass = false) => {
    if (!slot) return <span className="text-slate-300">—</span>;
    return <div className="space-y-0.5">
      <div className="font-bold">{subjectName(slot.subjectId)}</div>
      {showTeacher && <div>{teacherName(slot.teacherId)}</div>}
      {showClass && <div>{className(slot.classId)} · Shift {classes.find(klass => klass.id === slot.classId)?.shift || 1}</div>}
      <div className="text-[9px] font-mono">{slot.startTime}–{slot.endTime}</div>
      {slot.roomNumber && <div className="text-[9px]">{slot.roomNumber}</div>}
    </div>;
  };

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-900/60 p-3 md:p-6">
      <style>{`
        @page { size: A3 landscape; margin: 8mm; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          #timetable-print-root, #timetable-print-root * { visibility: visible !important; }
          #timetable-print-root { position: absolute !important; inset: 0 !important; width: 100% !important; background: #fff !important; padding: 0 !important; overflow: visible !important; }
          #timetable-print-root .no-print { display: none !important; }
          #timetable-print-sheet { box-shadow: none !important; border: 0 !important; margin: 0 !important; max-width: none !important; padding: 0 !important; }
          #timetable-print-sheet table { width: 100% !important; border-collapse: collapse !important; font-size: 8pt !important; }
          #timetable-print-sheet th, #timetable-print-sheet td { border: 1px solid #475569 !important; padding: 4px !important; }
          #timetable-print-sheet tr { break-inside: avoid; page-break-inside: avoid; }
          #timetable-print-sheet .print-day { width: 75px; }
        }
      `}</style>
      <div id="timetable-print-root" className="mx-auto max-w-[1400px]">
        <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 shadow">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">{t('timetable_print_sheet')}</p>
            <select aria-label="Print mode" value={mode} onChange={e => onModeChange(e.target.value as PrintMode)} className="rounded-lg border px-2 py-2 text-xs">
              <option value="class">{t('timetable_print_class')}</option>
              <option value="shift">{t('timetable_print_shift')}</option>
              <option value="teacher">{t('timetable_print_teacher')}</option>
              <option value="allTeachers">{t('timetable_print_all_teachers')}</option>
            </select>
            {mode === 'shift' && <select aria-label={t('timetable_shift')} value={shift} onChange={e => onShiftChange(Number(e.target.value) as 1 | 2)} className="rounded-lg border px-2 py-2 text-xs"><option value={1}>{t('timetable_shift_1')}</option><option value={2}>{t('timetable_shift_2')}</option></select>}
            {mode === 'class' && <select aria-label={t('timetable_class_label')} value={selectedClassId} onChange={e => onClassChange(e.target.value)} className="rounded-lg border px-2 py-2 text-xs">{classes.map(klass => <option key={klass.id} value={klass.id}>{klass.name}</option>)}</select>}
            {mode === 'teacher' && <select aria-label={t('timetable_teacher_label')} value={selectedTeacherId} onChange={e => onTeacherChange(e.target.value)} className="rounded-lg border px-2 py-2 text-xs">{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}</select>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-3 py-2 text-xs">{t('timetable_print_close')}</button>
            <button type="button" onClick={onPrint} className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white">{t('timetable_print_sheet')}</button>
          </div>
        </div>

        <section id="timetable-print-sheet" className="mx-auto max-w-[1400px] rounded-lg bg-white p-5 shadow-xl text-slate-900">
          <header className="mb-4 border-b-2 border-slate-800 pb-3 text-center">
            <h1 className="text-xl font-bold uppercase">{school?.name || 'School'}</h1>
            <p className="mt-1 text-sm font-semibold">{heading}</p>
            <div className="mt-1 flex justify-center gap-5 text-[10px]">
              <span>{t('timetable_academic_year')}: {school?.academicYear || '—'}</span>
              {(mode === 'class' || mode === 'shift') && <span>{t('timetable_shift')}: {sheetShift}</span>}
              {mode === 'class' && selectedClass?.roomNumber && <span>{selectedClass.roomNumber}</span>}
            </div>
          </header>

          {(mode === 'class' || mode === 'shift') && (
            <table className="w-full table-fixed border-collapse text-[10px]">
              <thead><tr>
                <th className={rowClass + ' print-day'}>{mode === 'shift' ? t('timetable_class_label') + ' / ' + t('timetable_day') : t('timetable_day')}</th>
                {periodHeader(sheetShift)}
              </tr></thead>
              <tbody>
                {(mode === 'class' && selectedClass ? [selectedClass] : shiftClasses).map(klass =>
                  days.map(day => (
                    <tr key={`${klass.id}-${day}`}>
                      <th className={rowClass + ' text-left'}>
                        {mode === 'shift' && <div className="font-bold">{klass.name}</div>}
                        <div>{day}</div>
                      </th>
                      {periods.map(period => (
                        <td key={period} className={rowClass}>
                          {day === 'Friday' && period === 6 ? '—' : renderSlot(slotAt(klass.id, day, period))}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {mode === 'teacher' && (
            <table className="w-full table-fixed border-collapse text-[10px]">
              <thead><tr><th className={rowClass + ' print-day'}>{t('timetable_day')}</th>{periodHeader()}</tr></thead>
              <tbody>{days.map(day => <tr key={day}><th className={rowClass + ' text-left'}>{day}</th>{periods.map(period => {
                const slots = selectedTeacher ? teacherSlotsAt(selectedTeacher.id, day, period) : [];
                return <td key={period} className={rowClass}>{day === 'Friday' && period === 6 ? '—' : slots.map(slot => <div key={slot.id} className="mb-1 border-b border-dashed border-slate-300 pb-1 last:border-0">{renderSlot(slot, false, true)}</div>)}</td>;
              })}</tr>)}</tbody>
            </table>
          )}

          {mode === 'allTeachers' && (
            <table className="w-full table-fixed border-collapse text-[9px]">
              <thead><tr><th className={rowClass + ' print-day'}>{t('timetable_teacher_label')} / {t('timetable_day')}</th>{periodHeader()}</tr></thead>
              <tbody>{teachers.flatMap(teacher => days.map(day => <tr key={`${teacher.id}-${day}`}>
                <th className={rowClass + ' text-left'}><div className="font-bold">{teacher.fullName}</div><div>{day}</div></th>
                {periods.map(period => {
                  const slots = teacherSlotsAt(teacher.id, day, period);
                  return <td key={period} className={rowClass}>{day === 'Friday' && period === 6 ? '—' : slots.map(slot => <div key={slot.id} className="mb-1 border-b border-dashed border-slate-300 pb-1 last:border-0">{renderSlot(slot, false, true)}</div>)}</td>;
                })}
              </tr>))}</tbody>
            </table>
          )}
          <footer className="mt-3 flex justify-between border-t pt-2 text-[9px] text-slate-600">
            <span>{school?.name || 'SchoolOS'}</span>
            <span>{t('timetable_academic_year')}: {school?.academicYear || '—'}</span>
          </footer>
        </section>
      </div>
    </div>
  );
};
