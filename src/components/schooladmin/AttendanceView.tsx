/**
 * Daily Attendance Register for School Admin & Teachers
 * Taken ONCE PER DAY per class per student.
 * Status: Present / Absent / Late / Excused with optional note.
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { normalizeWhatsAppNumber } from '../../lib/whatsapp.ts';
import { getEthiopianCalendarInfo, getSchoolLocalDate } from '../../lib/ethiopian-calendar.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { PaginationControls, PageInfo } from '../common/PaginationControls.tsx';
import { SchoolClass, AttendanceStatus, Student } from '../../types/index.ts';
import { 
  CalendarCheck, 
  Check, 
  UserCheck, 
  Clock, 
  AlertCircle, 
  Save, 
  CheckCircle2, 
  Send,
  MessageCircle,
  Search,
  Filter
} from 'lucide-react';

const parentWhatsAppNumber = (student: Student) =>
  normalizeWhatsAppNumber(student.fatherPhone) || normalizeWhatsAppNumber(student.motherPhone);

export const AttendanceView: React.FC = () => {
  const { school, user, isReadOnly, t } = useAuth();
  const isSchoolAdmin = user?.role === 'school_admin' || user?.role === 'super_admin';
  const adminWhatsAppNumber = normalizeWhatsAppNumber(school?.whatsappPhone);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [date, setDate] = useState(() => getSchoolLocalDate(school?.timezone));
  const ethiopianCalendar = getEthiopianCalendarInfo(date, school?.timezone || 'Africa/Addis_Ababa');
  const [students, setStudents] = useState<Student[]>([]);
  const [pageStudents, setPageStudents] = useState<Student[]>([]);
  const [serverPageInfo, setServerPageInfo] = useState<PageInfo | null>(null);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { status: AttendanceStatus | 'unrecorded'; note: string }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [schoolAbsences, setSchoolAbsences] = useState<Array<{ id: string; student: Student; className: string; note?: string }>>([]);
  const [absencesLoading, setAbsencesLoading] = useState(false);

  const loadClasses = async () => {
    if (!school) return;
    setLoadError(null);
    setIsLoading(true);
    try {
      const cls = await ApiClient.getClasses();
      setClasses(cls);
      if (cls.length > 0) setSelectedClassId(current => current && cls.some(item => item.id === current) ? current : cls[0].id);
    } catch (err: any) {
      setLoadError(err?.message || 'Unable to load school classes.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadClasses();
  }, [school]);

  const loadSchoolAbsences = async () => {
    if (!school || !isSchoolAdmin) return;
    setAbsencesLoading(true);
    setLoadError(null);
    try {
      const records = await ApiClient.getSchoolDailyAbsences(date);
      setSchoolAbsences(records);
    } catch (error: any) {
      setLoadError(error?.message || 'Unable to load school-wide absences.');
    } finally {
      setAbsencesLoading(false);
    }
  };

  useEffect(() => {
    if (isSchoolAdmin) void loadSchoolAbsences();
  }, [school?.id, date, isSchoolAdmin]);

  const loadAttendanceSheet = async () => {
    if (!school || !selectedClassId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const [firstPage, existingRecords] = await Promise.all([
        ApiClient.getStudents(selectedClassId, undefined, 1, 20),
        ApiClient.getDailyAttendance(selectedClassId, date)
      ]);
      const firstPageInfo = ((firstPage as any).pagination || {
        page: 1, pageSize: 20, total: firstPage.length, totalPages: firstPage.length ? 1 : 0
      }) as PageInfo;
      const allStudents = [...firstPage];
      for (let pageNumber = 2; pageNumber <= firstPageInfo.totalPages; pageNumber += 1) {
        const nextPage = await ApiClient.getStudents(selectedClassId, undefined, pageNumber, 20);
        allStudents.push(...nextPage);
      }
      setStudents(allStudents);
      setPageStudents(firstPage);
      setServerPageInfo(firstPageInfo);

      const map: Record<string, { status: AttendanceStatus | 'unrecorded'; note: string }> = {};
      for (const std of allStudents) {
        const record = existingRecords.find(r => r.studentId === std.id);
        map[std.id] = {
          status: record ? record.status : 'unrecorded',
          note: record?.note || ''
        };
      }
      setAttendanceMap(map);
    } catch (err: any) {
      console.error(err);
      setLoadError(err?.message || 'Unable to load the attendance register.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    loadAttendanceSheet();
  }, [school, selectedClassId, date]);

  const handleAttendancePage = async (nextPage: number) => {
    setPage(nextPage);
    if (searchQuery.trim()) return;
    try {
      const result = await ApiClient.getStudents(selectedClassId, undefined, nextPage, 20);
      setPageStudents(result);
      setServerPageInfo((result as any).pagination);
    } catch (err: any) {
      setNotice(err.message || 'Unable to load this attendance page.');
    }
  };

  const openAbsentStudentWhatsApp = (student: Student) => {
    if (!adminWhatsAppNumber) {
      setNotice('Marka hore School Settings geli lambarka WhatsApp-ka maamulka (+country code), kuna gal WhatsApp lambarkaas.');
      return;
    }
    const whatsappNumber = parentWhatsAppNumber(student);
    if (!whatsappNumber) {
      setNotice('Waalidka lambarkiisa u qor qaabka caalamiga ah, tusaale +2519XXXXXXXX, kadib WhatsApp fur.');
      return;
    }
    const studentName = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ');
    const className = classes.find(item => item.id === (student.classId || selectedClassId))?.name || '';
    const message = [
      'Asc,',
      `Waxaan ku wargelinaynaa in ardayga ${studentName} (${student.studentId}) uu maanta, ${date}, dugsiga ka maqnaa.`,
      className ? `Fasalka: ${className}.` : '',
      'Fadlan nala soo xiriir si aan u xaqiijino xaaladdiisa. Mahadsanid.',
      school?.name || '',
      adminWhatsAppNumber ? `WhatsApp-ka maamulka: +${adminWhatsAppNumber}` : ''
    ].filter(Boolean).join('\n');
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Stats calculation
  const totalCount = students.length;
  const presentCount = Object.values(attendanceMap).filter(v => v.status === 'present').length;
  const absentCount = Object.values(attendanceMap).filter(v => v.status === 'absent').length;
  const lateCount = Object.values(attendanceMap).filter(v => v.status === 'late').length;
  const excusedCount = Object.values(attendanceMap).filter(v => v.status === 'excused').length;

  const filteredStudents = students.filter(s => 
    `${s.firstName} ${s.middleName} ${s.lastName} ${s.studentId}`.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const localAttendancePageInfo: PageInfo = { page, pageSize: 20, total: filteredStudents.length, totalPages: Math.ceil(filteredStudents.length / 20) };
  const attendancePageInfo = searchQuery.trim() ? localAttendancePageInfo : serverPageInfo;
  const visibleStudents = searchQuery.trim() ? filteredStudents.slice((page - 1) * 20, page * 20) : pageStudents;

  if (isSchoolAdmin) {
    return (
      <div className="mx-auto min-w-0 w-full max-w-[1600px] space-y-6 p-5 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[.16em] text-[#0e8078]">School-wide daily report</p>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-[#102522]"><CalendarCheck className="h-7 w-7 text-[#0e8078]" /> Daily Absences</h1>
            <p className="mt-1 text-sm text-[#71817d]">All classes are included automatically. Only students marked absent by their class teachers appear here.</p>
          </div>
          <div className="flex items-end gap-2">
            <label className="text-xs font-semibold text-[#475569]">Attendance date
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm" />
              <span className="mt-1 block text-[10px] font-normal text-[#64748B]">Ethiopian date: {ethiopianCalendar.dateLabel}</span>
            </label>
            <button type="button" onClick={() => void loadSchoolAbsences()} className="rounded-lg bg-[#0e8078] px-4 py-2 text-sm font-semibold text-white">Refresh</button>
          </div>
        </div>
        {loadError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{loadError}</div>}
        {ethiopianCalendar.holiday && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Ethiopian public holiday: {ethiopianCalendar.holiday}</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="text-xs font-medium text-rose-700">Absent students</p><p className="mt-1 text-2xl font-bold text-rose-800">{schoolAbsences.length}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">Classes covered</p><p className="mt-1 text-2xl font-bold text-slate-800">{new Set(schoolAbsences.map(row => row.student.classId)).size}</p></div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#dce7e4] bg-white">
          {absencesLoading ? <p className="p-8 text-center text-sm text-slate-500">Loading absent students…</p> : schoolAbsences.length === 0 ? (
            <div className="p-10 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><p className="mt-2 font-semibold text-slate-800">No absences recorded</p><p className="mt-1 text-xs text-slate-500">No students have been marked absent for this date.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="border-b bg-[#f6faf8] text-[11px] uppercase tracking-wide text-[#71817d]"><tr><th className="px-4 py-3">Student ID</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Parent phone</th><th className="px-4 py-3">Note</th><th className="px-4 py-3">Action</th></tr></thead>
                <tbody className="divide-y divide-[#edf2f0]">
                  {schoolAbsences.map(row => {
                    const parentPhone = parentWhatsAppNumber(row.student);
                    return <tr key={row.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-mono">{row.student.studentId}</td><td className="px-4 py-3 font-semibold">{row.student.firstName} {row.student.middleName} {row.student.lastName}</td><td className="px-4 py-3">{row.className}</td><td className="px-4 py-3">{row.student.fatherPhone || row.student.motherPhone || 'N/A'}</td><td className="px-4 py-3">{row.note || '—'}</td><td className="px-4 py-3"><button type="button" onClick={() => openAbsentStudentWhatsApp(row.student)} disabled={isReadOnly || !parentPhone || !adminWhatsAppNumber} className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A34A] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-40"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp parent</button></td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1600px] space-y-6 p-5 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[.16em] text-[#0e8078]">Daily operations</p>
          <h1 className="text-3xl font-bold tracking-tight text-[#102522] flex items-center gap-2">
            <CalendarCheck className="h-7 w-7 text-[#0e8078]" />
            {t('attendance')}
          </h1>
          <p className="mt-1 text-sm text-[#71817d]">
            Review class attendance submitted by teachers. For absent students, prepare the parent message, open WhatsApp, and manually press Send in WhatsApp.
          </p>
        </div>

        <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-xs font-medium text-teal-900">
          Class teachers submit attendance. Review absences here and contact parents from the school WhatsApp account.
        </div>
      </div>

      {loadError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center justify-between gap-3"><span>{loadError}</span><button type="button" onClick={() => void (selectedClassId ? loadAttendanceSheet() : loadClasses())} className="shrink-0 rounded-md border border-rose-300 bg-white px-3 py-1.5 font-semibold">Retry</button></div>}
      {notice && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Control Bar: Class, Date */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[#dce7e4] bg-white p-5 sm:grid-cols-2 md:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold text-[#475569] mb-1">Select Class</label>
          <select
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="w-full rounded-xl border border-[#d5e2de] bg-[#f8fbfa] px-3 py-3 text-sm text-[#18312d] outline-none focus:border-[#0e8078] focus:ring-2 focus:ring-[#0e8078]/10"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.section})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#475569] mb-1">Attendance Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          />
          <p className="mt-1 text-[11px] text-[#64748B]">Ethiopian date: {ethiopianCalendar.dateLabel}</p>
          {ethiopianCalendar.holiday && <p className="mt-1 text-[11px] font-semibold text-amber-700">Ethiopian public holiday: {ethiopianCalendar.holiday}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#475569] mb-1">Search Student</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#94A3B8]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Search name or ID..."
              className="w-full rounded-xl border border-[#d5e2de] bg-[#f8fbfa] py-3 pl-9 pr-3 text-sm text-[#18312d] outline-none focus:border-[#0e8078] focus:ring-2 focus:ring-[#0e8078]/10"
            />
          </div>
        </div>
      </div>

      {/* Summary KPI Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-[#dce7e4] bg-white p-4">
          <p className="text-[11px] font-medium text-[#64748B]">Enrolled Students</p>
          <p className="text-xl font-bold text-[#132A29] font-mono mt-0.5">{totalCount}</p>
        </div>
        <div className="rounded-2xl border border-[#cce9df] bg-[#eff8f4] p-4">
          <p className="text-[11px] font-medium text-emerald-700">{t('present')}</p>
          <p className="text-xl font-bold text-emerald-800 font-mono mt-0.5">{presentCount}</p>
        </div>
        <div className="rounded-2xl border border-[#f3d9d7] bg-[#fff5f4] p-4">
          <p className="text-[11px] font-medium text-rose-700">{t('absent')}</p>
          <p className="text-xl font-bold text-rose-800 font-mono mt-0.5">{absentCount}</p>
        </div>
        <div className="rounded-2xl border border-[#f2e4c4] bg-[#fffaf0] p-4">
          <p className="text-[11px] font-medium text-amber-700">{t('late')}</p>
          <p className="text-xl font-bold text-amber-800 font-mono mt-0.5">{lateCount}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-[#dfe5f5] bg-[#f5f7fc] p-4 sm:col-span-1">
          <p className="text-[11px] font-medium text-indigo-700">{t('excused')}</p>
          <p className="text-xl font-bold text-indigo-800 font-mono mt-0.5">{excusedCount}</p>
        </div>
      </div>

      {/* Daily Attendance Student Register Table */}
      <div className="overflow-hidden rounded-2xl border border-[#dce7e4] bg-white shadow-[0_2px_8px_rgba(16,37,34,.025)]">
        {loadError ? (
          <div className="p-8 text-center text-xs text-rose-700">Attendance data could not be loaded. Use Retry above.</div>
        ) : isLoading ? (
          <div className="p-8 text-center text-xs text-[#64748B]">Loading student attendance register...</div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">
            No students found in this class. Add students from the Students view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs text-[#132A29]">
              <thead className="bg-[#f6faf8] border-b border-[#e6efec] text-[11px] uppercase font-semibold tracking-wide text-[#71817d]">
                <tr>
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Parent Phone</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Attendance Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f0]">
                {visibleStudents.map(std => {
                  const state = attendanceMap[std.id] || { status: 'present', note: '' };
                  const validParentWhatsApp = parentWhatsAppNumber(std);
                  return (
                    <tr key={std.id} className="hover:bg-[#F8FAFC]">
                      <td className="py-3 px-4 font-mono font-medium text-[#475569]">{std.studentId}</td>
                      <td className="py-3 px-4 font-semibold text-[#132A29]">
                        {std.firstName} {std.middleName} {std.lastName}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#64748B]">{std.fatherPhone || 'N/A'}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center">
                          <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase ${state.status === 'present' ? 'bg-emerald-100 text-emerald-800' : state.status === 'absent' ? 'bg-rose-100 text-rose-800' : state.status === 'late' ? 'bg-amber-100 text-amber-800' : state.status === 'excused' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'}`}>{state.status}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-[#64748B]">{state.note || '—'}</span>
                      </td>
                      <td className="py-3 px-4">
                        {state.status === 'absent' ? (
                          <button
                            type="button"
                            onClick={() => openAbsentStudentWhatsApp(std)}
                            disabled={isReadOnly || !validParentWhatsApp || !adminWhatsAppNumber}
                            title="Open WhatsApp chat with the parent and prepare the absence message"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A34A] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#15803D] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                          </button>
                        ) : <span className="text-[11px] text-[#94A3B8]">—</span>}
                        {state.status === 'absent' && !adminWhatsAppNumber && (
                          <p className="mt-1 max-w-40 text-[10px] text-amber-700">Marka hore kaydi lambarka WhatsApp-ka maamulka ee School Settings.</p>
                        )}
                        {state.status === 'absent' && !validParentWhatsApp && (
                          <p className="mt-1 max-w-40 text-[10px] text-amber-700">Ku qor waalidka lambarka +country code.</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <PaginationControls info={attendancePageInfo} onPage={handleAttendancePage} />
          </div>
        )}
      </div>
    </div>
  );
};
