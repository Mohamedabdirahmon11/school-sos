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
import { SchoolClass, Subject, Student, ExamConfig, StudentMark } from '../../types/index.ts';
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
  AlertCircle
} from 'lucide-react';

export const ExamsResultsView: React.FC = () => {
  const { school, isReadOnly, t } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [activeTab, setActiveTab] = useState<'entry_approval' | 'sem1_rankings' | 'sem2_yearly' | 'config'>('entry_approval');
  const [selectedSemester, setSelectedSemester] = useState<'Semester 1' | 'Semester 2'>('Semester 1');

  // Exam Config State
  const [examConfig, setExamConfig] = useState<ExamConfig | null>(null);
  const [smallExamMax, setSmallExamMax] = useState(10);
  const [bigExamMax, setBigExamMax] = useState(10);
  const [passMarkPercentage, setPassMarkPercentage] = useState(50);

  // Marks Table State
  const [marks, setMarks] = useState<StudentMark[]>([]);
  const [marksInput, setMarksInput] = useState<Record<string, { small: number; big: number; remarks: string }>>({});
  const [semRankings, setSemRankings] = useState<any[]>([]);
  const [yearlyRankings, setYearlyRankings] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Load classes, subjects, exam config
  useEffect(() => {
    if (!school) return;
    setIsLoading(true);
    Promise.all([
      ApiClient.getClasses(),
      ApiClient.getSubjects(),
      ApiClient.getExamConfig()
    ]).then(([cls, subs, conf]) => {
      setClasses(cls);
      if (cls.length > 0) setSelectedClassId(cls[0].id);
      setSubjects(subs);
      if (subs.length > 0) setSelectedSubjectId(subs[0].id);
      if (conf) {
        setExamConfig(conf);
        setSmallExamMax(conf.smallExamMax || 10);
        setBigExamMax(conf.bigExamMax || 10);
        setPassMarkPercentage(conf.passMarkPercentage || 50);
      }
    }).finally(() => setIsLoading(false));
  }, [school]);

  // Load students and marks for selected class & subject
  const loadClassData = async () => {
    if (!selectedClassId) return;
    try {
      const [stdList, existingMarks] = await Promise.all([
        ApiClient.getAllStudents(selectedClassId),
        ApiClient.getMarks(selectedClassId, selectedSubjectId || undefined, selectedSemester)
      ]);

      setStudents(stdList);
      setMarks(existingMarks);

      const inputMap: Record<string, { small: number; big: number; remarks: string }> = {};
      for (const std of stdList) {
        const m = existingMarks.find(em => em.studentId === std.id && em.subjectId === selectedSubjectId);
        inputMap[std.id] = {
          small: m ? m.smallExamMarks : 0,
          big: m ? m.bigExamMarks : 0,
          remarks: m?.teacherRemarks || ''
        };
      }
      setMarksInput(inputMap);

      // Load rankings
      if (activeTab === 'sem1_rankings') {
        const ranks = await ApiClient.getSemesterRankings(selectedClassId, 'Semester 1');
        setSemRankings(ranks);
      } else if (activeTab === 'sem2_yearly') {
        const yearly = await ApiClient.getYearlyRankings(selectedClassId);
        setYearlyRankings(yearly);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadClassData();
  }, [selectedClassId, selectedSubjectId, selectedSemester, activeTab]);

  // Save Exam Config
  const handleSaveConfig = async () => {
    if (isReadOnly) return;
    setIsSaving(true);
    try {
      const updated = await ApiClient.updateExamConfig({
        smallExamMax,
        bigExamMax,
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

  // Submit Marks
  const handleSaveMarks = async (status: 'draft' | 'submitted') => {
    if (isReadOnly || !selectedClassId || !selectedSubjectId) return;
    setIsSaving(true);
    try {
      const formattedMarks = students.map(std => ({
        studentId: std.id,
        smallExamMarks: Number(marksInput[std.id]?.small || 0),
        bigExamMarks: Number(marksInput[std.id]?.big || 0),
        teacherRemarks: marksInput[std.id]?.remarks || '',
        status
      }));

      await ApiClient.saveMarks(selectedClassId, selectedSubjectId, selectedSemester, formattedMarks);
      setNotice(status === 'submitted' ? 'Marks submitted for Administrator Approval!' : 'Marks saved as Draft.');
      await loadClassData();
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setNotice(err.message || 'Failed to save marks.');
    } finally {
      setIsSaving(false);
    }
  };

  // Admin Approve All Submitted Marks
  const handleApproveAll = async () => {
    if (isReadOnly) return;
    const pendingIds = marks.filter(m => m.status === 'submitted').map(m => m.id);
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

  const selectedClass = classes.find(c => c.id === selectedClassId);
  const selectedSubject = subjects.find(s => s.id === selectedSubjectId);
  const maxCombined = smallExamMax + bigExamMax;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#132A29] flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-[#0F766E]" />
            {t('exams_results')}
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Percentage-based academic grading with Small Exam + Big Exam structure and semester rankings.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-[#F1F5F9] p-1 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('entry_approval')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'entry_approval' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
            }`}
          >
            Mark Entry & Approval
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
          <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Select Class</label>
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.section})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Select Subject</label>
              <select
                value={selectedSubjectId}
                onChange={e => setSelectedSubjectId(e.target.value)}
                className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              >
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Academic Semester</label>
              <select
                value={selectedSemester}
                onChange={e => setSelectedSemester(e.target.value as any)}
                className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              >
                <option value="Semester 1">Semester 1</option>
                <option value="Semester 2">Semester 2</option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => handleSaveMarks('draft')}
                disabled={isReadOnly || isSaving || students.length === 0}
                className="flex-1 py-2 px-3 text-xs font-semibold text-[#334155] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => handleSaveMarks('submitted')}
                disabled={isReadOnly || isSaving || students.length === 0}
                className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg transition-colors shadow-sm"
              >
                Submit Marks
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-teal-100 bg-teal-50 px-4 py-3 text-xs text-teal-900">
            <strong>Selected results:</strong> {selectedClass ? `${selectedClass.name} · Section ${selectedClass.section}` : 'No class selected'} · {selectedSubject ? `${selectedSubject.name} (${selectedSubject.code})` : 'No subject selected'} · {selectedSemester}
            <span className="ml-2 text-teal-700">{students.length} students loaded</span>
          </div>

          {/* Mark Scheme Guidance Banner */}
          <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl flex items-center justify-between text-xs text-teal-900">
            <span className="font-medium">
              Maximum Scores: Small Exam ({smallExamMax} pts) + Big Exam ({bigExamMax} pts) = Total ({maxCombined} pts).
              Percentage = (Score / {maxCombined}) × 100%. Pass mark: {passMarkPercentage}%.
            </span>
            <button
              type="button"
              onClick={handleApproveAll}
              disabled={isReadOnly}
              className="px-3 py-1.5 bg-[#0B2B2A] hover:bg-black text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 shadow-xs"
            >
              <Lock className="w-3.5 h-3.5 text-amber-300" />
              Approve & Lock All
            </button>
          </div>

          {/* Marks Grading Table */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
            {students.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B]">
                No students enrolled in this class.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#132A29]">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase font-semibold text-[#64748B]">
                    <tr>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4 text-center">Small Exam (Max {smallExamMax})</th>
                      <th className="py-3 px-4 text-center">Big Exam (Max {bigExamMax})</th>
                      <th className="py-3 px-4 text-center font-bold">Total ({maxCombined})</th>
                      <th className="py-3 px-4 text-center font-bold">Percentage (%)</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4">Teacher Remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {students.map(std => {
                      const inp = marksInput[std.id] || { small: 0, big: 0, remarks: '' };
                      const mRecord = marks.find(m => m.studentId === std.id && m.subjectId === selectedSubjectId);
                      const isApproved = mRecord?.status === 'approved';
                      const total = Number(inp.small) + Number(inp.big);
                      const percentage = maxCombined > 0 ? Math.round(((total / maxCombined) * 100) * 100) / 100 : 0;
                      const isPassing = percentage >= passMarkPercentage;

                      return (
                        <tr key={std.id} className="hover:bg-[#F8FAFC]">
                          <td className="py-3 px-4">
                            <p className="font-semibold text-[#132A29]">{std.firstName} {std.middleName} {std.lastName}</p>
                            <p className="text-[11px] font-mono text-[#64748B]">{std.studentId}</p>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <input
                              type="number"
                              min={0}
                              max={smallExamMax}
                              step={0.5}
                              disabled={isApproved || isReadOnly}
                              value={inp.small}
                              onChange={e => {
                                const val = Math.min(smallExamMax, Math.max(0, parseFloat(e.target.value) || 0));
                                setMarksInput(prev => ({
                                  ...prev,
                                  [std.id]: { ...prev[std.id], small: val }
                                }));
                              }}
                              className="w-16 text-center text-xs py-1 px-2 border border-[#CBD5E1] rounded font-mono disabled:bg-slate-100 disabled:text-slate-500"
                            />
                          </td>
                          <td className="py-3 px-4 text-center">
                            <input
                              type="number"
                              min={0}
                              max={bigExamMax}
                              step={0.5}
                              disabled={isApproved || isReadOnly}
                              value={inp.big}
                              onChange={e => {
                                const val = Math.min(bigExamMax, Math.max(0, parseFloat(e.target.value) || 0));
                                setMarksInput(prev => ({
                                  ...prev,
                                  [std.id]: { ...prev[std.id], big: val }
                                }));
                              }}
                              className="w-16 text-center text-xs py-1 px-2 border border-[#CBD5E1] rounded font-mono disabled:bg-slate-100 disabled:text-slate-500"
                            />
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-[#132A29]">
                            {total}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              isPassing ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                            }`}>
                              {percentage}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isApproved ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <Lock className="w-3 h-3 text-emerald-600" />
                                Locked
                              </span>
                            ) : mRecord?.status === 'submitted' ? (
                              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                Pending Approval
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                Draft
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={inp.remarks}
                              disabled={isApproved || isReadOnly}
                              onChange={e => {
                                const val = e.target.value;
                                setMarksInput(prev => ({
                                  ...prev,
                                  [std.id]: { ...prev[std.id], remarks: val }
                                }));
                              }}
                              placeholder="Academic notes..."
                              className="w-full text-xs py-1 px-2 border border-[#CBD5E1] rounded disabled:bg-slate-100"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
              <p className="text-xs text-[#64748B]">
                Class results calculated as average percentages across all curriculum subjects.
              </p>
              <p className="mt-1 text-xs font-semibold text-[#0F766E]">
                Class: {selectedClass ? `${selectedClass.name} · Section ${selectedClass.section}` : 'Select a class'}
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
              <p className="text-xs text-[#64748B]">
                Combines both semesters to produce yearly subject percentages and final class ranking.
              </p>
              <p className="mt-1 text-xs font-semibold text-[#0F766E]">
                Class: {selectedClass ? `${selectedClass.name} · Section ${selectedClass.section}` : 'Select a class'}
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

      {/* TAB 4: EXAM STRUCTURE CONFIGURATION */}
      {activeTab === 'config' && (
        <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm max-w-2xl space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#132A29]">Exam Configuration & Maximum Marks</h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Set the maximum marks for Small Exam and Big Exam according to school policy.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">Small Exam Maximum Marks</label>
              <input
                type="number"
                min={1}
                max={100}
                value={smallExamMax}
                onChange={e => setSmallExamMax(Number(e.target.value))}
                className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg font-mono focus:ring-2 focus:ring-[#0F766E]"
              />
              <p className="text-[11px] text-[#64748B] mt-1">Default is 10 marks.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">Big Exam Maximum Marks</label>
              <input
                type="number"
                min={1}
                max={100}
                value={bigExamMax}
                onChange={e => setBigExamMax(Number(e.target.value))}
                className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg font-mono focus:ring-2 focus:ring-[#0F766E]"
              />
              <p className="text-[11px] text-[#64748B] mt-1">Default is 10 marks.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">Minimum Pass Mark (%)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={passMarkPercentage}
                onChange={e => setPassMarkPercentage(Number(e.target.value))}
                className="w-full text-xs py-2 px-3 border border-[#CBD5E1] rounded-lg font-mono focus:ring-2 focus:ring-[#0F766E]"
              />
              <p className="text-[11px] text-[#64748B] mt-1">Default is 50% pass mark.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">Combined Maximum Score</label>
              <div className="py-2 px-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-xs font-mono font-bold text-[#132A29]">
                {smallExamMax + bigExamMax} Points = 100%
              </div>
            </div>
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
    </div>
  );
};
