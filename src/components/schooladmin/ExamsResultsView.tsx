/**
 * Exams & Marks Management: Small Exam + Big Exam Grading
 * Rules Enforced:
 * 1. Percentage-based only (No letter grades or GPA anywhere)
 * 2. Small Exam + Big Exam max marks configuration (default 10 and 10, pass mark %)
 * 3. Total marks = small + big, percentage = (total / max) * 100
 * 4. Teachers submit marks -> Admin approves -> permanently locked
 * 5. Semester 1 Class Rank with Top 3 students highlight & results sheet
 * 6. Semester 2 Combined Yearly Class Rank combining S1 & S2
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { SchoolClass, Subject, Student, ExamConfig, ExamAssessmentComponent, StudentMark } from '../../types/index.ts';
import { 
  FileSpreadsheet, 
  Check, 
  Lock, 
  CheckCircle2, 
  Award, 
  Trophy, 
  Sliders, 
  Save, 
  Printer, 
  Download,
  AlertCircle,
  CalendarDays
} from 'lucide-react';

export const ExamsResultsView: React.FC = () => {
  const { school, isReadOnly, t } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classSubjectRows, setClassSubjectRows] = useState<Array<{ id: string; subject: Subject | null; teacher: { id: string; fullName: string } | null }>>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [activeTab, setActiveTab] = useState<'entry_approval' | 'sem1_rankings' | 'sem2_yearly' | 'config' | 'schedule'>('entry_approval');
  const [selectedSemester, setSelectedSemester] = useState<'Semester 1' | 'Semester 2'>('Semester 1');

  // Exam Config State
  const [examConfig, setExamConfig] = useState<ExamConfig | null>(null);
  const [assessmentComponents, setAssessmentComponents] = useState<ExamAssessmentComponent[]>([
    { id: 'test-1', name: 'Test 1', maxMarks: 10, category: 'continuous', order: 1 },
    { id: 'test-2', name: 'Test 2', maxMarks: 10, category: 'continuous', order: 2 },
    { id: 'test-3', name: 'Test 3', maxMarks: 10, category: 'continuous', order: 3 },
    { id: 'test-4', name: 'Test 4', maxMarks: 10, category: 'continuous', order: 4 },
    { id: 'final-exam', name: 'Final Examination', maxMarks: 60, category: 'final', order: 5 }
  ]);
  const [passMarkPercentage, setPassMarkPercentage] = useState(50);

  // Marks Table State: all subjects in the selected class, all students in rows.
  const [marks, setMarks] = useState<StudentMark[]>([]);
  const [semRankings, setSemRankings] = useState<any[]>([]);
  const [yearlyRankings, setYearlyRankings] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Exam timetable, room allocation, and seat list state
  const [examSchedules, setExamSchedules] = useState<any[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [publishingScheduleId, setPublishingScheduleId] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleExamName, setScheduleExamName] = useState('Midterm Examination');
  const [scheduleExamType, setScheduleExamType] = useState<'small' | 'big'>('small');
  const [scheduleDate, setScheduleDate] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  const [scheduleStartTime, setScheduleStartTime] = useState('08:00');
  const [scheduleEndTime, setScheduleEndTime] = useState('10:00');
  const [scheduleRoom, setScheduleRoom] = useState('');
  const [scheduleCapacity, setScheduleCapacity] = useState(40);
  const [seatSheet, setSeatSheet] = useState<any | null>(null);

  // Load classes, subjects, and exam configuration with a retryable failure state.
  const loadExamSetup = async () => {
    if (!school) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const [cls, subs, conf] = await Promise.all([
        ApiClient.getClasses(),
        ApiClient.getSubjects(),
        ApiClient.getExamConfig()
      ]);
      setClasses(cls);
      if (cls.length > 0) setSelectedClassId(cls[0].id);
      setSubjects(subs);
      if (subs.length > 0) setSelectedSubjectId(subs[0].id);
      if (conf) {
        setExamConfig(conf);
        setAssessmentComponents(conf.assessmentComponents?.length ? conf.assessmentComponents : [
          { id: 'legacy-small', name: conf.smallExamName || 'Continuous Assessment', maxMarks: conf.smallExamMax || 10, category: 'continuous', order: 1 },
          { id: 'legacy-big', name: conf.bigExamName || 'Final Examination', maxMarks: conf.bigExamMax || 10, category: 'final', order: 2 }
        ]);
        setPassMarkPercentage(conf.passMarkPercentage ?? 50);
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Unable to load classes, subjects, or exam configuration.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadExamSetup();
  }, [school]);

  useEffect(() => {
    if (activeTab !== 'schedule' || !school) return;
    let cancelled = false;
    setScheduleLoading(true);
    setScheduleError('');
    ApiClient.getExamSchedules()
      .then(rows => { if (!cancelled) setExamSchedules(Array.isArray(rows) ? rows : []); })
      .catch(reason => { if (!cancelled) setScheduleError(reason instanceof Error ? reason.message : 'Unable to load exam schedules.'); })
      .finally(() => { if (!cancelled) setScheduleLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, school?.id]);

  useEffect(() => {
    if (seatSheet) window.print();
  }, [seatSheet]);

  // Load the complete class results matrix: all class subjects and all enrolled students.
  const loadClassData = async () => {
    if (!selectedClassId) return;
    setLoadError(null);
    try {
      const [stdList, existingMarks, classDetails] = await Promise.all([
        ApiClient.getAllStudents(selectedClassId),
        ApiClient.getMarks(selectedClassId, undefined, selectedSemester),
        ApiClient.getClassDetails(selectedClassId, { page: 1, pageSize: 1 })
      ]);
      setStudents(stdList);
      setMarks(existingMarks);
      setClassSubjectRows(classDetails.subjects || []);

      if (activeTab === 'sem1_rankings') {
        const ranks = await ApiClient.getSemesterRankings(selectedClassId, 'Semester 1');
        setSemRankings(ranks);
      } else if (activeTab === 'sem2_yearly') {
        const yearly = await ApiClient.getYearlyRankings(selectedClassId);
        setYearlyRankings(yearly);
      }
    } catch (err: any) {
      console.error(err);
      setLoadError(err?.message || 'Unable to load the complete class results.');
    }
  };

  useEffect(() => {
    void loadClassData();
  }, [selectedClassId, selectedSemester, activeTab]);

  // Save Exam Config
  const handleSaveConfig = async () => {
    if (isReadOnly) return;
    setIsSaving(true);
    try {
      const updated = await ApiClient.updateExamConfig({
        assessmentComponents: assessmentComponents.map((component, index) => ({ ...component, order: index + 1 })),
        passMarkPercentage
      });
      setExamConfig(updated);
      setNotice('Exam structure and maximum marks saved successfully!');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setNotice(err.message || 'Failed to update exam config.');
    } finally {
      setIsSaving(false);
    }
  };

  // Admin Approve All Submitted Marks
  const handleApproveAll = async () => {
    if (isReadOnly) return;
    const pendingIds = marks.filter(m => m.status === 'form_teacher_submitted').map(m => m.id);
    if (pendingIds.length === 0) {
      setNotice('No pending marks to approve.');
      return;
    }

    try {
      const result = await ApiClient.approveMarks(pendingIds);
      setNotice(`Approved and permanently locked ${result.approvedCount} mark records.`);
      await loadClassData();
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setNotice(err.message || 'Failed to approve marks.');
    }
  };

  const handleCreateExamSchedule = async () => {
    if (isReadOnly || !selectedClassId || !selectedSubjectId) return;
    setScheduleSaving(true);
    setScheduleError('');
    try {
      await ApiClient.createExamSchedule({
        examName: scheduleExamName.trim(),
        classId: selectedClassId,
        subjectId: selectedSubjectId,
        examType: scheduleExamType,
        semester: selectedSemester,
        examDate: scheduleDate,
        startTime: scheduleStartTime,
        endTime: scheduleEndTime,
        roomName: scheduleRoom.trim(),
        seatCapacity: scheduleCapacity
      });
      const rows = await ApiClient.getExamSchedules();
      setExamSchedules(rows);
      setNotice('Exam schedule saved as a draft. Publish it to assign seats.');
    } catch (reason) {
      setScheduleError(reason instanceof Error ? reason.message : 'Unable to create exam schedule.');
    } finally {
      setScheduleSaving(false);
    }
  };

  const handlePublishExamSchedule = async (scheduleId: string) => {
    if (isReadOnly) return;
    setPublishingScheduleId(scheduleId);
    setScheduleError('');
    try {
      const result = await ApiClient.publishExamSchedule(scheduleId);
      const rows = await ApiClient.getExamSchedules();
      setExamSchedules(rows);
      setNotice(`Exam schedule published and ${result.seat_count} seats assigned.`);
    } catch (reason) {
      setScheduleError(reason instanceof Error ? reason.message : 'Unable to publish exam schedule.');
    } finally {
      setPublishingScheduleId('');
    }
  };

  const handleCancelExamSchedule = async (scheduleId: string) => {
    if (isReadOnly) return;
    setScheduleError('');
    try {
      await ApiClient.cancelExamSchedule(scheduleId);
      setExamSchedules(await ApiClient.getExamSchedules());
      setNotice('Draft exam schedule cancelled.');
    } catch (reason) {
      setScheduleError(reason instanceof Error ? reason.message : 'Unable to cancel exam schedule.');
    }
  };

  const handlePrintExamSeats = async (schedule: any) => {
    setScheduleError('');
    try {
      const result = await ApiClient.getExamScheduleSeats(schedule.id);
      setSeatSheet({ schedule: { ...schedule, ...result.schedule }, seats: result.seats });
    } catch (reason) {
      setScheduleError(reason instanceof Error ? reason.message : 'Unable to load the seating list.');
    }
  };

  const selectedClass = classes.find(c => c.id === selectedClassId);
  const selectedClassSubjects = classSubjectRows.filter(row => row.subject).map(row => row.subject as Subject);
  const continuousMax = assessmentComponents.filter(component => component.category === 'continuous').reduce((sum, component) => sum + Number(component.maxMarks || 0), 0);
  const finalMax = assessmentComponents.filter(component => component.category === 'final').reduce((sum, component) => sum + Number(component.maxMarks || 0), 0);
  const maxCombined = continuousMax + finalMax;

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1600px] space-y-6 p-5 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#102522] flex items-center gap-2">
            <FileSpreadsheet className="h-7 w-7 text-[#0e8078]" />
            {t('exams_results')}
          </h1>
          <p className="mt-1 text-sm text-[#71817d]">
            Review teacher-submitted school results, approve marks, and view semester rankings.
            {selectedClass ? ` Current class: ${selectedClass.name} (${selectedClass.section}).` : ''}
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-[#edf4f1] p-1.5 rounded-2xl text-sm">
          <button
            type="button"
            onClick={() => setActiveTab('entry_approval')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'entry_approval' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
            }`}
          >
            Submitted Results & Approval
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sem1_rankings')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'sem1_rankings' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
            }`}
          >
            Semester 1 Rankings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sem2_yearly')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'sem2_yearly' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
            }`}
          >
            Yearly Results (S1 + S2)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
              activeTab === 'schedule' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Exam Schedule
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
              activeTab === 'config' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Exam Config
          </button>
        </div>
      </div>

      {loadError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center justify-between gap-3"><span>{loadError}</span><button type="button" onClick={() => void (classes.length && subjects.length ? loadClassData() : loadExamSetup())} className="shrink-0 rounded-md border border-rose-300 bg-white px-3 py-1.5 font-semibold">Retry</button></div>}
      {notice && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* TAB 1: MARK ENTRY & APPROVAL */}
      {activeTab === 'entry_approval' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm sm:grid-cols-3">
            <label className="text-xs font-semibold text-[#475569]">Select Class
              <select value={selectedClassId} onChange={event => setSelectedClassId(event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2">
                {classes.map(klass => <option key={klass.id} value={klass.id}>{klass.name} ({klass.section})</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-[#475569]">Academic Semester
              <select value={selectedSemester} onChange={event => setSelectedSemester(event.target.value as any)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2">
                <option value="Semester 1">Semester 1</option><option value="Semester 2">Semester 2</option>
              </select>
            </label>
            <div className="flex items-end text-xs font-medium text-[#0F766E]">All class subjects and all students load together for review and approval.</div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-100 bg-teal-50 px-4 py-3 text-xs text-teal-900">
            <div>
              <strong>Class results:</strong> {selectedClass ? `${selectedClass.name} · Section ${selectedClass.section}` : 'No class selected'} · {selectedSemester}
              <p className="mt-1">{selectedClassSubjects.length} subjects · {students.length} students · {marks.filter(mark => mark.status === 'form_teacher_submitted').length} mark rows submitted by Fomester</p>
            </div>
            <button type="button" onClick={handleApproveAll} disabled={isReadOnly || !marks.some(mark => mark.status === 'form_teacher_submitted')} className="rounded-lg bg-[#0B2B2A] px-3 py-2 font-semibold text-white disabled:opacity-50"><Lock className="mr-1 inline h-3.5 w-3.5"/>Approve & Lock All</button>
          </div>

          {/* Mark Scheme Guidance Banner */}
          <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl flex items-center justify-between text-xs text-teal-900">
            <span className="font-medium">
              Maximum Scores: {assessmentComponents.map(component => `${component.name} ({component.maxMarks})`).join(' + ')} = Total ({maxCombined} pts).
              Percentage = (Score / {maxCombined}) × 100%. Pass mark: {passMarkPercentage}%.
            </span>

          </div>

          {/* Class-wide results matrix */}
          <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
            {students.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No students enrolled in this class.</div> : selectedClassSubjects.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No subjects have been assigned to this class.</div> : (
              <table className="w-full min-w-[1000px] border-collapse text-xs text-[#132A29]">
                <thead className="bg-[#F8FAFC] text-[11px] uppercase text-[#64748B]">
                  <tr><th rowSpan={2} className="border-b px-3 py-3 text-left">Student</th>{selectedClassSubjects.map(subject => <th key={subject.id} colSpan={assessmentComponents.length + 3} className="border-b border-l px-2 py-2 text-center">{subject.name}</th>)}</tr>
                  <tr>{selectedClassSubjects.map(subject => <React.Fragment key={subject.id}>{assessmentComponents.map(component => <th key={component.id} className="border-b border-l px-2 py-2">{component.name}<span className="block text-[9px] normal-case">/{component.maxMarks}</span></th>)}<th className="border-b border-l px-2 py-2">Total</th><th className="border-b px-2 py-2">%</th><th className="border-b px-2 py-2">Status</th></React.Fragment>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map(student => <tr key={student.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2"><strong>{student.firstName} {student.middleName} {student.lastName}</strong><span className="block text-[10px] text-slate-500">{student.studentId}</span></td>
                    {selectedClassSubjects.map(subject => {
                      const mark = marks.find(item => item.studentId === student.id && item.subjectId === subject.id);
                      const status = mark?.status === 'form_teacher_submitted' ? 'To Admin' : mark?.status === 'submitted' ? 'Waiting Fomester' : mark?.status === 'approved' ? 'Approved' : mark?.status === 'draft' ? 'Draft' : 'Missing';
                      return <React.Fragment key={subject.id}>
                        {assessmentComponents.map(component => <td key={component.id} className="border-l px-2 py-2 text-center">{mark?.assessmentScores?.[component.id] ?? '—'}</td>)}
                        <td className="border-l px-2 py-2 text-center font-semibold">{mark ? mark.totalMarks : '—'}</td>
                        <td className="px-2 py-2 text-center">{mark ? `${mark.percentage}%` : '—'}</td>
                        <td className="px-2 py-2 text-center"><span className={`rounded-full px-2 py-1 text-[10px] ${mark?.status === 'form_teacher_submitted' ? 'bg-teal-100 text-teal-800' : mark?.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{status}</span></td>
                      </React.Fragment>;
                    })}
                  </tr>)}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SEMESTER 1 RANKINGS & TOP STUDENTS */}
      {activeTab === 'sem1_rankings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-[#E2E8F0]">
            <div>
              <h2 className="text-sm font-bold text-[#132A29]">
                Semester 1 Class Ranking & Top Students Sheet
              </h2>
              <p className="text-sm text-[#71817d]">
                Class results calculated as average percentages across all curriculum subjects.
                <span className="mt-1 block text-xs font-semibold text-[#0F766E]">Class: {classes.find(c => c.id === selectedClassId)?.name || 'Select a class'} · Section {classes.find(c => c.id === selectedClassId)?.section || '—'}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="text-xs py-1.5 px-3 border border-[#CBD5E1] rounded-lg bg-white"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-[#0F766E] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Results Sheet
              </button>
            </div>
          </div>

          {/* Top 3 Students Highlight Podium Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {semRankings.filter(r => r.isTopThree).map((r, i) => (
              <div 
                key={r.student.id} 
                className={`p-4 rounded-xl border shadow-sm flex items-center gap-3 ${
                  i === 0 ? 'bg-amber-50/70 border-amber-200' : i === 1 ? 'bg-slate-50 border-slate-200' : 'bg-orange-50/70 border-orange-200'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-xs ${
                  i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-500' : 'bg-orange-500'
                }`}>
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#132A29]">Rank #{r.rank}</span>
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white/80">
                      {i === 0 ? 'Gold' : i === 1 ? 'Silver' : 'Bronze'}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-[#132A29] mt-0.5">
                    {r.student.firstName} {r.student.lastName}
                  </p>
                  <p className="text-[11px] font-mono text-[#0F766E] font-bold">
                    {r.averagePercentage}% Average
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Full Class Ranking Table */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#132A29]">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase font-semibold text-[#64748B]">
                  <tr>
                    <th className="py-3 px-4 text-center">Rank</th>
                    <th className="py-3 px-4">Student ID</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4 text-center">Subjects Graded</th>
                    <th className="py-3 px-4 text-center font-bold">Semester 1 Average (%)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {semRankings.map(r => (
                    <tr key={r.student.id} className={r.isTopThree ? 'bg-teal-50/30' : 'hover:bg-[#F8FAFC]'}>
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        {r.rank === 1 ? '🥇 1' : r.rank === 2 ? '🥈 2' : r.rank === 3 ? '🥉 3' : `#${r.rank}`}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#64748B]">{r.student.studentId}</td>
                      <td className="py-3 px-4 font-semibold text-[#132A29]">
                        {r.student.firstName} {r.student.middleName} {r.student.lastName}
                      </td>
                      <td className="py-3 px-4 text-center font-mono">{r.subjectCount}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-[#0F766E]">
                        {r.averagePercentage}%
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          r.averagePercentage >= (examConfig?.passMarkPercentage || 50)
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}>
                          {r.averagePercentage >= (examConfig?.passMarkPercentage || 50) ? 'Passing' : 'Below Pass Mark'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SEMESTER 2 COMBINED YEARLY RESULTS */}
      {activeTab === 'sem2_yearly' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-[#E2E8F0]">
            <div>
              <h2 className="text-sm font-bold text-[#132A29]">
                Yearly Combined Results & Class Rank (Semester 1 + Semester 2)
              </h2>
              <p className="text-sm text-[#71817d]">
                Combines both semesters to produce yearly subject percentages and final class ranking.
                <span className="mt-1 block text-xs font-semibold text-[#0F766E]">Class: {classes.find(c => c.id === selectedClassId)?.name || 'Select a class'} · Section {classes.find(c => c.id === selectedClassId)?.section || '—'}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="text-xs py-1.5 px-3 border border-[#CBD5E1] rounded-lg bg-white"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-[#0F766E] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Yearly Roster
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#132A29]">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase font-semibold text-[#64748B]">
                  <tr>
                    <th className="py-3 px-4 text-center">Yearly Rank</th>
                    <th className="py-3 px-4">Student ID</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4 text-center font-bold">Yearly Total (%)</th>
                    <th className="py-3 px-4 text-center">Academic Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {yearlyRankings.map(yr => (
                    <tr key={yr.student.id} className={yr.isTopThree ? 'bg-teal-50/30' : 'hover:bg-[#F8FAFC]'}>
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        {yr.yearlyRank === 1 ? '🥇 1' : yr.yearlyRank === 2 ? '🥈 2' : yr.yearlyRank === 3 ? '🥉 3' : `#${yr.yearlyRank}`}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#64748B]">{yr.student.studentId}</td>
                      <td className="py-3 px-4 font-semibold text-[#132A29]">
                        {yr.student.firstName} {yr.student.middleName} {yr.student.lastName}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-[#0F766E]">
                        {yr.yearlyPercentage}%
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          yr.isPass ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {yr.isPass ? 'Promote Candidate' : 'Repeat Required'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* EXAM TIMETABLE, ROOM AND SEATING */}
      {activeTab === 'schedule' && (
        <div className="space-y-5">
          {scheduleError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{scheduleError}</div>}
          <section className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-bold text-[#132A29]">Create exam schedule</h2>
              <p className="mt-1 text-xs text-[#64748B]">Set the exam date, time, room and seating capacity. Publishing assigns a seat to every active student in the selected class.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold text-[#475569]">Exam name
                <input maxLength={120} required value={scheduleExamName} onChange={event => setScheduleExamName(event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-normal" placeholder="Midterm Examination" />
              </label>
              <label className="text-xs font-semibold text-[#475569]">Exam type
                <select value={scheduleExamType} onChange={event => setScheduleExamType(event.target.value as 'small' | 'big')} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 font-normal">
                  <option value="small">Small Exam</option>
                  <option value="big">Big Exam</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-[#475569]">Class
                <select value={selectedClassId} onChange={event => setSelectedClassId(event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 font-normal">
                  {classes.map(item => <option key={item.id} value={item.id}>{item.name} {item.section ? `· ${item.section}` : ''}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-[#475569]">Subject
                <select value={selectedSubjectId} onChange={event => setSelectedSubjectId(event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 font-normal">
                  {subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-[#475569]">Semester
                <select value={selectedSemester} onChange={event => setSelectedSemester(event.target.value as 'Semester 1' | 'Semester 2')} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 font-normal">
                  <option value="Semester 1">Semester 1</option>
                  <option value="Semester 2">Semester 2</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-[#475569]">Exam date
                <input type="date" required value={scheduleDate} onChange={event => setScheduleDate(event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-normal" />
              </label>
              <label className="text-xs font-semibold text-[#475569]">Start time
                <input type="time" required value={scheduleStartTime} onChange={event => setScheduleStartTime(event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-normal" />
              </label>
              <label className="text-xs font-semibold text-[#475569]">End time
                <input type="time" required value={scheduleEndTime} onChange={event => setScheduleEndTime(event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-normal" />
              </label>
              <label className="text-xs font-semibold text-[#475569]">Room / Hall
                <input maxLength={120} required value={scheduleRoom} onChange={event => setScheduleRoom(event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-normal" placeholder="e.g. Hall A" />
              </label>
              <label className="text-xs font-semibold text-[#475569]">Room seat capacity
                <input type="number" min={1} max={500} step={1} required value={scheduleCapacity} onChange={event => setScheduleCapacity(Number(event.target.value) || 0)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-normal" />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] pt-4">
              <p className="text-[11px] text-[#64748B]">Academic year: {school?.academicYear || 'Current school year'} · Room and class time conflicts are checked when publishing.</p>
              <button type="button" onClick={() => void handleCreateExamSchedule()} disabled={isReadOnly || scheduleSaving || !classes.length || !subjects.length || !scheduleExamName.trim() || !scheduleRoom.trim() || scheduleCapacity < 1} className="rounded-lg bg-[#0F766E] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">
                {scheduleSaving ? 'Saving draft…' : 'Save schedule draft'}
              </button>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] p-4">
              <div><h2 className="text-sm font-bold text-[#132A29]">Exam timetable and seating</h2><p className="mt-1 text-[11px] text-[#64748B]">{examSchedules.length} schedules · {school?.academicYear || 'Current year'}</p></div>
              <button type="button" onClick={() => { setScheduleError(''); setScheduleLoading(true); ApiClient.getExamSchedules().then(setExamSchedules).catch(error => setScheduleError(error.message || 'Unable to refresh schedules.')).finally(() => setScheduleLoading(false)); }} disabled={scheduleLoading} className="rounded-lg border border-[#CBD5E1] px-3 py-2 text-xs font-semibold text-[#334155] disabled:opacity-50">{scheduleLoading ? 'Refreshing…' : 'Refresh'}</button>
            </div>
            {scheduleLoading ? <p className="p-6 text-center text-xs text-[#64748B]">Loading exam schedules…</p> : examSchedules.length === 0 ? <p className="p-8 text-center text-xs text-[#64748B]">No exam schedules yet. Create a draft above.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="bg-[#F8FAFC] text-[#64748B]"><tr>
                    <th className="px-3 py-3">Exam</th><th className="px-3 py-3">Class / Subject</th><th className="px-3 py-3">Date / Time</th><th className="px-3 py-3">Room</th><th className="px-3 py-3">Capacity</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Actions</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {examSchedules.map(schedule => (
                      <tr key={schedule.id}>
                        <td className="px-3 py-3"><p className="font-semibold text-[#132A29]">{schedule.examName}</p><p className="mt-1 text-[10px] text-[#64748B]">{schedule.examType === 'small' ? 'Small Exam' : 'Big Exam'} · {schedule.semester}</p></td>
                        <td className="px-3 py-3"><p className="font-semibold">{schedule.className}</p><p className="mt-1 text-[10px] text-[#64748B]">{schedule.subjectName}</p></td>
                        <td className="px-3 py-3"><p>{schedule.examDate}</p><p className="mt-1 text-[10px] text-[#64748B]">{String(schedule.startTime).slice(0,5)}–{String(schedule.endTime).slice(0,5)}</p></td>
                        <td className="px-3 py-3">{schedule.roomName}</td>
                        <td className="px-3 py-3">{schedule.seatCapacity} seats</td>
                        <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${schedule.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{schedule.status}</span></td>
                        <td className="px-3 py-3"><div className="flex justify-end gap-2">
                          {schedule.status === 'draft' && <>
                            <button type="button" onClick={() => void handlePublishExamSchedule(schedule.id)} disabled={isReadOnly || publishingScheduleId === schedule.id} className="rounded-lg bg-[#0F766E] px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50">{publishingScheduleId === schedule.id ? 'Publishing…' : 'Publish & assign seats'}</button>
                            <button type="button" onClick={() => void handleCancelExamSchedule(schedule.id)} disabled={isReadOnly || publishingScheduleId === schedule.id} className="rounded-lg border border-rose-200 px-3 py-2 text-[10px] font-semibold text-rose-700 disabled:opacity-50">Cancel draft</button>
                          </>}
                          {schedule.status === 'published' && <button type="button" onClick={() => void handlePrintExamSeats(schedule)} className="inline-flex items-center gap-1 rounded-lg border border-[#CBD5E1] px-3 py-2 text-[10px] font-semibold"><Printer className="h-3.5 w-3.5"/>Print seating</button>}
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 4: EXAM STRUCTURE CONFIGURATION */}
      {activeTab === 'config' && (
        <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm max-w-2xl space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#132A29]">School Exam Structure</h2>
            <p className="mt-1 text-sm text-[#71817d]">Add or remove assessments, set each maximum score, and choose whether it belongs to continuous assessment or the final examination. Teachers will see these exact columns.</p>
          </div>

          <div className="space-y-3">
            {assessmentComponents.map((component, index) => (
              <div key={component.id} className="grid grid-cols-1 gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 sm:grid-cols-[minmax(0,1fr)_110px_160px_40px]">
                <label className="text-xs font-semibold text-[#475569]">Assessment name
                  <input value={component.name} maxLength={100} onChange={event => setAssessmentComponents(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 font-normal" />
                </label>
                <label className="text-xs font-semibold text-[#475569]">Maximum marks
                  <input type="number" min={0.5} max={1000} step={0.5} value={component.maxMarks} onChange={event => setAssessmentComponents(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, maxMarks: Math.max(0.5, Number(event.target.value) || 0.5) } : row))} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 font-mono font-normal" />
                </label>
                <label className="text-xs font-semibold text-[#475569]">Assessment group
                  <select value={component.category} onChange={event => setAssessmentComponents(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, category: event.target.value as 'continuous' | 'final' } : row))} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 font-normal">
                    <option value="continuous">Continuous / small tests</option>
                    <option value="final">Final / major exam</option>
                  </select>
                </label>
                <button type="button" onClick={() => setAssessmentComponents(rows => rows.filter(row => row.id !== component.id).map((row, rowIndex) => ({ ...row, order: rowIndex + 1 })))} disabled={assessmentComponents.length <= 2} aria-label={`Remove ${component.name}`} className="mt-5 h-9 rounded-lg border border-rose-200 bg-white text-rose-700 disabled:opacity-40">×</button>
              </div>
            ))}
            <button type="button" onClick={() => setAssessmentComponents(rows => [...rows, { id: `assessment-${Date.now()}`, name: `Assessment ${rows.length + 1}`, maxMarks: 10, category: 'continuous', order: rows.length + 1 }])} disabled={assessmentComponents.length >= 20} className="rounded-lg border border-dashed border-[#0F766E] px-4 py-2 text-xs font-semibold text-[#0F766E] disabled:opacity-40">+ Add assessment</button>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-xl bg-teal-50 p-4 text-xs sm:grid-cols-3">
            <div><span className="text-teal-800">Continuous total</span><strong className="mt-1 block text-lg text-teal-950">{continuousMax} marks</strong></div>
            <div><span className="text-teal-800">Final exam total</span><strong className="mt-1 block text-lg text-teal-950">{finalMax} marks</strong></div>
            <div><span className="text-teal-800">Combined maximum</span><strong className="mt-1 block text-lg text-teal-950">{maxCombined} marks</strong></div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">Minimum Pass Mark (%)</label>
            <input type="number" min={0} max={100} value={passMarkPercentage} onChange={event => setPassMarkPercentage(Number(event.target.value))} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-xs font-mono" />
          </div>

          <div className="pt-4 border-t border-[#E2E8F0] flex justify-end">
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={isReadOnly || isSaving}
              className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? 'Saving...' : 'Save Exam Rules'}
            </button>
          </div>
        </div>
      )}
      {seatSheet && (
        <>
          <style>{`@page { size: A4; margin: 12mm; } @media print { body * { visibility: hidden !important; } .exam-seat-print, .exam-seat-print * { visibility: visible !important; } .exam-seat-print { position: absolute !important; inset: 0 !important; overflow: visible !important; background: white !important; padding: 12mm !important; } .exam-seat-print .no-print { display: none !important; } }`}</style>
          <section className="exam-seat-print fixed inset-0 z-50 overflow-auto bg-white p-6">
            <div className="no-print mb-4 flex justify-end"><button type="button" onClick={() => setSeatSheet(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold">Close print preview</button></div>
            <header className="mb-6 border-b-2 border-slate-900 pb-4 text-center">
              <h1 className="text-xl font-bold">{school?.name}</h1>
              <h2 className="mt-2 text-lg font-semibold">{seatSheet.schedule.examName} · Seating Plan</h2>
              <p className="mt-1 text-sm">{seatSheet.schedule.className} · {seatSheet.schedule.subjectName}</p>
              <p className="mt-1 text-xs">{seatSheet.schedule.examDate} · {String(seatSheet.schedule.startTime).slice(0,5)}–{String(seatSheet.schedule.endTime).slice(0,5)} · Room {seatSheet.schedule.roomName}</p>
            </header>
            <table className="w-full border-collapse text-sm">
              <thead><tr><th className="border border-slate-500 p-2 text-left">Seat No.</th><th className="border border-slate-500 p-2 text-left">Student ID</th><th className="border border-slate-500 p-2 text-left">Student Name</th><th className="border border-slate-500 p-2 text-left">Signature</th></tr></thead>
              <tbody>{seatSheet.seats.map((seat: any) => <tr key={seat.id}><td className="border border-slate-500 p-2 font-bold">{seat.seatNumber}</td><td className="border border-slate-500 p-2">{seat.studentIdLabel}</td><td className="border border-slate-500 p-2">{seat.studentName}</td><td className="border border-slate-500 p-2">&nbsp;</td></tr>)}</tbody>
            </table>
            <p className="mt-5 text-right text-xs">Total assigned seats: {seatSheet.seats.length}</p>
          </section>
        </>
      )}
    </div>
  );
};
