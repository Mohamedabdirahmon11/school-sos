import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, BarChart3, BookOpen, ChevronLeft, ChevronRight, ClipboardList,
  Download, Filter, RefreshCw, Search, TrendingUp, Users
} from 'lucide-react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { getGradeLabel } from '../../lib/grading.ts';
import { ExamConfig, SchoolClass, Student, StudentMark, Subject } from '../../types/index.ts';

type WorkspaceMode = 'overview' | 'explorer' | 'analytics';
type Semester = 'Semester 1' | 'Semester 2';
type ClassComparison = {
  classId: string;
  className: string;
  average: number;
  passRate: number;
  studentsWithMarks: number;
};

interface AcademicResultsWorkspaceProps {
  mode: WorkspaceMode;
  classes: SchoolClass[];
  subjects: Subject[];
  students: Student[];
  marks: StudentMark[];
  classSubjectRows: Array<{ id: string; subject: Subject | null; teacher: { id: string; fullName: string } | null }>;
  selectedClassId: string;
  onClassChange: (classId: string) => void;
  selectedSemester: Semester;
  onSemesterChange: (semester: Semester) => void;
  examConfig: ExamConfig | null;
  classDataLoading: boolean;
}

const PAGE_SIZE = 20;

function average(values: number[]): number {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : 0;
}

function csvCell(value: unknown): string {
  return '"' + String(value ?? '').replace(/"/g, '""') + '"';
}

function displayName(student?: Student): string {
  return student ? [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ') : 'Unknown student';
}

export const AcademicResultsWorkspace: React.FC<AcademicResultsWorkspaceProps> = ({
  mode, classes, subjects, students, marks, classSubjectRows, selectedClassId,
  onClassChange, selectedSemester, onSemesterChange, examConfig
}) => {
  const { school } = useAuth();
  const [schoolStudentCount, setSchoolStudentCount] = useState(0);
  const [examSchedules, setExamSchedules] = useState<any[]>([]);
  const [classComparisons, setClassComparisons] = useState<ClassComparison[]>([]);
  const [otherSemesterMarks, setOtherSemesterMarks] = useState<StudentMark[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'student' | 'highest' | 'subject'>('student');
  const [page, setPage] = useState(1);
  const [academicYearFilter, setAcademicYearFilter] = useState(school?.academicYear || '');
  const [sectionFilter, setSectionFilter] = useState('');

  useEffect(() => {
    if (mode === 'explorer') return;
    let cancelled = false;
    setOverviewLoading(true);
    setOverviewError('');
    const load = async () => {
      try {
        const [allStudents, schedules] = await Promise.all([
          ApiClient.getAllStudents(),
          ApiClient.getExamSchedules()
        ]);
        const comparisons: ClassComparison[] = [];
        for (let index = 0; index < classes.length; index += 5) {
          const batch = classes.slice(index, index + 5);
          const results = await Promise.all(batch.map(async klass => {
            const rows = await ApiClient.getSemesterRankings(klass.id, selectedSemester);
            const eligible = rows.filter((row: any) => Number(row.subjectCount) > 0);
            return {
              classId: klass.id,
              className: `${klass.name} · ${klass.section || '—'}`,
              average: average(eligible.map((row: any) => Number(row.averagePercentage) || 0)),
              passRate: eligible.length ? Math.round(eligible.filter((row: any) => Number(row.averagePercentage) >= (examConfig?.passMarkPercentage || 50)).length / eligible.length * 100) : 0,
              studentsWithMarks: eligible.length
            };
          }));
          comparisons.push(...results);
        }
        if (!cancelled) {
          setSchoolStudentCount(allStudents.length);
          setExamSchedules(Array.isArray(schedules) ? schedules : []);
          setClassComparisons(comparisons.sort((a, b) => b.average - a.average));
        }
      } catch (error) {
        if (!cancelled) setOverviewError(error instanceof Error ? error.message : 'Academic overview could not be loaded.');
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [mode, classes, selectedSemester, examConfig?.passMarkPercentage]);

  const otherSemester: Semester = selectedSemester === 'Semester 1' ? 'Semester 2' : 'Semester 1';
  useEffect(() => {
    if (!selectedClassId || mode === 'explorer') {
      setOtherSemesterMarks([]);
      return;
    }
    let cancelled = false;
    ApiClient.getMarks(selectedClassId, undefined, otherSemester)
      .then(rows => { if (!cancelled) setOtherSemesterMarks(rows); })
      .catch(() => { if (!cancelled) setOtherSemesterMarks([]); });
    return () => { cancelled = true; };
  }, [selectedClassId, otherSemester, mode]);

  useEffect(() => { setPage(1); }, [search, subjectFilter, statusFilter, sortBy, selectedClassId, selectedSemester]);

  const availableAcademicYears = useMemo(() => [...new Set([
    ...classes.map(klass => klass.academicYear),
    ...marks.map(mark => mark.academicYear),
    school?.academicYear
  ].filter((year): year is string => Boolean(year)))].sort((a, b) => b.localeCompare(a)), [classes, marks, school?.academicYear]);
  useEffect(() => {
    if (!academicYearFilter && availableAcademicYears.length) setAcademicYearFilter(availableAcademicYears[0]);
  }, [academicYearFilter, availableAcademicYears]);
  const yearFilteredClasses = classes.filter(klass => !academicYearFilter || klass.academicYear === academicYearFilter);
  const availableSections = [...new Set(yearFilteredClasses.map(klass => klass.section).filter((section): section is string => Boolean(section)))].sort();
  const sectionFilteredClasses = yearFilteredClasses.filter(klass => !sectionFilter || klass.section === sectionFilter);
  useEffect(() => {
    if (sectionFilteredClasses.length && !sectionFilteredClasses.some(klass => klass.id === selectedClassId)) {
      onClassChange(sectionFilteredClasses[0].id);
    }
  }, [academicYearFilter, sectionFilter, classes, selectedClassId]);
  const yearFilteredMarks = marks.filter(mark => !academicYearFilter || mark.academicYear === academicYearFilter);
  const studentById = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const subjectById = useMemo(() => new Map(subjects.map(subject => [subject.id, subject])), [subjects]);
  const approvedMarks = useMemo(() => yearFilteredMarks.filter(mark => mark.status === 'approved'), [yearFilteredMarks]);
  const activeSubjects = useMemo(() => classSubjectRows.filter(row => row.subject).map(row => row.subject as Subject), [classSubjectRows]);
  const subjectStats = useMemo(() => {
    const rows = (activeSubjects.length ? activeSubjects : subjects).map(subject => {
      const subjectMarks = approvedMarks.filter(mark => mark.subjectId === subject.id);
      return { subject, average: average(subjectMarks.map(mark => Number(mark.percentage) || 0)), count: subjectMarks.length, passRate: subjectMarks.length ? Math.round(subjectMarks.filter(mark => Number(mark.percentage) >= (examConfig?.passMarkPercentage || 50)).length / subjectMarks.length * 100) : 0 };
    }).filter(row => row.count > 0).sort((a, b) => b.average - a.average);
    return rows;
  }, [activeSubjects, subjects, approvedMarks, examConfig?.passMarkPercentage]);

  const classRankings = classComparisons.find(row => row.classId === selectedClassId);
  const currentAverage = average(approvedMarks.map(mark => Number(mark.percentage) || 0));
  const passCount = approvedMarks.filter(mark => Number(mark.percentage) >= (examConfig?.passMarkPercentage || 50)).length;
  const failCount = approvedMarks.length - passCount;
  const passRate = approvedMarks.length ? Math.round(passCount / approvedMarks.length * 100) : 0;
  const failRate = approvedMarks.length ? 100 - passRate : 0;
  const otherSemesterApproved = otherSemesterMarks.filter(mark => mark.status === 'approved' && (!academicYearFilter || mark.academicYear === academicYearFilter));
  const otherSemesterAverage = average(otherSemesterApproved.map(mark => Number(mark.percentage) || 0));
  const selectedClass = classes.find(klass => klass.id === selectedClassId);

  const filteredMarks = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const rows = yearFilteredMarks.filter(mark => {
      const student = studentById.get(mark.studentId);
      const subject = subjectById.get(mark.subjectId);
      const searchMatch = !normalized || [
        displayName(student), student?.studentId, student?.id, subject?.name, subject?.code, mark.id
      ].some(value => String(value || '').toLowerCase().includes(normalized));
      return searchMatch
        && (!subjectFilter || mark.subjectId === subjectFilter)
        && (statusFilter === 'all' || mark.status === statusFilter);
    });
    rows.sort((a, b) => {
      if (sortBy === 'highest') return (Number(b.percentage) || 0) - (Number(a.percentage) || 0);
      if (sortBy === 'subject') return String(subjectById.get(a.subjectId)?.name || '').localeCompare(String(subjectById.get(b.subjectId)?.name || ''));
      return displayName(studentById.get(a.studentId)).localeCompare(displayName(studentById.get(b.studentId)));
    });
    return rows;
  }, [yearFilteredMarks, search, subjectFilter, statusFilter, sortBy, studentById, subjectById]);

  const totalPages = Math.max(1, Math.ceil(filteredMarks.length / PAGE_SIZE));
  const visibleMarks = filteredMarks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportCsv = () => {
    const header = ['Student name', 'Student ID', 'Subject', 'Semester', 'Raw total', 'Percentage', 'Grade', 'Status'];
    const rows = filteredMarks.map(mark => {
      const student = studentById.get(mark.studentId);
      const subject = subjectById.get(mark.subjectId);
      return [displayName(student), student?.studentId || '', subject?.name || mark.subjectId, mark.semester, mark.totalMarks, mark.percentage, getGradeLabel(Number(mark.percentage), school?.gradingScale), mark.status];
    });
    const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `school-results-${selectedClass?.classCode || 'class'}-${selectedSemester.toLowerCase().replace(/ /g, '-')}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const title = mode === 'overview' ? 'Academic Overview' : mode === 'explorer' ? 'Results Explorer' : 'Performance Analytics';
  const subtitle = mode === 'overview'
    ? 'A live summary of this school’s academic results and assessment progress.'
    : mode === 'explorer'
      ? 'Search, filter, review and export approved and pending subject marks.'
      : 'Compare class and subject performance using approved marks only.';

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#132A29]">{title}</h2>
          <p className="mt-1 text-xs text-[#64748B]">{subtitle}</p>
          <p className="mt-1 text-[11px] font-semibold text-[#0F766E]">Academic year: {school?.academicYear || examConfig?.academicYear || 'Not configured'} · {selectedClass ? `${selectedClass.name} / ${selectedClass.section || 'Main'}` : 'Select a class'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={academicYearFilter} onChange={event => { setAcademicYearFilter(event.target.value); setSectionFilter(''); }} className="min-h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs">
            {availableAcademicYears.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
          <select value={sectionFilter} onChange={event => setSectionFilter(event.target.value)} className="min-h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs">
            <option value="">All sections</option>
            {availableSections.map(section => <option key={section} value={section}>{section}</option>)}
          </select>
          <select value={selectedClassId} onChange={event => onClassChange(event.target.value)} className="min-h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs">
            {sectionFilteredClasses.map(klass => <option key={klass.id} value={klass.id}>{klass.name} · {klass.section || 'Main'}</option>)}
          </select>
          <select value={selectedSemester} onChange={event => onSemesterChange(event.target.value as Semester)} className="min-h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs">
            <option value="Semester 1">Semester 1</option>
            <option value="Semester 2">Semester 2</option>
          </select>
        </div>
      </div>

      {overviewError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{overviewError}</div>}

      {mode === 'explorer' ? (
        <section className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-[#94A3B8]" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search student name, student ID, subject or mark ID..." className="min-h-10 w-full rounded-lg border border-[#CBD5E1] py-2 pl-9 pr-3 text-xs" />
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={subjectFilter} onChange={event => setSubjectFilter(event.target.value)} className="min-h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs">
                <option value="">All subjects</option>
                {(activeSubjects.length ? activeSubjects : subjects).map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="min-h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs">
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="form_teacher_submitted">Awaiting admin approval</option>
                <option value="approved">Approved</option>
              </select>
              <select value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)} className="min-h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs">
                <option value="student">Sort: Student</option>
                <option value="highest">Sort: Highest mark</option>
                <option value="subject">Sort: Subject</option>
              </select>
              <button type="button" onClick={exportCsv} disabled={!filteredMarks.length} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Download className="h-3.5 w-3.5" />Export CSV</button>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#64748B]"><span>{filteredMarks.length} result records · {approvedMarks.length} approved in this class and semester</span><span>Page {page} of {totalPages}</span></div>
          {classDataLoading ? (
            <div className="space-y-2 rounded-xl border border-[#E2E8F0] p-4"><div className="h-5 w-1/3 animate-pulse rounded bg-slate-100" /><div className="h-10 animate-pulse rounded bg-slate-100" /><div className="h-10 animate-pulse rounded bg-slate-100" /><div className="h-10 animate-pulse rounded bg-slate-100" /></div>
          ) : filteredMarks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-12 text-center"><Filter className="mx-auto h-6 w-6 text-[#94A3B8]" /><p className="mt-2 text-sm font-semibold text-[#334155]">No results match these filters</p><p className="mt-1 text-xs text-[#64748B]">Try another student, subject or approval status.</p></div>
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-xl border border-[#E2E8F0] md:block">
                <table className="w-full min-w-[850px] text-left text-xs">
                  <thead className="bg-[#F1F6F5] text-[10px] uppercase tracking-wide text-[#64748B]"><tr><th className="px-3 py-3">Student</th><th className="px-3 py-3">Student ID</th><th className="px-3 py-3">Subject</th><th className="px-3 py-3">Semester</th><th className="px-3 py-3 text-right">Total</th><th className="px-3 py-3 text-right">%</th><th className="px-3 py-3">Grade</th><th className="px-3 py-3">Status</th></tr></thead>
                  <tbody className="divide-y divide-[#E2E8F0]">{visibleMarks.map(mark => { const student = studentById.get(mark.studentId); const subject = subjectById.get(mark.subjectId); return <tr key={mark.id} className="hover:bg-[#F8FBFA]"><td className="px-3 py-3 font-semibold text-[#132A29]">{displayName(student)}</td><td className="px-3 py-3 font-mono text-[#64748B]">{student?.studentId || '—'}</td><td className="px-3 py-3">{subject?.name || 'Unknown subject'}</td><td className="px-3 py-3">{mark.semester}</td><td className="px-3 py-3 text-right font-mono">{mark.totalMarks}</td><td className="px-3 py-3 text-right font-mono font-bold">{mark.status === 'approved' ? `${mark.percentage}%` : '—'}</td><td className="px-3 py-3">{mark.status === 'approved' ? getGradeLabel(Number(mark.percentage), school?.gradingScale) : '—'}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${mark.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : mark.status === 'form_teacher_submitted' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{mark.status.replace(/_/g, ' ')}</span></td></tr>; })}</tbody>
                </table>
              </div>
              <div className="space-y-2 md:hidden">{visibleMarks.map(mark => { const student = studentById.get(mark.studentId); const subject = subjectById.get(mark.subjectId); return <article key={mark.id} className="rounded-xl border border-[#E2E8F0] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#132A29]">{displayName(student)}</p><p className="mt-0.5 text-[10px] text-[#64748B]">{student?.studentId || '—'} · {subject?.name || 'Unknown subject'}</p></div><span className="text-sm font-bold text-[#0F766E]">{mark.status === 'approved' ? `${mark.percentage}%` : '—'}</span></div><div className="mt-2 flex items-center justify-between text-[10px] text-[#64748B]"><span>{mark.semester} · {mark.totalMarks} marks</span><span className="capitalize">{mark.status.replace(/_/g, ' ')}</span></div></article>; })}</div>
              <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-3"><span className="text-[11px] text-[#64748B]">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredMarks.length)} of {filteredMarks.length}</span><div className="flex gap-2"><button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#CBD5E1] px-3 text-xs disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />Previous</button><button type="button" onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#CBD5E1] px-3 text-xs disabled:opacity-40">Next<ChevronRight className="h-3.5 w-3.5" /></button></div></div>
            </>
          )}
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard icon={<Users className="h-4 w-4" />} label="School students" value={overviewLoading ? '…' : schoolStudentCount.toLocaleString()} detail={`${students.length} in selected class`} />
            <MetricCard icon={<ClipboardList className="h-4 w-4" />} label="Exam schedules" value={overviewLoading ? '…' : examSchedules.filter(row => !academicYearFilter || row.academicYear === academicYearFilter).length.toLocaleString()} detail={`${examSchedules.filter(row => row.status === 'published' && (!academicYearFilter || row.academicYear === academicYearFilter)).length} published`} />
            <MetricCard icon={<BookOpen className="h-4 w-4" />} label="Classes / subjects" value={`${yearFilteredClasses.length} / ${subjects.length}`} detail={`${activeSubjects.length} assigned to this class`} />
            <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Class average" value={approvedMarks.length ? `${currentAverage}%` : '—'} detail={`${approvedMarks.length} approved subject marks`} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm xl:col-span-2">
              <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-[#132A29]">Subject performance</h3><p className="mt-1 text-[11px] text-[#64748B]">Approved marks · {selectedSemester}</p></div><span className="text-[10px] font-semibold text-[#0F766E]">{selectedClass?.name || 'Selected class'}</span></div>
              {subjectStats.length ? <div className="mt-4 space-y-4">{subjectStats.map(row => <div key={row.subject.id}><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-[#334155]">{row.subject.name}</span><span className="font-mono font-bold text-[#0F766E]">{row.average}% <span className="font-normal text-[#94A3B8]">· {row.count} marks</span></span></div><div className="h-2 overflow-hidden rounded-full bg-[#E9F0EF]"><div className="h-full rounded-full bg-[#0F766E]" style={{ width: `${Math.max(0, Math.min(100, row.average))}%` }} /></div></div>)}</div> : <EmptyPanel text="No approved subject marks are available for this class and semester yet." />}
            </section>
            <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-[#132A29]">Pass and fail rate</h3><p className="mt-1 text-[11px] text-[#64748B]">Based on approved subject marks only</p>
              {approvedMarks.length ? <><div className="mt-5 flex items-end justify-between"><div><p className="text-3xl font-bold text-emerald-700">{passRate}%</p><p className="text-[11px] text-[#64748B]">Pass rate</p></div><div className="text-right"><p className="text-2xl font-bold text-rose-700">{failRate}%</p><p className="text-[11px] text-[#64748B]">Below pass mark</p></div></div><div className="mt-3 flex h-3 overflow-hidden rounded-full bg-rose-100"><div className="h-full bg-emerald-500" style={{ width: `${passRate}%` }} /></div><div className="mt-3 flex justify-between text-[11px] text-[#64748B]"><span>{passCount} passing marks</span><span>{failCount} below pass mark</span></div></> : <EmptyPanel text="Pass and fail rates appear after marks are approved." />}
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm"><h3 className="text-sm font-bold text-[#132A29]">Semester comparison</h3><p className="mt-1 text-[11px] text-[#64748B]">Approved subject-mark averages for the selected class</p><div className="mt-4 grid grid-cols-2 gap-3"><SemesterMetric label={selectedSemester} value={currentAverage} count={approvedMarks.length} /><SemesterMetric label={otherSemester} value={otherSemesterAverage} count={otherSemesterMarks.filter(mark => mark.status === 'approved').length} /></div></section>
            <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm"><h3 className="text-sm font-bold text-[#132A29]">Class performance comparison</h3><p className="mt-1 text-[11px] text-[#64748B]">{academicYearFilter || 'All years'} · {selectedSemester} · approved rankings</p>{overviewLoading ? <EmptyPanel text="Loading class comparisons…" /> : classComparisons.some(row => yearFilteredClasses.some(klass => klass.id === row.classId)) ? <div className="mt-3 space-y-3">{classComparisons.filter(row => sectionFilteredClasses.some(klass => klass.id === row.classId)).slice(0, 8).map(row => <div key={row.classId}><div className="mb-1 flex items-center justify-between gap-3 text-[11px]"><span className="font-semibold text-[#334155]">{row.className}</span><span className="font-mono font-bold text-[#0F766E]">{row.studentsWithMarks ? `${row.average}%` : 'No marks'}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#E9F0EF]"><div className="h-full rounded-full bg-[#2A8C82]" style={{ width: `${Math.max(0, Math.min(100, row.average))}%` }} /></div></div>)}</div> : <EmptyPanel text="No class rankings are available yet." />}</section>
          </div>

          {mode === 'analytics' && <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#0F766E]" /><h3 className="text-sm font-bold text-[#132A29]">Students needing academic support</h3></div><p className="mt-1 text-[11px] text-[#64748B]">Students with approved marks below the configured pass percentage in this class.</p>{approvedMarks.length ? <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{students.filter(student => { const own = approvedMarks.filter(mark => mark.studentId === student.id); return own.length > 0 && average(own.map(mark => Number(mark.percentage) || 0)) < (examConfig?.passMarkPercentage || 50); }).slice(0, 12).map(student => { const own = approvedMarks.filter(mark => mark.studentId === student.id); return <div key={student.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3"><div><p className="text-xs font-semibold text-[#334155]">{displayName(student)}</p><p className="mt-0.5 text-[10px] text-[#64748B]">{student.studentId}</p></div><span className="text-sm font-bold text-amber-800">{average(own.map(mark => Number(mark.percentage) || 0))}%</span></div>; })}</div> : <EmptyPanel text="Academic support indicators appear after approved marks are available." />}</section>}
        </>
      )}
    </div>
  );
};

const MetricCard: React.FC<{ icon: React.ReactNode; label: string; value: string; detail: string }> = ({ icon, label, value, detail }) => (
  <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-[#0F766E]">{icon}<span className="text-[11px] font-semibold text-[#64748B]">{label}</span></div><p className="mt-3 text-2xl font-bold tracking-tight text-[#132A29]">{value}</p><p className="mt-1 text-[10px] text-[#94A3B8]">{detail}</p></div>
);

const SemesterMetric: React.FC<{ label: string; value: number; count: number }> = ({ label, value, count }) => (
  <div className="rounded-xl bg-[#F5F9F8] p-3"><p className="text-[11px] font-semibold text-[#64748B]">{label}</p><p className="mt-1 text-2xl font-bold text-[#132A29]">{count ? `${value}%` : '—'}</p><p className="mt-1 text-[10px] text-[#94A3B8]">{count} approved marks</p></div>
);

const EmptyPanel: React.FC<{ text: string }> = ({ text }) => <div className="mt-3 rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-5 text-center text-xs text-[#64748B]">{text}</div>;
