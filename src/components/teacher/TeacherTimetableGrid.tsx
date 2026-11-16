import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import type { TimetableSlot } from '../../types/index.ts';
import { buildTimetableGrid } from '../../lib/teacher-timetable.ts';

interface Props {
  slots: TimetableSlot[];
  isMine: (slot: TimetableSlot) => boolean;
  subjectLabel: (slot: TimetableSlot) => string;
  classLabel: (slot: TimetableSlot) => string;
}

export const TeacherTimetableGrid: React.FC<Props> = ({ slots, isMine, subjectLabel, classLabel }) => {
  const mine = slots.filter(isMine);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const effectiveScope = scope === 'mine' && !mine.length ? 'all' : scope;
  const shown = effectiveScope === 'mine' ? mine : slots;
  const grid = buildTimetableGrid(shown);

  return (
    <div className="space-y-3">
      <style>{`@media print { body * { visibility: hidden !important; } .teacher-timetable-print, .teacher-timetable-print * { visibility: visible !important; } .teacher-timetable-print { position: absolute; left: 0; top: 0; width: 100%; } @page { size: A4 landscape; margin: 8mm; } }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-slate-200 p-0.5 text-xs font-semibold" role="group" aria-label="Timetable scope">
          <button type="button" aria-pressed={effectiveScope === 'mine'} onClick={() => setScope('mine')} className={`rounded-lg px-3 py-1.5 ${effectiveScope === 'mine' ? 'bg-teal-700 text-white' : 'text-slate-600'}`}>Jadwalkayga ({mine.length})</button>
          <button type="button" aria-pressed={effectiveScope === 'all'} onClick={() => setScope('all')} className={`rounded-lg px-3 py-1.5 ${effectiveScope === 'all' ? 'bg-teal-700 text-white' : 'text-slate-600'}`}>Dugsiga oo dhan ({slots.length})</button>
        </div>
        <button type="button" onClick={() => window.print()} disabled={!shown.length} className="inline-flex items-center gap-1.5 rounded-lg border border-teal-700 px-3 py-1.5 text-xs font-semibold text-teal-800 disabled:opacity-40"><Printer className="h-3.5 w-3.5" /> Print</button>
      </div>
      {scope === 'mine' && !mine.length && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Weli casharro adiga kuu qoondaysan lama helin. Waxaa muuqda jadwalka dugsiga oo dhan. School Admin ha ku qoondeeyo macallin maaddo kasta (Class Subjects), kadibna jadwalka dib ha u sameeyo.</p>
      )}
      {!shown.length ? (
        <div className="p-8 text-center text-xs text-[#64748B]">Jadwal weli lama sameynin. La xiriir School Admin.</div>
      ) : (
        <div className="teacher-timetable-print overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr><th className="w-20 border-b border-slate-200 px-3 py-2">Period</th>{grid.days.map(day => <th key={day} className="border-b border-l border-slate-200 px-3 py-2">{day}</th>)}</tr>
            </thead>
            <tbody>
              {grid.periods.map(period => (
                <tr key={period} className="align-top">
                  <th className="border-b border-slate-100 px-3 py-2 font-mono text-[11px] text-slate-600">P{period}</th>
                  {grid.days.map(day => {
                    const cell = grid.cells.get(`${day}:${period}`) || [];
                    return (
                      <td key={day} className="border-b border-l border-slate-100 p-1.5">
                        {cell.map(slot => (
                          <div key={slot.id} className={`mb-1 rounded-lg border p-2 ${isMine(slot) ? 'border-teal-300 bg-teal-50' : 'border-slate-100 bg-white'}`}>
                            <p className="font-semibold text-slate-900">{subjectLabel(slot)}</p>
                            <p className="text-[11px] text-slate-600">{classLabel(slot)}{slot.roomNumber ? ` · ${slot.roomNumber}` : ''}</p>
                            <p className="font-mono text-[10px] text-slate-400">{slot.startTime}–{slot.endTime}</p>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
