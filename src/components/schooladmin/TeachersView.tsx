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
import { UserCheck, Plus, Search, Phone, BookOpen, Layers, X, CheckCircle2, Download } from 'lucide-react';

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
  const [notice, setNotice] = useState<string | null>(null);
  const [initialPassword, setInitialPassword] = useState('');

  // Form State
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
    const [qualification, setQualification] = useState('B.Ed / B.Sc');
  const [monthlySalary, setMonthlySalary] = useState(550);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  const filteredTeachers = teachers.filter(teacher => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [teacher.fullName, teacher.staffId, teacher.phone, teacher.qualification]
      .some(value => String(value || '').toLowerCase().includes(query));
  });

  const fetchData = teacherLoad.retry;
  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { setPageInfo((teacherRows as any)?.pagination || null); }, [teacherRows]);
  useEffect(() => { if (classes.length && !selectedClassId) setSelectedClassId(classes[0].id); }, [classes, selectedClassId]);
  useEffect(() => { if (subjects.length && !selectedSubjectId) setSelectedSubjectId(subjects[0].id); }, [subjects, selectedSubjectId]);

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

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName) return;

    try {
      const created = await ApiClient.addTeacher({
        fullName,
        phone,
        gender,
        qualification,
        monthlySalary,
        assignedClasses: selectedClassId ? [selectedClassId] : [],
        assignedSubjects: selectedSubjectId ? [selectedSubjectId] : []
      }, school?.id);

      setShowAddModal(false);
      setFullName('');
      setPhone('');
      setInitialPassword(`Teacher ID: ${(created as any).staffId}\nInitial PIN: ${(created as any).initialPin}`);
      setNotice(`Teacher ${fullName} appointed to faculty.`);
      await fetchData();
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (teacherLoad.loading) return <div className="p-6 space-y-4" aria-label="Loading teachers"><div className="h-8 w-1/3 animate-pulse rounded bg-slate-200" /><div className="h-48 animate-pulse rounded-xl bg-white" /></div>;
  if (teacherLoad.error) return <ErrorState error={teacherLoad.error} onRetry={teacherLoad.retry} />;
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-5 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#102522]">Teachers</h1>
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
            <span>Add Teacher</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
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
                </tr>
              ))}
              {filteredTeachers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#64748B]">
                    {teachers.length ? 'No teachers on this page match your search.' : 'No teachers have been appointed yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <PaginationControls info={pageInfo} onPage={setPage} />

      {/* APPOINT TEACHER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-[#E2E8F0]">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
              <h2 className="text-base font-bold text-[#132A29] flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[#0F766E]" />
                <span>Add Teacher</span>
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
                  <label className="block font-medium text-[#334155]">Assigned Subject</label>
                  <select value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"><option value="">Select subject</option>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
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
                  className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg font-semibold shadow-sm"
                >
                  Appoint Teacher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
