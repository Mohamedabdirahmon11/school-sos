/**
 * Classes & Subjects Configuration for School Admin
 * Grade levels, sections, room assignments, capacities, and curriculum subjects
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { SchoolBranch, SchoolClass, Subject, Teacher } from '../../types/index.ts';
import { Layers, BookOpen, Plus, X, CheckCircle2, Upload, Search, Archive, ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { ClassBulkImportWizard } from './ClassBulkImportWizard.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { formatMoney } from '../../lib/money.ts';

export const ClassesSubjectsView: React.FC = () => {
  const { school, isReadOnly, t } = useAuth();
  const classLoad = useApi(() => Promise.all([
    ApiClient.getClasses(), ApiClient.getSubjects(school?.id), ApiClient.getBranches(), ApiClient.getTeachers()
  ]), [school?.id], Boolean(school));
  const [classRows, subjectRows, branchRows, teacherRows] = classLoad.data || [[], [], [], []];
  const classes: SchoolClass[] = Array.isArray(classRows) ? classRows.filter(item => !item.isArchived) : [];
  const subjects: Subject[] = Array.isArray(subjectRows) ? subjectRows : [];
  const branches: SchoolBranch[] = Array.isArray(branchRows) ? branchRows : [];
  const teachers: Teacher[] = Array.isArray(teacherRows) ? teacherRows : [];
  const [branchId, setBranchId] = useState('');
  const [formTeacherId, setFormTeacherId] = useState('');
  const [classSearch, setClassSearch] = useState('');
  const [classBranchFilter, setClassBranchFilter] = useState('');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [showClassModal, setShowClassModal] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const [detailError, setDetailError] = useState('');
  const detailLoad = useApi(() => ApiClient.getClassDetails(selectedClassId, { page: studentPage, pageSize: 20, search: studentSearch }), [school?.id, selectedClassId, studentPage, studentSearch], Boolean(selectedClassId && school));

  // New Class Form State
  const [className, setClassName] = useState('');
  const [gradeLevel, setGradeLevel] = useState(10);
  const [classShift, setClassShift] = useState<1 | 2>(1);
  const [availableShiftCount, setAvailableShiftCount] = useState<1 | 2>(1);
  const [section, setSection] = useState('A');
  const [roomNumber, setRoomNumber] = useState('Room 101');
  const [capacity, setCapacity] = useState(school?.defaultClassCapacity || 40);
  const [monthlyFee, setMonthlyFee] = useState(50);

  // New Subject Form State
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectAssignments, setSubjectAssignments] = useState<Array<{ classId: string; teacherId?: string; periodsPerWeek: number; smallExamEnabled: boolean; bigExamEnabled: boolean }>>([]);

  const visibleClasses = classes
    .filter(klass => {
      const query = classSearch.trim().toLowerCase();
      const teacherName = teachers.find(teacher => teacher.userId === klass.classTeacherId)?.fullName || '';
      const matchesBranch = !classBranchFilter || klass.branchId === classBranchFilter;
      const matchesSearch = !query || [klass.name, klass.section, klass.roomNumber, teacherName]
        .some(value => String(value || '').toLowerCase().includes(query));
      return matchesBranch && matchesSearch;
    })
    .sort((a, b) => Number(a.gradeLevel || 0) - Number(b.gradeLevel || 0)
      || String(a.branchId || '').localeCompare(String(b.branchId || ''))
      || Number(a.shift || 1) - Number(b.shift || 1)
      || String(a.section || '').localeCompare(String(b.section || ''), undefined, { numeric: true, sensitivity: 'base' })
      || a.name.localeCompare(b.name));
  const classGroups = visibleClasses.reduce<Array<{
    key: string; title: string; branchName: string; shiftName: string; items: SchoolClass[];
  }>>((groups, klass) => {
    const grade = Number(klass.gradeLevel || 0);
    const title = grade === 0 ? 'KG' : `Grade ${grade}`;
    const branchName = branches.find(branch => branch.id === klass.branchId)?.name || (klass.branchId ? 'Other branch' : 'Unassigned branch');
    const shiftName = Number(klass.shift) === 2 ? 'Afternoon shift' : 'Morning shift';
    const key = `${klass.branchId || 'unassigned'}:${grade}:${klass.shift || 1}`;
    let group = groups.find(item => item.key === key);
    if (!group) {
      group = { key, title, branchName, shiftName, items: [] };
      groups.push(group);
    }
    group.items.push(klass);
    return groups;
  }, []);
  const visibleSubjects = subjects
    .filter(subject => !subjectSearch.trim() || [subject.name, subject.code]
      .some(value => String(value || '').toLowerCase().includes(subjectSearch.trim().toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const fetchData = classLoad.retry;
  useEffect(() => {
    let active = true;
    ApiClient.getTimetableSettings()
      .then(settings => { if (active) setAvailableShiftCount(settings.shiftCount === 2 ? 2 : 1); })
      .catch(() => { if (active) setAvailableShiftCount(1); });
    return () => { active = false; };
  }, [school?.id]);
  useEffect(() => { if (!branchId && branches.length) setBranchId(branches[0].id); }, [branchId, branches]);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!className) return;
    try {
      const payload = {
        name: className,
        gradeLevel,
        shift: classShift,
        section,
        roomNumber,
        capacity,
        monthlyFee,
        branchId: branchId || undefined,
        classTeacherId: formTeacherId || null
      };
      if (editingClass) await ApiClient.updateClass(editingClass.id, payload);
      else await ApiClient.addClass(payload, school?.id);
      setShowClassModal(false);
      setEditingClass(null);
      setClassName('');
      setClassShift(1);
      setCapacity(school?.defaultClassCapacity || 40);
      setNotice(`Class "${className}" ${editingClass ? 'updated' : 'created'}.`);
      await fetchData();
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectName || !subjectCode) return;
    try {
      const payload = {
        name: subjectName,
        code: subjectCode,
        creditUnits: 0,
        department: 'General'
      };
      const savedSubject = editingSubject ? await ApiClient.updateSubject(editingSubject.id, payload) : await ApiClient.addSubject(payload, school?.id);
      await ApiClient.saveSubjectAssignments(savedSubject.id, subjectAssignments);
      setShowSubjectModal(false);
      setEditingSubject(null);
      setSubjectName('');
      setSubjectCode('');
      setNotice(`Subject "${subjectName}" added to curriculum.`);
      await fetchData();
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleArchiveClass = async (classId: string) => {
    if (!window.confirm('Archive this empty class? Archived classes are hidden from the active list.')) return;
    setDetailError('');
    try {
      await ApiClient.deleteClass(classId);
      setSelectedClassId('');
      setNotice('Class archived.');
      await fetchData();
      setTimeout(() => setNotice(null), 3000);
    } catch (error) { setDetailError(error instanceof Error ? error.message : 'Unable to archive this class.'); }
  };

  if (classLoad.loading) return <div className="p-6 space-y-4" aria-label="Loading classes"><div className="h-8 w-1/3 animate-pulse rounded bg-slate-200" /><div className="h-48 animate-pulse rounded-xl bg-white" /></div>;
  if (classLoad.error) return <ErrorState error={classLoad.error} onRetry={classLoad.retry} />;
  return (
    <div className="mx-auto min-w-0 w-full max-w-[1600px] space-y-6 p-5 md:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[#102522]">Classes & Subjects</h1>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.85fr)] gap-6">
        {/* Grade and section hierarchy */}
        <section aria-label="Classes and sections" className="min-w-0 space-y-4 rounded-2xl border border-[#DCE7E4] bg-white p-5 shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-[#132A29]">
                <Layers className="h-5 w-5 text-[#0F766E]" /> Classes & Sections
              </h2>
              <p className="mt-1 text-xs text-slate-500">{classes.length} active class sections · grouped by grade, branch and shift</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowBulkImport(true)} disabled={isReadOnly}
                className="inline-flex items-center gap-2 rounded-xl border border-[#CBD5E1] px-3 py-2 text-xs font-semibold text-[#334155] hover:bg-slate-50 disabled:opacity-50">
                <Upload className="h-4 w-4 text-[#0F766E]" /> {t('bulk_import')}
              </button>
              <button type="button" onClick={() => { setEditingClass(null); setCapacity(school?.defaultClassCapacity || 40); setFormTeacherId(''); setShowClassModal(true); }}
                disabled={isReadOnly} className="inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0D655E] disabled:opacity-50">
                <Plus className="h-4 w-4" /> Create class
              </button>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_190px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={classSearch} onChange={event => setClassSearch(event.target.value)} placeholder="Search grade, section, room or form teacher"
                aria-label="Search classes and sections" className="w-full rounded-xl border border-[#CBD5E1] bg-[#F8FBFA] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#0F766E]" />
            </label>
            <select aria-label="Filter classes by branch" value={classBranchFilter} onChange={event => setClassBranchFilter(event.target.value)}
              className="w-full rounded-xl border border-[#CBD5E1] bg-white px-3 py-2.5 text-sm">
              <option value="">All branches</option>
              {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </div>

          {classGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
              <Layers className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">No classes found</p>
              <p className="mt-1 text-xs text-slate-500">Change the filters or create/import a class to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {classGroups.map(group => (
                <section key={group.key} className="overflow-hidden rounded-2xl border border-[#DCE7E4]">
                  <header className="flex flex-wrap items-center justify-between gap-2 bg-[#F3F8F6] px-4 py-3">
                    <div>
                      <h3 className="text-sm font-bold text-[#17332F]">{group.title}</h3>
                      <p className="mt-0.5 text-[11px] text-slate-500">{group.branchName} · {group.shiftName}</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#0F766E]">{group.items.length} section{group.items.length === 1 ? '' : 's'}</span>
                  </header>
                  <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
                    {group.items.map(klass => {
                      const formTeacher = teachers.find(teacher => teacher.userId === klass.classTeacherId);
                      return (
                        <article key={klass.id} className={`min-w-0 rounded-xl border p-3 transition ${selectedClassId === klass.id ? 'border-[#0F766E] bg-[#F0FDFA]' : 'border-slate-200 bg-white hover:border-teal-200 hover:bg-[#FAFCFB]'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <button type="button" onClick={() => { setSelectedClassId(klass.id); setStudentPage(1); }}
                              className="min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F766E]">
                              <span className="inline-flex rounded-lg bg-[#E7F4F0] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0F766E]">Section {klass.section || '—'}</span>
                              <p className="mt-2 truncate text-sm font-bold text-[#132A29]">{klass.name}</p>
                              <p className="mt-1 text-[11px] text-slate-500">{klass.roomNumber || 'Room not set'} · Capacity {klass.capacity} · {formatMoney(klass.monthlyFee, school?.currency)}</p>
                              <p className="mt-2 text-[11px] text-slate-600">Form Teacher: <span className="font-semibold text-slate-800">{formTeacher?.fullName || 'Not assigned'}</span></p>
                            </button>
                            <button type="button" disabled={isReadOnly} aria-label={`Edit ${klass.name}`}
                              onClick={() => { setEditingClass(klass); setClassName(klass.name); setGradeLevel(klass.gradeLevel); setClassShift(klass.shift === 2 ? 2 : 1); setSection(klass.section); setRoomNumber(klass.roomNumber || ''); setCapacity(klass.capacity); setMonthlyFee(klass.monthlyFee); setBranchId(klass.branchId || ''); setFormTeacherId(klass.classTeacherId || ''); setShowClassModal(true); }}
                              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-white hover:text-[#0F766E] disabled:opacity-50"><Pencil className="h-4 w-4" /></button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        {/* Curriculum subjects */}
        <section aria-label="Academic subjects" className="min-w-0 space-y-4 rounded-2xl border border-[#DCE7E4] bg-white p-5 shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-[#132A29]">
                <BookOpen className="h-5 w-5 text-[#0F766E]" /> Academic Subjects
              </h2>
              <p className="mt-1 text-xs text-slate-500">{subjects.length} subjects · class and teacher assignments are managed per subject</p>
            </div>
            <button type="button" onClick={() => { setEditingSubject(null); setSubjectAssignments([]); setSubjectName(''); setSubjectCode(''); setShowSubjectModal(true); }}
              disabled={isReadOnly} className="inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0D655E] disabled:opacity-50">
              <Plus className="h-4 w-4" /> Add subject
            </button>
          </header>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={subjectSearch} onChange={event => setSubjectSearch(event.target.value)} placeholder="Search subject name or code"
              aria-label="Search subjects" className="w-full rounded-xl border border-[#CBD5E1] bg-[#F8FBFA] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#0F766E]" />
          </label>
          {visibleSubjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">No subjects found</p>
              <p className="mt-1 text-xs text-slate-500">Add a subject or adjust your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {visibleSubjects.map(subject => {
                const assignedTeachers = (subject.assignedTeacherIds || [])
                  .map(id => teachers.find(teacher => teacher.id === id)?.fullName)
                  .filter(Boolean);
                return (
                  <article key={subject.id} className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-teal-200">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-[#132A29]">{subject.name}</h3>
                      <span className="mt-1 inline-flex rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600">{subject.code}</span>
                      <p className="mt-2 text-[11px] text-slate-500">{assignedTeachers.length ? assignedTeachers.join(', ') : 'Teachers are assigned per class in subject settings.'}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" disabled={isReadOnly} aria-label={`Edit ${subject.name}`}
                        onClick={async () => { try { const current = await ApiClient.getSubjectAssignments(subject.id); setSubjectAssignments(current); setEditingSubject(subject); setSubjectName(subject.name); setSubjectCode(subject.code); setShowSubjectModal(true); } catch (error) { setDetailError(error instanceof Error ? error.message : 'Unable to load subject assignments.'); }}}
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-[#0F766E] disabled:opacity-50"><Pencil className="h-4 w-4" /></button>
                      <button type="button" disabled={isReadOnly} aria-label={`Delete ${subject.name}`}
                        onClick={async () => { if (!window.confirm(`Delete subject ${subject.name}?`)) return; try { await ApiClient.deleteSubject(subject.id); await fetchData(); } catch (error) { setDetailError(error instanceof Error ? error.message : 'Unable to delete subject.'); }}}
                        className="rounded-lg border border-red-100 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <p className="rounded-xl bg-[#F3F8F6] p-3 text-[11px] leading-relaxed text-slate-600">
            Open a subject to assign it to one or more classes, choose the subject teacher for each class, set weekly periods, and enable small or big exam components. Credit units and departments are not required.
          </p>
        </section>
      </div>

      {selectedClassId && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4" role="dialog" aria-modal="true" aria-label="Class details">
          <section className="bg-white w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-4 md:p-6 space-y-5">
            <header className="flex items-center justify-between gap-3 border-b pb-3">
              <div className="flex items-center gap-2"><button onClick={() => setSelectedClassId('')} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Back to classes"><ArrowLeft className="w-4 h-4" /></button><div><h2 className="font-bold text-[#132A29]">{detailLoad.data?.class.name || 'Class details'}</h2><p className="text-xs text-slate-500">Students, subjects, timetable and attendance</p></div></div>
              <button disabled={isReadOnly || !detailLoad.data || detailLoad.data.students.total > 0} onClick={() => void handleArchiveClass(selectedClassId)} className="px-3 py-2 text-xs rounded-lg border disabled:opacity-50" title={detailLoad.data?.students.total ? 'Move students before archiving' : 'Archive class'}><Archive className="w-4 h-4 inline mr-1" />Archive</button>
            </header>
            {detailError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{detailError}</p>}
            {detailLoad.loading && <div className="space-y-3 animate-pulse"><div className="h-8 bg-slate-100 rounded"/><div className="h-36 bg-slate-100 rounded"/></div>}
            {detailLoad.error && <ErrorState error={detailLoad.error} onRetry={detailLoad.retry} />}
            {detailLoad.data && <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="rounded-xl border p-3"><p className="text-xs text-slate-500">Enrolled students</p><p className="text-xl font-bold">{detailLoad.data.students.total} / {detailLoad.data.class.capacity}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-slate-500">Attendance recorded today</p><p className="text-xl font-bold">{detailLoad.data.attendance.recordedStudents}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-slate-500">Timetable periods</p><p className="text-xl font-bold">{detailLoad.data.timetable.length}</p></div></div>
              <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">Students ({detailLoad.data.students.total})</h3><label className="relative"><Search className="absolute left-2 top-2.5 w-4 h-4 text-slate-400"/><input value={studentSearch} onChange={e => { setStudentPage(1); setStudentSearch(e.target.value); }} placeholder="Search students" className="pl-8 pr-3 py-2 border rounded-lg text-sm w-full sm:w-64"/></label></div><div className="overflow-x-auto border rounded-xl"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-2 text-left">Student</th><th className="p-2 text-left">Student ID</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Move to</th></tr></thead><tbody>{detailLoad.data.students.items.map(student => <tr key={student.id} className="border-t"><td className="p-2">{[student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ')}</td><td className="p-2">{student.studentId}</td><td className="p-2">{student.status}</td><td className="p-2"><select disabled={isReadOnly} defaultValue="" aria-label={`Move ${student.firstName} ${student.lastName} to class`} onChange={async event => { const target = classes.find(item => item.id === event.target.value); if (!target || !window.confirm(`Move this student to ${target.name} (${target.section})?`)) { event.target.value = ''; return; } try { await ApiClient.updateStudent(student.id, { classId: target.id, section: target.section, branchId: target.branchId }); await Promise.all([detailLoad.retry(), fetchData()]); } catch (error) { setDetailError(error instanceof Error ? error.message : 'Unable to move student.'); } event.target.value = ''; }} className="max-w-40 rounded border p-1"><option value="">Select class</option>{classes.filter(item => item.id !== selectedClassId && !item.isArchived).map(item => <option key={item.id} value={item.id}>{item.name} · {item.section}</option>)}</select></td></tr>)}{!detailLoad.data.students.items.length && <tr><td colSpan={4} className="p-5 text-center text-slate-500">No students found.</td></tr>}</tbody></table></div><div className="flex justify-end items-center gap-2 text-sm"><span>Page {studentPage} of {Math.max(1, Math.ceil(detailLoad.data.students.total / 20))}</span><button disabled={studentPage <= 1} onClick={() => setStudentPage(page => page - 1)} className="px-3 py-1.5 border rounded disabled:opacity-40">Previous</button><button disabled={studentPage * 20 >= detailLoad.data.students.total} onClick={() => setStudentPage(page => page + 1)} className="px-3 py-1.5 border rounded disabled:opacity-40">Next</button></div></div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><div className="border rounded-xl p-3"><h3 className="font-bold text-sm mb-2">Subjects and teachers</h3>{detailLoad.data.subjects.length ? detailLoad.data.subjects.map(assignment => <p key={assignment.id} className="text-sm py-1">{assignment.subject?.name || 'Subject'} <span className="text-slate-500">· {assignment.teacher?.fullName || 'No teacher'} · {assignment.periodsPerWeek} periods/week · {assignment.smallExamEnabled ? 'Small' : ''}{assignment.smallExamEnabled && assignment.bigExamEnabled ? ' + ' : ''}{assignment.bigExamEnabled ? 'Big' : ''} exam</span></p>) : <p className="text-sm text-slate-500">No subjects are assigned to this class.</p>}</div><div className="border rounded-xl p-3"><h3 className="font-bold text-sm mb-2">Timetable</h3>{detailLoad.data.timetable.length ? detailLoad.data.timetable.map(slot => <p key={slot.id} className="text-sm py-1">{slot.dayOfWeek} · Period {slot.periodNumber} · {slot.startTime}–{slot.endTime}</p>) : <p className="text-sm text-slate-500">No timetable periods are assigned.</p>}</div></div>
            </>}
          </section>
        </div>
      )}

      {/* CREATE CLASS MODAL */}
      {showClassModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-[#E2E8F0]">
            <h2 className="text-base font-bold text-[#132A29] mb-4">{editingClass ? 'Edit Class' : 'Create New Class'}</h2>
            <form onSubmit={handleCreateClass} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium">Class Name *</label>
                <input
                  type="text"
                  required
                  value={className}
                  onChange={e => setClassName(e.target.value)}
                  placeholder="e.g. Grade 10 - Alpha"
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium">Branch</label>
                <select value={branchId} onChange={e => setBranchId(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg bg-white">
                  <option value="">Unassigned</option>
                  {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-medium">Form Teacher</label>
                <select value={formTeacherId} onChange={event => setFormTeacherId(event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2">
                  <option value="">Not assigned</option>
                  {teachers.filter(teacher => teacher.status === 'active').map(teacher => <option key={teacher.userId} value={teacher.userId}>{teacher.fullName} · {teacher.staffId || teacher.id}</option>)}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">Hal macallin ayaa fasalkan Form Teacher u noqonaya. Ma aha dhammaan macallimiinta maaddooyinka.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium">Grade Level</label>
                  <select
                    value={gradeLevel}
                    onChange={e => setGradeLevel(parseInt(e.target.value, 10))}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                  >
                    {[0, ...(school?.classLevels?.length ? school.classLevels : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).filter(level => level !== 0)].map(level => (
                      <option key={level} value={level}>{level === 0 ? 'KG' : `Grade ${level}`}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium">Shift</label>
                  <select value={classShift} onChange={e => setClassShift(Number(e.target.value) as 1 | 2)} className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg">
                    <option value={1}>Shift 1 · Morning</option>
                    {(availableShiftCount === 2 || classShift === 2) && <option value={2}>Shift 2 · Afternoon</option>}
                  </select>
                </div>
                <div>
                  <label className="block font-medium">Section</label>
                  <input
                    type="text"
                    value={section}
                    onChange={e => setSection(e.target.value.toUpperCase())}
                    placeholder="A, B, C..."
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg uppercase font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium">Room Number</label>
                  <input
                    type="text"
                    value={roomNumber}
                    onChange={e => setRoomNumber(e.target.value)}
                    placeholder="Room 101"
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium">Class Capacity</label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={capacity}
                    onChange={e => setCapacity(parseInt(e.target.value, 10))}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium">Monthly Tuition Fee ({school?.currency || 'ETB'})</label>
                <input
                  type="number"
                  min="0"
                  value={monthlyFee}
                  onChange={e => setMonthlyFee(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setShowClassModal(false); setEditingClass(null); }} className="px-4 py-2 border rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-[#0F766E] text-white rounded-lg font-semibold">
                  {editingClass ? 'Save Class' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE SUBJECT MODAL */}
      {showSubjectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 border border-[#E2E8F0]">
            <h2 className="text-base font-bold text-[#132A29] mb-4">{editingSubject ? 'Edit Curriculum Subject' : 'Add Curriculum Subject'}</h2>
            <form onSubmit={handleCreateSubject} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium">Subject Name *</label>
                <input
                  type="text"
                  required
                  value={subjectName}
                  onChange={e => setSubjectName(e.target.value)}
                  placeholder="e.g. Physics"
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium">Subject Code *</label>
                  <input
                    type="text"
                    required
                    value={subjectCode}
                    onChange={e => setSubjectCode(e.target.value.toUpperCase())}
                    placeholder="PHY-10"
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg uppercase font-mono"
                  />
                </div>
              </div>
              <fieldset className="border rounded-lg p-3 space-y-3">
                <legend className="px-1 font-semibold">Assign to classes</legend>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">{subjectAssignments.length} / {classes.length} classes selected</span>
                  <button type="button" onClick={() => setSubjectAssignments(current => current.length === classes.length ? [] : classes.map(klass => current.find(item => item.classId === klass.id) || { classId: klass.id, periodsPerWeek: 3, smallExamEnabled: true, bigExamEnabled: true }))} className="rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50">{subjectAssignments.length === classes.length ? 'Clear all' : 'Select all'}</button>
                </div>
                <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">{classes.map(klass => <label key={klass.id} className="flex gap-2 items-center"><input type="checkbox" checked={subjectAssignments.some(item => item.classId === klass.id)} onChange={event => setSubjectAssignments(current => event.target.checked ? [...current, { classId: klass.id, periodsPerWeek: 3, smallExamEnabled: true, bigExamEnabled: true }] : current.filter(item => item.classId !== klass.id))} />{klass.name} · {klass.section}</label>)}</div>
                {subjectAssignments.map(assignment => { const klass = classes.find(item => item.id === assignment.classId); return <div key={assignment.classId} className="grid grid-cols-1 sm:grid-cols-4 gap-2 border-t pt-2 items-center"><strong>{klass?.name} {klass?.section}</strong><label>Periods/week<input aria-label={`Periods per week for ${klass?.name}`} type="number" min="1" max="30" value={assignment.periodsPerWeek} onChange={event => setSubjectAssignments(items => items.map(item => item.classId === assignment.classId ? { ...item, periodsPerWeek: Number(event.target.value) } : item))} className="mt-1 w-full border rounded p-1" /></label><label>Teacher<select value={assignment.teacherId || ''} onChange={event => setSubjectAssignments(items => items.map(item => item.classId === assignment.classId ? { ...item, teacherId: event.target.value || undefined } : item))} className="mt-1 w-full border rounded p-1"><option value="">Unassigned</option>{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}</select></label><div className="flex flex-wrap gap-2"><label className="flex items-center gap-1"><input type="checkbox" checked={assignment.smallExamEnabled} onChange={event => setSubjectAssignments(items => items.map(item => item.classId === assignment.classId ? { ...item, smallExamEnabled: event.target.checked } : item))} />Small</label><label className="flex items-center gap-1"><input type="checkbox" checked={assignment.bigExamEnabled} onChange={event => setSubjectAssignments(items => items.map(item => item.classId === assignment.classId ? { ...item, bigExamEnabled: event.target.checked } : item))} />Big</label></div></div>; })}
              </fieldset>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setShowSubjectModal(false); setEditingSubject(null); }} className="px-4 py-2 border rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-[#0F766E] text-white rounded-lg font-semibold">
                  {editingSubject ? 'Save Subject' : 'Add Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ClassBulkImportWizard open={showBulkImport} onClose={() => setShowBulkImport(false)} onComplete={() => { void fetchData(); }} />
    </div>
  );
};
