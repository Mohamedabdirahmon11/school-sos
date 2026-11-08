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
  const [section, setSection] = useState('A');
  const [roomNumber, setRoomNumber] = useState('Room 101');
  const [capacity, setCapacity] = useState(school?.defaultClassCapacity || 40);
  const [monthlyFee, setMonthlyFee] = useState(50);

  // New Subject Form State
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectAssignments, setSubjectAssignments] = useState<Array<{ classId: string; teacherId?: string; periodsPerWeek: number; smallExamEnabled: boolean; bigExamEnabled: boolean }>>([]);

  const fetchData = classLoad.retry;
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
        branchId: branchId || undefined
      };
      if (editingClass) await ApiClient.updateClass(editingClass.id, payload);
      else await ApiClient.addClass(payload, school?.id);
      setShowClassModal(false);
      setEditingClass(null);
      setClassName('');
      setClassShift(1);
      setCapacity(school?.defaultClassCapacity || 40);
      setNotice(`Class "${className}" created.`);
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Classes Column */}
        <div className="min-w-0 space-y-4 rounded-2xl border border-[#DCE7E4] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0F766E]" />
              <span>Classes & Sections ({classes.length})</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowBulkImport(true)} disabled={isReadOnly} className="px-3 py-1.5 border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[#334155] rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 disabled:opacity-50">
                <Upload className="w-3.5 h-3.5 text-[#0F766E]" /><span>{t('bulk_import')}</span>
              </button>
              <button
                onClick={() => { setEditingClass(null); setCapacity(school?.defaultClassCapacity || 40); setShowClassModal(true); }}
                disabled={isReadOnly}
                className="px-3 py-1.5 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Class</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-[#E2E8F0]">
            {classes.map(c => (
              <div key={c.id} className="py-3 flex items-center justify-between text-xs gap-2">
                <button type="button" onClick={() => { setSelectedClassId(c.id); setStudentPage(1); }} className="text-left min-w-0 hover:text-[#0F766E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F766E] rounded">
                  <p className="font-semibold text-[#132A29]">{c.name}</p>
                  <p className="text-[11px] text-[#64748B]">
                    {c.roomNumber} · Shift {c.shift || 1} · Capacity: {c.capacity} students · Monthly Fee: {formatMoney(c.monthlyFee, school?.currency)}
                  </p>
                </button>
                <span className="font-mono text-[#0F766E] bg-[#F0FDFA] px-2 py-0.5 rounded text-[11px] font-bold">
                  Section {c.section}
                </span>
                <button disabled={isReadOnly} aria-label={`Edit ${c.name}`} onClick={() => { setEditingClass(c); setClassName(c.name); setGradeLevel(c.gradeLevel); setClassShift(c.shift === 2 ? 2 : 1); setSection(c.section); setRoomNumber(c.roomNumber || ''); setCapacity(c.capacity); setMonthlyFee(c.monthlyFee); setBranchId(c.branchId || ''); setShowClassModal(true); }} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50"><Pencil className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Subjects Column */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#0F766E]" />
              <span>Academic Subjects ({subjects.length})</span>
            </h2>
            <button
              onClick={() => { setEditingSubject(null); setSubjectAssignments([]); setShowSubjectModal(true); }}
              disabled={isReadOnly}
              className="px-3 py-1.5 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Subject</span>
            </button>
          </div>

          <div className="divide-y divide-[#E2E8F0]">
            {subjects.map(s => (
              <div key={s.id} className="py-3 flex items-center justify-between text-xs gap-2">
                <div>
                  <p className="font-semibold text-[#132A29]">{s.name}</p>
                  <p className="text-[11px] text-[#64748B]">Subject code: {s.code}</p>
                </div>
                <span className="font-mono text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded text-[11px]">
                  {s.code}
                </span>
                <button disabled={isReadOnly} aria-label={`Edit ${s.name}`} onClick={async () => { try { const current = await ApiClient.getSubjectAssignments(s.id); setSubjectAssignments(current); setEditingSubject(s); setSubjectName(s.name); setSubjectCode(s.code); setShowSubjectModal(true); } catch (error) { setDetailError(error instanceof Error ? error.message : 'Unable to load subject assignments.'); } }} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50"><Pencil className="w-3.5 h-3.5" /></button>
                <button disabled={isReadOnly} aria-label={`Delete ${s.name}`} onClick={async () => { if (!window.confirm(`Delete subject ${s.name}?`)) return; try { await ApiClient.deleteSubject(s.id); await fetchData(); } catch (error) { setDetailError(error instanceof Error ? error.message : 'Unable to delete subject.'); } }} className="p-1.5 rounded hover:bg-red-50 text-red-600 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
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
                    <option value={2}>Shift 2 · Afternoon</option>
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
