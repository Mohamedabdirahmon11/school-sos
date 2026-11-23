/**
 * Parent Portal View
 * Multi-child sibling switcher, attendance percentage, fee balance & official receipts, exam results, and report cards
 */

import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { ExamTimetablePrint, printExamTimetable } from '../common/ExamTimetablePrint.tsx';
import { formatMoney } from '../../lib/money.ts';
import { 
  Users, 
  CalendarCheck, 
  CreditCard, 
  FileSpreadsheet, 
  Printer, 
  BellRing,
  Download
} from 'lucide-react';

export const ParentPortalView: React.FC = () => {
  const { user, school, t, selectedStudentId, refreshUser } = useAuth();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(selectedStudentId);
  const [childSelectionError, setChildSelectionError] = useState('');
  const [reportCardDownloading, setReportCardDownloading] = useState(false);
  const [reportCardDownloadError, setReportCardDownloadError] = useState('');
  const childrenState = useApi(async () => {
    const all = await ApiClient.getAllStudents();
    // The API scopes this list to the authenticated parent's linked children.
    return Array.isArray(all) ? all : [];
  }, [school?.id, user?.id, user?.phone, user?.parentPhone, user?.linkedStudentIds?.join(',')], Boolean(school));
  const children: any[] = childrenState.data ?? [];
  const currentChild = children.find(child => child.id === selectedChildId);
  const childState = useApi(
    () => ApiClient.getStudentDetails(currentChild?.id, school?.id, true),
    [currentChild?.id, school?.id],
    Boolean(currentChild)
  );
  const termReportCardsState = useApi(
    () => currentChild ? ApiClient.request<any[]>(`/term-marks/report-cards?studentId=${encodeURIComponent(currentChild.id)}`) : Promise.resolve([]),
    [currentChild?.id, school?.id], Boolean(currentChild)
  );
  const termReportCards: any[] = Array.isArray(termReportCardsState.data) ? termReportCardsState.data : [];
  const timetableState = useApi(
    () => ApiClient.getTimetable({ classId: currentChild?.classId }),
    [currentChild?.id, currentChild?.classId, school?.id],
    Boolean(currentChild)
  );
  const noticesState = useApi(() => ApiClient.getNotices(), [school?.id, user?.id], Boolean(school && user));
  const timetable = Array.isArray(timetableState.data) ? timetableState.data : [];
  const examSchedulesState = useApi(() => currentChild?.classId ? ApiClient.getPublishedExamSchedules(currentChild.classId) : Promise.resolve([]), [currentChild?.id, currentChild?.classId, school?.id], Boolean(currentChild));
  const publishedExamSchedules = Array.isArray(examSchedulesState.data) ? examSchedulesState.data : [];
  const childData = childState.data;
  const resultNotices = (Array.isArray(noticesState.data) ? noticesState.data : [])
    .filter((notice: any) => notice.classId === currentChild?.classId && String(notice.title || '').toLowerCase().includes('exam results published'))
    .slice(0, 3);

  useEffect(() => {
    setSelectedChildId(selectedStudentId);
  }, [selectedStudentId]);

  useEffect(() => {
    if (children.length === 1 && !selectedStudentId && !selectedChildId) {
      void ApiClient.selectParentChild(children[0].id)
        .then(() => { setSelectedChildId(children[0].id); void refreshUser(); })
        .catch(error => setChildSelectionError(error instanceof Error ? error.message : 'Could not select your child.'));
    }
  }, [children.length, children[0]?.id, selectedStudentId, selectedChildId, refreshUser]);

  const handleSelectChild = async (idx: number) => {
    const child = children[idx];
    if (!child) return;
    setChildSelectionError('');
    try {
      await ApiClient.selectParentChild(child.id);
      setSelectedChildId(child.id);
      setReportCardDownloadError('');
      await refreshUser();
    } catch (error) {
      setChildSelectionError(error instanceof Error ? error.message : 'Could not select this child.');
    }
  };

  const handleChangeChild = async () => {
    setChildSelectionError('');
    try {
      await ApiClient.selectParentChild();
      setSelectedChildId(null);
      await refreshUser();
    } catch (error) {
      setChildSelectionError(error instanceof Error ? error.message : 'Could not change the selected child.');
    }
  };

  const handleDownloadTermReportCard = async () => {
    if (!currentChild || reportCardDownloading) return;
    setReportCardDownloading(true); setReportCardDownloadError('');
    try { await ApiClient.downloadTermReportCardPdf(currentChild.id); }
    catch (error) { setReportCardDownloadError(error instanceof Error ? error.message : 'Report Card-ka sannadlaha lama heli karo weli.'); }
    finally { setReportCardDownloading(false); }
  };

  const handleDownloadAnnualReportCard = async () => {
    if (!currentChild || reportCardDownloading) return;
    setReportCardDownloading(true);
    setReportCardDownloadError('');
    try {
      await ApiClient.downloadReportCardPdf(currentChild.id);
    } catch (error) {
      setReportCardDownloadError(error instanceof Error ? error.message : 'Annual report card is not available yet.');
    } finally {
      setReportCardDownloading(false);
    }
  };

  if (childrenState.loading) return <div className="p-6 space-y-3" aria-label="Loading parent portal"><div className="h-8 w-1/3 animate-pulse rounded bg-slate-200" /><div className="h-32 animate-pulse rounded-xl bg-white" /></div>;
  if (childrenState.error) return <ErrorState error={childrenState.error} onRetry={childrenState.retry} />;
  if (children.length === 0) return <div className="mx-auto max-w-xl p-8 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Users className="h-6 w-6" /></div><h2 className="text-base font-semibold text-[#132A29]">Weli ilmo laguma xirin</h2><p className="mt-2 text-xs text-[#64748B]">La xidhiidh maamulka dugsiga si akoonkaaga loogu xiro ilmahaaga.</p></div>;
  if (!currentChild) return (
    <div className="mx-auto max-w-3xl p-4 md:p-8 space-y-5">
      <div><span className="text-[11px] font-bold uppercase tracking-wide text-[#0F766E]">Parent Portal</span><h1 className="mt-1 text-2xl font-semibold text-[#132A29]">Dooro ilmaha</h1><p className="mt-1 text-xs text-[#64748B]">Dooro ilmaha aad rabto inaad xogtiisa aragto.</p></div>
      {childSelectionError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{childSelectionError}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {children.map((child, index) => (
          <button key={child.id} type="button" onClick={() => void handleSelectChild(index)} className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 text-left shadow-xs transition hover:border-[#0F766E] hover:bg-[#F0FDFA]">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0F766E] text-sm font-bold text-white">{String(child.firstName || '?').slice(0,1).toUpperCase()}</span>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#132A29]">{child.firstName} {child.lastName}</span><span className="mt-1 block text-xs text-[#64748B]">{child.className || 'Fasalka lama cayimin'} · {child.studentId}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
  if (childState.loading) return <div className="p-6 space-y-3" aria-label="Loading child details"><div className="h-8 w-1/3 animate-pulse rounded bg-slate-200" /><div className="h-48 animate-pulse rounded-xl bg-white" /></div>;
  if (childState.error) return <ErrorState error={childState.error} onRetry={childState.retry} />;
  const attendanceRecords = childData?.attendance || [];
  const presentCount = attendanceRecords.filter((record: any) => record.status === 'present' || record.status === 'late').length;
  const attendancePercentage = attendanceRecords.length ? Math.round((presentCount / attendanceRecords.length) * 100) : 0;
  const payments = childData?.payments || [];
  const balance = payments.reduce((sum: number, payment: any) => sum + (payment.remainingAmount || 0), 0);
  const publishedMarks: any[] = Array.isArray(childData?.marks) ? childData.marks : [];
  const hasBothPublishedSemesters = publishedMarks.some(first => first.semester === 'Semester 1' && publishedMarks.some(second => second.semester === 'Semester 2' && second.academicYear === first.academicYear));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Sibling Switcher Header */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-mono text-[#0F766E] uppercase font-bold">Parent Guardian Portal</span>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Welcome, {user?.fullName}
          </h1>
          <p className="text-xs text-[#64748B]">
            Viewing enrolled child details for <strong className="text-[#132A29]">{school?.name}</strong>
          </p>
        </div>

        {children.length > 1 && <button type="button" onClick={() => void handleChangeChild()} className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-semibold text-[#334155] hover:border-[#0F766E]">Beddel ilmaha</button>}
      </div>

      {resultNotices.length > 0 && (
        <section aria-label="Published exam results notifications" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
          <div className="flex items-center gap-2 font-bold"><BellRing className="h-4 w-4" /> New exam results are available</div>
          {resultNotices.map((notice: any) => <div key={notice.id} className="mt-2 border-t border-emerald-100 pt-2"><p className="font-semibold">{notice.title}</p><p className="mt-1 text-emerald-800">{notice.content}</p><p className="mt-1 text-[10px] text-emerald-700">{notice.publishDate}</p></div>)}
        </section>
      )}

      {/* Child Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="p-4 bg-white rounded-xl border border-[#E2E8F0]">
          <span className="text-[#64748B]">Enrolled Class</span>
          <p className="text-lg font-bold text-[#132A29] mt-1">{currentChild.className}</p>
          <p className="text-[11px] text-[#64748B]">Admission: {currentChild.admissionDate}</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-[#E2E8F0]">
          <span className="text-[#64748B]">Attendance Rate</span>
          <p className="text-lg font-bold font-mono text-emerald-700 mt-1">{attendancePercentage}% Present</p>
          <p className="text-[11px] text-[#64748B]">{attendanceRecords.length} recorded days</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-[#E2E8F0]">
          <span className="text-[#64748B]">Tuition Balance Status</span>
          <p className="text-lg font-bold uppercase text-emerald-700 mt-1">
            {balance === 0 ? 'PAID' : 'BALANCE DUE'}
          </p>
          <p className="text-[11px] text-[#64748B]">{formatMoney(balance, school?.currency)} remaining</p>
        </div>
      </div>

      <section className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-3 shadow-xs text-xs">
        <h2 className="text-sm font-bold text-[#132A29]">{t('timetable')} · {currentChild.firstName}</h2>
        {timetableState.loading ? <div className="h-24 animate-pulse rounded-lg bg-slate-100" /> : timetableState.error ? <ErrorState error={timetableState.error} onRetry={timetableState.retry} /> : timetable.length === 0 ? <p className="text-[#64748B]">{t('timetable_empty')}</p> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[...timetable].sort((a, b) => a.dayOfWeek.localeCompare(b.dayOfWeek) || a.periodNumber - b.periodNumber).map(slot => <div key={slot.id} className="p-3 bg-[#F0FDFA] rounded-lg border border-[#CCFBF1]"><p className="font-bold text-[#132A29]">{slot.dayOfWeek} · Period {slot.periodNumber}</p><p className="text-[#334155]">{slot.subjectName || slot.subjectId}</p><p className="text-[#64748B]">{slot.startTime}–{slot.endTime} · {slot.roomNumber}{slot.teacherName ? ` · ${slot.teacherName}` : ''}</p></div>)}</div>}
      </section>

      <section className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-3 shadow-xs text-xs">
        <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold text-[#132A29]">Published Exam Schedule · {currentChild.firstName}</h2><button type="button" onClick={printExamTimetable} className="rounded-lg border border-[#CBD5E1] px-3 py-1.5 text-[11px] font-semibold text-[#334155]">Print timetable</button></div>
        {examSchedulesState.loading ? <div className="h-16 animate-pulse rounded-lg bg-slate-100" /> : examSchedulesState.error ? <ErrorState error={examSchedulesState.error} onRetry={examSchedulesState.retry} /> : <ExamTimetablePrint schedules={publishedExamSchedules} school={school} classGroup={publishedExamSchedules[0]?.className || currentChild.className || school?.examTimetableClassGroup} />}
      </section>

      {/* Academic Results & Fee Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-[#0F766E]" /><span>{currentChild.firstName}'s Exam Performance</span></h2>
            <div className="flex gap-2">
              <button type="button" onClick={handleDownloadAnnualReportCard} disabled={!hasBothPublishedSemesters || reportCardDownloading} className="rounded border border-[#0F766E] bg-[#0F766E] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"><Download className="mr-1 inline h-3.5 w-3.5" />{reportCardDownloading ? 'Preparing PDF…' : 'Download Annual PDF'}</button>
              <button type="button" onClick={() => window.print()} className="flex items-center gap-1 rounded border border-[#CCFBF1] bg-[#F0FDFA] px-2.5 py-1 text-xs text-[#0F766E]"><Printer className="h-3.5 w-3.5" /><span>Print Card</span></button>
            </div>
          </div>
          {reportCardDownloadError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700">{reportCardDownloadError}</p>}
          {termReportCardsState.loading ? <div className="h-12 animate-pulse rounded-lg bg-slate-100" /> : termReportCards.length > 0 ? termReportCards.map((card: any) => (
            <div key={card.id} className="rounded-lg border border-teal-200 bg-teal-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-bold text-teal-950">Report Card sannadeedka</p><p className="text-[11px] text-teal-800">Celcelis {card.yearly_average}/100 · Grade {card.overall_grade} · Darajo #{card.rank_in_class}</p></div>
                <button type="button" onClick={handleDownloadTermReportCard} disabled={reportCardDownloading} className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{reportCardDownloading ? 'Diyaarinaya…' : 'Download Report Card PDF'}</button></div>
              <div className="mt-2 space-y-1">{(card.subject_results || []).map((subject: any) => <p key={subject.subject_id} className="text-[11px] text-teal-950">{subject.subject}: T1 {subject.term1} · T2 {subject.term2} · Sanad {subject.yearly} · {subject.grade || ''}</p>)}</div>
            </div>
          )) : <p className="text-[#64748B]">Report Card-ka sannadlaha wali lama daabicin. Marka dugsigu daabaco ayuu halkan ka muuqanayaa.</p>}
          <div className="space-y-2">
            {(Array.isArray(childData?.marks) ? childData.marks : []).length ? childData?.marks?.map((mark: any) => (
              <div key={mark.id} className="p-2.5 bg-[#F8FAFC] rounded border border-[#E2E8F0] flex justify-between"><span>{mark.subjectId} · {mark.semester}</span><span className="font-mono font-bold">{Number(mark.percentage).toFixed(1)}%</span></div>
            )) : <p className="text-[#64748B]">No published results are available yet. The School Admin will publish the approved results here.</p>}
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-3 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]"><h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2"><CreditCard className="w-4 h-4 text-[#0F766E]" /><span>Tuition Payment Receipts</span></h2></div>
          <div className="space-y-2">
            {payments.length ? payments.map((payment: any) => (
              <div key={payment.id} className="p-3 bg-[#F0FDFA] rounded-lg border border-[#CCFBF1] flex justify-between"><div><span className="font-bold text-[#132A29] block">{payment.feeType} · {payment.month}</span><span className="text-[11px] text-[#64748B]">Cash · Receipt #{payment.receiptNumber}</span></div><span className="font-mono font-bold">{formatMoney(payment.amountPaid, school?.currency)} · {payment.status}</span></div>
            )) : <p className="text-[#64748B]">No payment receipts are available.</p>}
          </div>
        </div>
      </div>    </div>
  );
};
