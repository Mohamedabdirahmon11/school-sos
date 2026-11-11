/**
 * Teachers & Faculty Management for School Admin
 * Appoint teachers, assign classes and subjects, set salaries and contact info
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { PaginationControls, PageInfo } from '../common/PaginationControls.tsx';
import { Teacher, SchoolClass, Subject } from '../../types/index.ts';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { UserCheck, Plus, Search, Phone, BookOpen, Layers, X, CheckCircle2, Download, Pencil } from 'lucide-react';

export const TeachersView: React.FC = () => {
  const { school, isReadOnly, t } = useAuth();
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const teacherLoad = useApi(() => Promise.all([
    ApiClient.getTeachers({ page, pageSize: 20, search }), ApiClient.getClasses(), ApiClient.getSubjects(school?.id)
  ]), [school?.id, page, search], Boolean(school));
  const [teacherRows, classRows, subjectRows] = teacherLoad.data || [[], [], []];
  const teachers: Teacher[] = Array.isArray(teacherRows) ? teacherRows : [];
  const classes: SchoolClass[] = Array.isArray(classRows) ? classRows : [];
  const subjects: Subject[] = Array.isArray(subjectRows) ? subjectRows : [];
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [editForm, setEditForm] = useState<Partial<Teacher>>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [initialPassword, setInitialPassword] = useState('');

  // Form State
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
    const [qualification, setQualification] = useState('B.Ed / B.Sc');
  const [monthlySalary, setMonthlySalary] = useState(550);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [isCreatingTeacher, setIsCreatingTeacher] = useState(false);

  const filteredTeachers = teachers.filter(teacher => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [teacher.fullName, teacher.staffId, teacher.phone, teacher.qualification]
      .some(value => String(value || '').toLowerCase().includes(query));
  });

  const fetchData = teacherLoad.retry;
  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { setPageInfo((teacherRows as any)?.pagination || null); }, [teacherRows]);
  useEffect(() => { if (classes.length && selectedClassIds.length === 0) setSelectedClassIds([classes[0].id]); }, [classes, selectedClassIds.length]);
  useEffect(() => { if (subjects.length && selectedSubjectIds.length === 0) setSelectedSubjectIds([subjects[0].id]); }, [subjects, selectedSubjectIds.length]);

  const handleExportTeachers = async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch('/api/teachers/export?' + params.toString(), { credentials: 'include' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Teacher export failed.');
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = (school?.code || 'school') + '_teachers_' + new Date().toISOString().split('T')[0] + '.csv';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: any) {
      alert(error.message || 'Teacher export failed.');
    }
  };

  const openTeacherEditor = (teacher: Teacher) => {
    if (isReadOnly) return;
    setEditingTeacher(teacher);
    setEditForm({
      fullName: teacher.fullName || '',
      phone: teacher.phone || '',
      gender: teacher.gender || 'male',
      qualification: teacher.qualification || '',
      department: teacher.department || '',
      monthlySalary: Number(teacher.monthlySalary || 0),
      assignedClasses: [...(teacher.assignedClasses || [])],
      assignedSubjects: [...(teacher.assignedSubjects || [])],
      status: teacher.status || 'active'
    });
  };

  const handleSaveTeacher = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingTeacher) return;
    setIsSavingEdit(true);
    try {
      await ApiClient.updateTeacher(editingTeacher.id, editForm);
      setNotice(`Teacher ${editForm.fullName || editingTeacher.fullName} updated successfully.`);
      setEditingTeacher(null);
      await fetchData();
      window.setTimeout(() => setNotice(null), 3500);
    } catch (error: any) {
      setNotice(error?.message || 'Unable to update teacher.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleResetTeacherPin = async (teacher: Teacher) => {
    if (isReadOnly) return;
    if (!confirm(`Reset the sign-in PIN for ${teacher.fullName}? The new PIN will be shown once.`)) return;
    try {
      const result = await ApiClient.resetTeacherPin(teacher.id);
      setInitialPassword(`Teacher: ${result.teacher.fullName}\nTeacher ID: ${result.teacher.staffId}\nNew PIN: ${result.newPin}`);
      setNotice('Teacher PIN reset. Copy or securely share the new PIN.');
    } catch (error: any) {
      setNotice(error?.message || 'Could not reset teacher PIN.');
    }
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = fullName.trim();
    if (!name || isCreatingTeacher) return;

    setIsCreatingTeacher(true);
    try {
      const created = await ApiClient.addTeacher({
        fullName: name,
        phone: phone.trim(),
        gender,
        qualification: qualification.trim(),
        monthlySalary,
        assignedClasses: selectedClassIds,
        assignedSubjects: selectedSubjectIds
      }, school?.id);

      setShowAddModal(false);
      setFullName('');
      setPhone('');
      setInitialPassword(`Teacher ID: ${(created as any).staffId}\nInitial PIN: ${(created as any).initialPin}`);
      setNotice(`Teacher ${name} appointed successfully.`);
      await fetchData();
      window.setTimeout(() => setNotice(null), 4500);
    } catch (err: any) {
      setNotice(err?.message || 'Unable to appoint this teacher.');
    } finally {
      setIsCreatingTeacher(false);
    }
  };

  if (teacherLoad.loading) return <div className="p-6 space-y-4" aria-label="Loading teachers"><div className="h-8 w-1/3 animate-pulse rounded bg-slate-200" /><div className="h-48 animate-pulse rounded-xl bg-white" /></div>;
  if (teacherLoad.error) return <ErrorState error={teacherLoad.error} onRetry={teacherLoad.retry} />;
  return (
    <div className="mx-auto max-w-[1680px] space-y-6 p-3 sm:p-5 lg:p-7">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#102f2d] via-[#164b46] to-[#0f766e] p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border-[34px] border-white/5" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-teal-100">School administration · Faculty</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Teachers & staff directory</h1>
            <p className="mt-2 max-w-2xl text-sm text-teal-100/90">Manage teacher profiles, class and subject assignments, and secure school-issued sign-in IDs.</p>
          </div>

        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <button type="button" onClick={handleExportTeachers}
            className="inline-flex items-center gap-2 rounded-xl border border-[#d5e2de] bg-white px-4 py-3 text-sm font-semibold text-[#18312d] hover:bg-[#f6faf8]">
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button onClick={() => setShowAddModal(true)} disabled={isReadOnly}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0e8078] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#0b6f68] disabled:opacity-50">
            <Plus className="w-4 h-4" />
            <span>Appoint Teacher</span>
          </button>
        </div>
      </header>

      <section aria-label="Teacher directory summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Teachers on this page', value: teachers.length, note: 'Current directory page' },
          { label: 'Active teachers', value: teachers.filter(item => String(item.status).toLowerCase() === 'active').length, note: 'Ready to sign in' },
          { label: 'School classes', value: classes.length, note: 'Available for assignment' },
          { label: 'School subjects', value: subjects.length, note: 'Available for teaching' }
        ].map(item => (
          <article key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{item.value}</p>
            <p className="mt-1 text-[11px] text-slate-500">{item.note}</p>
          </article>
        ))}
      </section>

      {notice && (
        <div role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {initialPassword && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p>Give these sign-in details to the teacher. They are shown only now:</p><strong className="block whitespace-pre-line font-mono select-all mt-1">{initialPassword}</strong><div className="mt-3 flex gap-2"><button type="button" onClick={() => void navigator.clipboard.writeText(initialPassword)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold">Copy ID & PIN</button><button type="button" onClick={() => window.print()} className="rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold">Print ID & PIN</button><button type="button" onClick={() => setInitialPassword('')} className="rounded-lg border border-amber-300 bg-white px-3 py-2">Close</button></div></div>}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Search this page by teacher name, ID or phone"
            aria-label="Search teachers on this page"
            className="w-full rounded-lg border border-[#CBD5E1] bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-[#0F766E]" />
        </label>
        <span className="text-xs text-[#64748B]">{filteredTeachers.length} of {teachers.length} teachers on this page</span>
      </div>

      {/* Teachers Directory: reference-style table, retaining all existing teacher details */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-[#E2E8F0]">
                <th className="px-4 py-3 font-semibold text-[#64748B]">Teacher</th>
                <th className="px-4 py-3 font-semibold text-[#64748B]">Subjects</th>
                <th className="px-4 py-3 font-semibold text-[#64748B]">Classes</th>
                <th className="px-4 py-3 font-semibold text-[#64748B]">Phone</th>
                <th className="px-4 py-3 font-semibold text-[#64748B]">Status</th>
                <th className="px-4 py-3 font-semibold text-[#64748B]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {filteredTeachers.map(t => (
                <tr key={t.id} className="hover:bg-[#F5FAF8]">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#132A29]">{t.fullName}</p>
                    <p className="mt-0.5 text-[11px] text-[#64748B]">{t.qualification}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-[#0F766E]">ID: {t.staffId || t.id}</p>
                  </td>
                  <td className="px-4 py-3 text-[#334155]">{(t.assignedSubjects || []).map(id => subjects.find(item => item.id === id)?.name || id).join(', ') || 'Not assigned'}</td>
                  <td className="px-4 py-3 text-[#334155]">{(t.assignedClasses || []).map(id => classes.find(item => item.id === id)?.name || id).join(', ') || 'Not assigned'}</td>
                  <td className="px-4 py-3 font-mono text-[#334155]">{t.phone || 'Phone not provided'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${String(t.status).toLowerCase() === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => openTeacherEditor(t)} disabled={isReadOnly}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#CBD5E1] px-3 py-2 font-semibold text-[#0F766E] hover:bg-[#F0FDFA] disabled:opacity-50">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button type="button" onClick={() => void handleResetTeacherPin(t)} disabled={isReadOnly}
                      className="ml-1 inline-flex items-center gap-1 rounded-lg border border-amber-200 px-3 py-2 font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                      Reset PIN
                    </button>
                  </td>
                </tr>
              ))}
              {filteredTeachers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#64748B]">
                    {teachers.length ? 'No teachers on this page match your search.' : 'No teachers have been appointed yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <PaginationControls info={pageInfo} onPage={setPage} />

      {editingTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleSaveTeacher} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#132A29]">Edit teacher · {editingTeacher.staffId || editingTeacher.id}</h2>
              <button type="button" onClick={() => setEditingTeacher(null)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium">Full name<input required maxLength={120} value={String(editForm.fullName || '')} onChange={e => setEditForm(v => ({...v,fullName:e.target.value}))} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label>
              <label className="text-xs font-medium">Phone<input value={String(editForm.phone || '')} onChange={e => setEditForm(v => ({...v,phone:e.target.value}))} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label>
              <label className="text-xs font-medium">Gender<select value={editForm.gender || 'male'} onChange={e => setEditForm(v => ({...v,gender:e.target.value as 'male'|'female'}))} className="mt-1 w-full rounded-lg border p-2 text-sm"><option value="male">Male</option><option value="female">Female</option></select></label>
              <label className="text-xs font-medium">Status<select value={String(editForm.status || 'active')} onChange={e => setEditForm(v => ({...v,status:e.target.value as any}))} className="mt-1 w-full rounded-lg border p-2 text-sm"><option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On leave</option></select></label>
              <label className="text-xs font-medium">Qualification<input value={String(editForm.qualification || '')} onChange={e => setEditForm(v => ({...v,qualification:e.target.value}))} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label>
              <label className="text-xs font-medium">Department<input value={String(editForm.department || '')} onChange={e => setEditForm(v => ({...v,department:e.target.value}))} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label>
              <label className="text-xs font-medium">Monthly salary ({school?.currency || 'ETB'})<input type="number" min="0" value={Number(editForm.monthlySalary || 0)} onChange={e => setEditForm(v => ({...v,monthlySalary:Number(e.target.value)}))} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label>
              <label className="text-xs font-medium">Assigned classes<select multiple value={editForm.assignedClasses || []} onChange={e => setEditForm(v => ({...v,assignedClasses:Array.from(e.target.selectedOptions, option => option.value)}))} className="mt-1 h-28 w-full rounded-lg border p-2 text-sm">{classes.map(item => <option key={item.id} value={item.id}>{item.name}{item.section ? ` · ${item.section}` : ''}</option>)}</select><span className="text-[10px] text-slate-500">Hold Ctrl to select multiple classes.</span></label>
              <label className="text-xs font-medium">Assigned subjects<select multiple value={editForm.assignedSubjects || []} onChange={e => setEditForm(v => ({...v,assignedSubjects:Array.from(e.target.selectedOptions, option => option.value)}))} className="mt-1 h-28 w-full rounded-lg border p-2 text-sm">{subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="text-[10px] text-slate-500">Hold Ctrl to select multiple subjects.</span></label>
            </div>
            <div className="flex justify-end gap-2 border-t pt-3">
              <button type="button" onClick={() => setEditingTeacher(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button type="submit" disabled={isSavingEdit} className="rounded-lg bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isSavingEdit ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </div>
      )}

      {/* APPOINT TEACHER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-[#E2E8F0]">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
              <h2 className="text-base font-bold text-[#132A29] flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[#0F766E]" />
                <span>Appoint Faculty Member</span>
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-[#64748B] hover:text-[#132A29]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTeacher} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-[#334155]">Full Name *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Dr. Ahmed Warsame"
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-[#334155]">Phone Number (optional)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="Optional contact number"
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-[#334155]">{t('gender')} *</label>
                <select required value={gender} onChange={e => setGender(e.target.value as 'male' | 'female')} className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg">
                  <option value="male">{t('male')}</option>
                  <option value="female">{t('female')}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#334155]">Assigned subjects (optional)</label>
                  <select multiple size={4} value={selectedSubjectIds} onChange={e => setSelectedSubjectIds(Array.from(e.target.selectedOptions, option => option.value))} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white p-2 text-sm">{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
                  <span className="mt-1 block text-[10px] text-slate-500">{selectedSubjectIds.length} subject(s) selected. Use Ctrl/Command to select multiple.</span>
                </div>
                <div>
                  <label className="block font-medium text-[#334155]">Monthly Salary ({school?.currency || 'ETB'})</label>
                  <input
                    type="number"
                    min="100"
                    required
                    value={monthlySalary}
                    onChange={e => setMonthlySalary(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#334155]">Qualification & Degree</label>
                <input
                  type="text"
                  required
                  value={qualification}
                  onChange={e => setQualification(e.target.value)}
                  placeholder="e.g. M.Sc Physics, SNU"
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-[#334155]">Assigned classes (optional)</label>
                <select multiple size={4} value={selectedClassIds} onChange={e => setSelectedClassIds(Array.from(e.target.selectedOptions, option => option.value))} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white p-2 text-sm">{classes.map(klass => <option key={klass.id} value={klass.id}>{klass.name}{klass.section ? ` · ${klass.section}` : ''}</option>)}</select>
                <span className="mt-1 block text-[10px] text-slate-500">{selectedClassIds.length} class(es) selected. Use Ctrl/Command to select multiple.</span>
              </div>

              <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-[11px] leading-relaxed text-sky-900">
                These are profile assignments. To grant timetable and exam access, also assign the teacher to each class subject in Subject Assignments. Form Teacher responsibility is set on the class record.
              </p>
              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-[#334155]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingTeacher || isReadOnly}
                  className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCreatingTeacher ? 'Creating teacher…' : 'Appoint Teacher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
