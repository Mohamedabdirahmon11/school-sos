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
  const teacherLoad = useApi(() => Promise.all([
    ApiClient.getTeachers({ page, pageSize: 20 }), ApiClient.getClasses(), ApiClient.getSubjects(school?.id)
  ]), [school?.id, page], Boolean(school));
  const [teacherRows, classRows, subjectRows] = teacherLoad.data || [[], [], []];
  const teachers: Teacher[] = Array.isArray(teacherRows) ? teacherRows : [];
  const classes: SchoolClass[] = Array.isArray(classRows) ? classRows : [];
  const subjects: Subject[] = Array.isArray(subjectRows) ? subjectRows : [];
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [initialPassword, setInitialPassword] = useState('');

  // Form State
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [department, setDepartment] = useState('Sciences');
  const [qualification, setQualification] = useState('B.Ed / B.Sc');
  const [monthlySalary, setMonthlySalary] = useState(550);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  const filteredTeachers = teachers.filter(teacher => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [teacher.fullName, teacher.staffId, teacher.phone, teacher.department, teacher.qualification]
      .some(value => String(value || '').toLowerCase().includes(query));
  });

  const fetchData = teacherLoad.retry;
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
        department,
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
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Faculty & Teaching Staff
          </h1>
          <p className="text-xs text-[#64748B]">
            Create teachers with a school-issued Teacher ID and a short 4-digit sign-in PIN
          </p>
        </div>

        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <button type="button" onClick={handleExportTeachers}
            className="px-3.5 py-2 text-xs font-semibold text-[#334155] bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg flex items-center gap-1.5">
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button onClick={() => setShowAddModal(true)} disabled={isReadOnly}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50">
            <Plus className="w-4 h-4" />
            <span>Appoint Teacher</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {initialPassword && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Give these sign-in details to the teacher. They are shown only now: <strong className="block whitespace-pre-line font-mono select-all mt-1">{initialPassword}</strong></div>}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Search this page by teacher name, ID, phone or department"
            aria-label="Search teachers on this page"
            className="w-full rounded-lg border border-[#CBD5E1] bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-[#0F766E]" />
        </label>
        <span className="text-xs text-[#64748B]">{filteredTeachers.length} of {teachers.length} teachers on this page</span>
      </div>

      {/* Teachers Directory Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTeachers.map(t => (
          <div key={t.id} className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-3 shadow-xs">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#132A29]">{t.fullName}</h3>
                <span className="text-[11px] font-mono text-[#0F766E] bg-[#F0FDFA] px-2 py-0.5 rounded border border-[#CCFBF1]">
                  {t.department}
                </span>
              </div>
              <span className="text-[11px] font-bold text-emerald-700 uppercase">{t.status}</span>
            </div>

            <p className="text-xs text-[#64748B]">{t.qualification}</p>

            <div className="space-y-1 text-xs text-[#334155] pt-2 border-t border-[#F1F5F9]">
              <p className="text-[11px] font-mono text-[#0F766E]">Teacher ID: {t.staffId || t.id}</p>
              <p className="flex items-center gap-2 font-mono">
                <Phone className="w-3.5 h-3.5 text-[#64748B]" />
                <span>{t.phone || 'Phone not provided'}</span>
              </p>
              <p className="text-[11px] text-[#64748B] pt-1">
                Base Salary: <strong className="font-mono text-[#132A29]">${t.monthlySalary} / month</strong>
              </p>
            </div>
          </div>
        ))}
        {filteredTeachers.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-[#CBD5E1] bg-white p-8 text-center text-sm text-[#64748B]">
            {teachers.length ? 'No teachers on this page match your search.' : 'No teachers have been appointed yet.'}
          </div>
        )}
      </div>
      <PaginationControls info={pageInfo} onPage={setPage} />

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
                  <label className="block font-medium text-[#334155]">Department</label>
                  <select
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                  >
                    <option value="Sciences">Sciences</option>
                    <option value="Mathematics">Mathematics</option>
                    <option value="Languages">Languages</option>
                    <option value="Social Studies">Social Studies</option>
                    <option value="Islamic Studies">Islamic Studies</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#334155]">Monthly Salary ($)</label>
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
