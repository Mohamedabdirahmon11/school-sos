/**
 * Parent Portal View
 * Multi-child sibling switcher, attendance percentage, fee balance & official receipts, exam results, and report cards
 */

import React, { useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
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
  const { user, school, t } = useAuth();
  const [selectedChildIndex, setSelectedChildIndex] = useState(0);
  const childrenState = useApi(async () => {
    const all = await ApiClient.getSchoolStudents({ schoolId: school?.id });
    return (Array.isArray(all) ? all : []).filter(s =>
      user?.linkedStudentIds?.includes(s.id) || s.fatherPhone === user?.phone || s.motherPhone === user?.phone
    );
  }, [school?.id, user?.id, user?.phone, user?.linkedStudentIds?.join(',')], Boolean(school));
  const children: any[] = childrenState.data ?? [];
  const currentChild = children[selectedChildIndex];
  const childState = useApi(
    () => ApiClient.getStudentDetails(currentChild?.id, school?.id, true),
    [currentChild?.id, school?.id],
    Boolean(currentChild)
  );
  const timetableState = useApi(
    () => ApiClient.getTimetable({ classId: currentChild?.classId }),
    [currentChild?.id, currentChild?.classId, school?.id],
    Boolean(currentChild)
  );
  const examSchedulesState = useApi(
    () => currentChild?.classId ? ApiClient.getPublishedExamSchedules() : Promise.resolve([]),
    [currentChild?.id, currentChild?.classId, school?.id],
    Boolean(currentChild)
  );
  const publishedExamSchedules = Array.isArray(examSchedulesState.data) ? examSchedulesState.data : [];
  const timetable = Array.isArray(timetableState.data) ? timetableState.data : [];
  const childData = childState.data;

  const handleSelectChild = (idx: number) => {
    setSelectedChildIndex(idx);
  };

  if (childrenState.loading) return <div className="p-6 space-y-3" aria-label="Loading parent portal"><div className="h-8 w-1/3 animate-pulse rounded bg-slate-200" /><div className="h-32 animate-pulse rounded-xl bg-white" /></div>;
  if (childrenState.error) return <ErrorState error={childrenState.error} onRetry={childrenState.retry} />;
  if (!currentChild) return <div className="p-6 text-xs text-[#64748B]">No children are linked to this parent account.</div>;
  if (childState.loading) return <div className="p-6 space-y-3" aria-label="Loading child details"><div className="h-8 w-1/3 animate-pulse rounded bg-slate-200" /><div className="h-48 animate-pulse rounded-xl bg-white" /></div>;
  if (childState.error) return <ErrorState error={childState.error} onRetry={childState.retry} />;
  const attendanceRecords = childData?.attendance || [];
  const presentCount = attendanceRecords.filter((record: any) => record.status === 'present' || record.status === 'late').length;
  const attendancePercentage = attendanceRecords.length ? Math.round((presentCount / attendanceRecords.length) * 100) : 0;
  const payments = childData?.payments || [];
  const balance = payments.reduce((sum: number, payment: any) => sum + (payment.remainingAmount || 0), 0);

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

        {/* Multi-Child Switcher Buttons */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#64748B] font-medium hidden sm:inline">Switch Child:</span>
          <div className="flex items-center gap-1.5 p-1 bg-[#F1F5F9] rounded-lg">
            {children.map((child, idx) => (
              <button
                key={child.id}
                onClick={() => handleSelectChild(idx)}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                  selectedChildIndex === idx
                    ? 'bg-[#0F766E] text-white shadow-xs'
                    : 'text-[#334155] hover:bg-[#E2E8F0]'
                }`}
              >
                {child.firstName} ({child.studentId})
              </button>
            ))}
          </div>
        </div>
      </div>

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
        <h2 className="text-sm font-bold text-[#132A29]">Published Exam Schedule · {currentChild.firstName}</h2>
        {examSchedulesState.loading ? <div className="h-20 animate-pulse rounded-lg bg-slate-100" /> : examSchedulesState.error ? <ErrorState error={examSchedulesState.error} onRetry={examSchedulesState.retry} /> : publishedExamSchedules.length === 0 ? <p className="text-[#64748B]">No exam timetable has been published for this child's class yet.</p> : publishedExamSchedules.map((exam: any) => (
          <div key={exam.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="font-bold text-[#132A29]">{exam.examName} · {exam.subjectName}</p>
            <p className="mt-1 text-[#475569]">{exam.examDate} · {String(exam.startTime).slice(0,5)}–{String(exam.endTime).slice(0,5)} · Room {exam.roomName}</p>
          </div>
        ))}
      </section>

      {/* Academic Results & Fee Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-3 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-[#0F766E]" /><span>{currentChild.firstName}'s Exam Performance</span></h2>
            <button onClick={() => window.print()} className="px-2.5 py-1 text-xs text-[#0F766E] bg-[#F0FDFA] rounded border border-[#CCFBF1] flex items-center gap-1"><Printer className="w-3.5 h-3.5" /><span>Print Card</span></button>
          </div>
          <div className="space-y-2">
            {(Array.isArray(childData?.marks) ? childData.marks : []).length ? childData?.marks?.map((mark: any) => (
              <div key={mark.id} className="p-2.5 bg-[#F8FAFC] rounded border border-[#E2E8F0] flex justify-between"><span>{mark.subjectId} · {mark.semester}</span><span className="font-mono font-bold">{Number(mark.percentage).toFixed(1)}%</span></div>
            )) : <p className="text-[#64748B]">No approved results are available.</p>}
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
