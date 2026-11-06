/**
 * Daily Attendance Register for School Admin & Teachers
 * Taken ONCE PER DAY per class per student.
 * Status: Present / Absent / Late / Excused with optional note.
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { normalizeWhatsAppNumber } from '../../lib/whatsapp.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { PaginationControls, PageInfo } from '../common/PaginationControls.tsx';
import { SchoolDateInput } from '../common/SchoolDateInput.tsx';
import { formatSchoolDate } from '../../lib/ethiopian-calendar.ts';
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

const schoolLocalDate = (timeZone?: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'Africa/Addis_Ababa',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};

const parentWhatsAppNumber = (student: Student) =>
  normalizeWhatsAppNumber(student.fatherPhone) || normalizeWhatsAppNumber(student.motherPhone);

const getSchoolLocalDate = (timeZone?: string): string => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'Africa/Addis_Ababa',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

export const AttendanceView: React.FC = () => {
  const { school, isReadOnly, t } = useAuth();
  const adminWhatsAppNumber = normalizeWhatsAppNumber(school?.phone);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [date, setDate] = useState(() => schoolLocalDate(school?.timezone));
  const [students, setStudents] = useState<Student[]>([]);
  const [pageStudents, setPageStudents] = useState<Student[]>([]);
  const [serverPageInfo, setServerPageInfo] = useState<PageInfo | null>(null);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { status: AttendanceStatus; note: string }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!school) return;
    ApiClient.getClasses().then(cls => {
      setClasses(cls);
      if (cls.length > 0) setSelectedClassId(cls[0].id);
    });
  }, [school]);

  const loadAttendanceSheet = async () => {
    if (!school || !selectedClassId) return;
    setIsLoading(true);
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

      const map: Record<string, { status: AttendanceStatus; note: string }> = {};
      for (const std of allStudents) {
        const record = existingRecords.find(r => r.studentId === std.id);
        map[std.id] = {
          status: record ? record.status : 'present',
          note: record?.note || ''
        };
      }
      setAttendanceMap(map);
    } catch (err: any) {
      console.error(err);
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

  const handleMarkAllPresent = () => {
    const updated: Record<string, { status: AttendanceStatus; note: string }> = {};
    for (const std of students) {
      updated[std.id] = {
        status: 'present',
        note: attendanceMap[std.id]?.note || ''
      };
    }
    setAttendanceMap(updated);
    setNotice('All students marked as Present. Click "Save Attendance" to commit.');
  };

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setAttendanceMap(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status
      }
    }));
  };

  const handleNoteChange = (studentId: string, note: string) => {
    setAttendanceMap(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        note
      }
    }));
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
    const className = classes.find(item => item.id === selectedClassId)?.name || '';
    const message = [
      'Asc,',
      `Waxaan ku wargelinaynaa in ardayga ${studentName} (${student.studentId}) uu maanta, ${formatSchoolDate(date, school?.calendarType || (school?.timezone === 'Africa/Addis_Ababa' ? 'ethiopian' : 'gregorian'))}, dugsiga ka maqnaa.`,
      className ? `Fasalka: ${className}.` : '',
      'Fadlan nala soo xiriir si aan u xaqiijino xaaladdiisa. Mahadsanid.',
      school?.name || '',
      adminWhatsAppNumber ? `Xiriirka dugsiga: +${adminWhatsAppNumber}` : ''
    ].filter(Boolean).join('\n');
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSaveAttendance = async () => {
    if (!selectedClassId || isReadOnly) return;
    if (school?.attendanceRules?.requireExcusedReason) {
      const missingReason = students.some(std => attendanceMap[std.id]?.status === 'excused' && !attendanceMap[std.id]?.note.trim());
      if (missingReason) {
        setNotice('Add a reason for every excused student before saving.');
        return;
      }
    }
    setIsSaving(true);
    setNotice(null);

    try {
      const records = students.map(std => ({
        studentId: std.id,
        status: attendanceMap[std.id]?.status || 'present',
        note: attendanceMap[std.id]?.note || ''
      }));

      await ApiClient.recordDailyAttendance(selectedClassId, date, records);
      setNotice('Attendance saved. Ardayda maqneyd, riix badhanka WhatsApp si aad fariin ugu dirto waalid kasta.');
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setNotice(err.message || 'Failed to save attendance.');
    } finally {
      setIsSaving(false);
    }
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
            Take official daily class attendance. After saving, open WhatsApp for each absent student's parent and send the prepared message manually.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleMarkAllPresent}
            disabled={isReadOnly || students.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-[#d5e2de] bg-white px-4 py-3 text-sm font-semibold text-[#18312d] hover:bg-[#f6faf8]"
          >
            <Check className="w-3.5 h-3.5" />
            {t('mark_all_present')}
          </button>
          <button
            type="button"
            onClick={handleSaveAttendance}
            disabled={isSaving || isReadOnly || students.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0e8078] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#0b6f68] disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'Saving...' : 'Save Attendance'}
          </button>
        </div>
      </div>

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
          <SchoolDateInput value={date} onChange={setDate} calendarType={school?.calendarType || (school?.timezone === 'Africa/Addis_Ababa' ? 'ethiopian' : 'gregorian')} className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]" />
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
        {isLoading ? (
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
                  <th className="py-3 px-4">Parent WhatsApp</th>
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
                      <td className="py-3 px-4 font-mono text-[#64748B]">{std.fatherPhone || std.motherPhone || 'N/A'}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStatusChange(std.id, 'present')}
                            disabled={isReadOnly}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                              state.status === 'present'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            P
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(std.id, 'absent')}
                            disabled={isReadOnly}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                              state.status === 'absent'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            A
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(std.id, 'late')}
                            disabled={isReadOnly}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                              state.status === 'late'
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            L
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(std.id, 'excused')}
                            disabled={isReadOnly}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                              state.status === 'excused'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            E
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={state.note}
                          onChange={e => handleNoteChange(std.id, e.target.value)}
                          placeholder="Optional reason or note..."
                          disabled={isReadOnly}
                          className="w-full text-xs px-2.5 py-1 border border-[#CBD5E1] rounded focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                        />
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
