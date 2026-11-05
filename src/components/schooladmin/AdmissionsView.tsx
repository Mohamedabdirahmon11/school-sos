import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { SchoolClass } from '../../types/index.ts';
import { Check, CheckCircle2, Inbox, Plus, X } from 'lucide-react';

interface AdmissionApplication {
  id: string; firstName: string; middleName: string; lastName: string; gender: 'male' | 'female';
  gradeApplying: string; classId: string; fatherPhone: string; motherPhone: string; appliedDate: string;
  status: 'pending' | 'approved' | 'rejected'; studentId?: string;
}

export const AdmissionsView: React.FC = () => {
  const { school, isReadOnly } = useAuth();
  const [applications, setApplications] = useState<AdmissionApplication[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('female');
  const [gradeApplying, setGradeApplying] = useState('');
  const [classId, setClassId] = useState('');
  const [fatherPhone, setFatherPhone] = useState('');
  const [motherPhone, setMotherPhone] = useState('');

  const fetchData = async () => {
    if (!school) return;
    setLoading(true);
    try {
      const [rows, classRows] = await Promise.all([
        ApiClient.request<AdmissionApplication[]>('/school/admissions'),
        ApiClient.getClasses()
      ]);
      setApplications(rows);
      setClasses(classRows);
      if (!classId && classRows.length) setClassId(classRows[0].id);
    } catch (cause: any) {
      setError(cause.message || 'Could not load admissions records.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void fetchData(); }, [school]);

  const submitApplication = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const created = await ApiClient.request<AdmissionApplication>('/school/admissions', { method: 'POST', body: JSON.stringify({ firstName, middleName, lastName, gender, gradeApplying, classId, fatherPhone, motherPhone }) });
      setApplications(current => [created, ...current]);
      setShowForm(false); setFirstName(''); setMiddleName(''); setLastName(''); setGradeApplying(''); setFatherPhone(''); setMotherPhone('');
      setNotice('Admission application saved.');
    } catch (cause: any) { setError(cause.message || 'Could not save the application.'); }
  };

  const processApplication = async (application: AdmissionApplication, action: 'approve' | 'reject') => {
    if (isReadOnly) return;
    setError(null);
    try {
      if (action === 'approve') {
        const result = await ApiClient.request<{ application: AdmissionApplication; student: { studentId: string } }>(`/school/admissions/${application.id}/approve`, { method: 'POST' });
        setApplications(rows => rows.map(row => row.id === application.id ? result.application : row));
        setNotice(`Student enrolled with ID ${result.student.studentId}.`);
      } else {
        const updated = await ApiClient.request<AdmissionApplication>(`/school/admissions/${application.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) });
        setApplications(rows => rows.map(row => row.id === application.id ? updated : row));
        setNotice('Application rejected.');
      }
    } catch (cause: any) { setError(cause.message || 'Could not process the application.'); }
  };

  const visibleRows = applications.filter(row => statusFilter === 'all' || row.status === statusFilter);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">Admissions</h1>
        </div>
        <button type="button" onClick={() => { setError(null); setShowForm(true); }} disabled={isReadOnly || classes.length === 0} className="px-3 py-2 bg-[#0F766E] text-white rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />New Application</button>
      </div>

      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{notice}</div>}
      {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">{error}</div>}

      <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg text-xs w-fit">
        {['all', 'pending', 'approved', 'rejected'].map(status => <button key={status} onClick={() => setStatusFilter(status)} className={`px-3 py-1 font-medium rounded capitalize ${statusFilter === status ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B]'}`}>{status}</button>)}
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
        {loading ? <div className="p-8 text-center text-xs text-[#64748B]">Loading admissions...</div> : visibleRows.length === 0 ? (
          <div className="p-10 text-center"><Inbox className="w-8 h-8 mx-auto text-[#94A3B8]" /><p className="mt-3 text-sm font-semibold text-[#132A29]">No applications</p><p className="mt-1 text-xs text-[#64748B]">No saved applications match this status.</p></div>
        ) : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]"><tr><th className="px-4 py-3">Applicant</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[#E2E8F0]">{visibleRows.map(row => <tr key={row.id}><td className="px-4 py-3 font-semibold text-[#132A29]">{[row.firstName, row.middleName, row.lastName].filter(Boolean).join(' ')}</td><td className="px-4 py-3">{classes.find(item => item.id === row.classId)?.name || row.gradeApplying || 'Class unavailable'}</td><td className="px-4 py-3">{row.appliedDate}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${row.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : row.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{row.status}</span></td><td className="px-4 py-3 text-right">{row.status === 'pending' && <div className="flex justify-end gap-2"><button disabled={isReadOnly} onClick={() => void processApplication(row, 'approve')} className="px-2.5 py-1 text-xs text-white bg-[#0F766E] rounded disabled:opacity-50 flex items-center gap-1"><Check className="w-3 h-3" />Approve & Enroll</button><button disabled={isReadOnly} onClick={() => void processApplication(row, 'reject')} className="px-2.5 py-1 text-xs text-rose-700 bg-rose-50 rounded border border-rose-200 disabled:opacity-50">Reject</button></div>}</td></tr>)}</tbody></table></div>}
      </div>

      {showForm && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><form onSubmit={submitApplication} className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-3"><div className="flex items-center justify-between"><h2 className="text-base font-bold text-[#132A29]">New admission application</h2><button type="button" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-2"><input required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" className="px-3 py-2 text-xs border rounded-lg" /><input value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="Middle name" className="px-3 py-2 text-xs border rounded-lg" /><input required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" className="px-3 py-2 text-xs border rounded-lg" /></div><div className="grid grid-cols-2 gap-2"><select value={gender} onChange={e => setGender(e.target.value as 'male' | 'female')} className="px-3 py-2 text-xs border rounded-lg bg-white"><option value="female">Female</option><option value="male">Male</option></select><input required value={gradeApplying} onChange={e => setGradeApplying(e.target.value)} placeholder="Grade applying" className="px-3 py-2 text-xs border rounded-lg" /></div><select required value={classId} onChange={e => setClassId(e.target.value)} className="w-full px-3 py-2 text-xs border rounded-lg bg-white"><option value="">Select class</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name} ({item.section})</option>)}</select><div className="grid grid-cols-2 gap-2"><input value={fatherPhone} onChange={e => setFatherPhone(e.target.value)} placeholder="Father phone" className="px-3 py-2 text-xs border rounded-lg" /><input value={motherPhone} onChange={e => setMotherPhone(e.target.value)} placeholder="Mother phone" className="px-3 py-2 text-xs border rounded-lg" /></div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setShowForm(false)} className="px-3 py-2 border rounded-lg text-xs">Cancel</button><button type="submit" className="px-3 py-2 bg-[#0F766E] text-white rounded-lg text-xs font-semibold">Save application</button></div></form></div>}
    </div>
  );
};
