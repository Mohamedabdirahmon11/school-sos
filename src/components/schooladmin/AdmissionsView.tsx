import React, { useEffect, useState } from 'react';
import './people-admin.css';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { SchoolClass } from '../../types/index.ts';
import { Check, CheckCircle2, Plus, X } from 'lucide-react';

interface AdmissionApplication {
  id: string; firstName: string; middleName: string; lastName: string; gender: 'male' | 'female';
  gradeApplying: string; classId: string; fatherPhone: string; motherPhone: string; appliedDate: string;
  status: 'pending' | 'approved' | 'rejected'; pipelineStage?: 'applied' | 'review' | 'interview' | 'accepted' | 'enrolled' | 'rejected'; studentId?: string;
}

const ADMISSION_STAGES = [
  { key: 'applied', label: 'Codsi cusub', hint: 'Codsiga waa la helay' },
  { key: 'review', label: 'Hubin', hint: 'Hubinta xogta iyo dukumentiyada' },
  { key: 'interview', label: 'Wareysi / Imtixaan', hint: 'Qiimayn iyo wareysi' },
  { key: 'accepted', label: 'La aqbalay', hint: 'Diyaar u ah diiwaangelin' },
  { key: 'enrolled', label: 'La diiwaangeliyey', hint: 'Ardayga waxaa lagu daray diiwaanka' },
  { key: 'rejected', label: 'La diiday', hint: 'Codsiga lama aqbalin' }
] as const;

export const AdmissionsView: React.FC = () => {
  const { school, isReadOnly } = useAuth();
  const [applications, setApplications] = useState<AdmissionApplication[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
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

  const getStage = (row: AdmissionApplication) => row.pipelineStage || (row.status === 'approved' ? 'enrolled' : row.status === 'rejected' ? 'rejected' : 'applied');

  const moveApplication = async (application: AdmissionApplication, stage: string) => {
    if (isReadOnly) return;
    setError(null);
    try {
      const updated = await ApiClient.request<AdmissionApplication>(`/school/admissions/${application.id}/pipeline-stage`, { method: 'PATCH', body: JSON.stringify({ stage }) });
      setApplications(rows => rows.map(row => row.id === application.id ? updated : row));
      setNotice(`Application moved to ${ADMISSION_STAGES.find(item => item.key === stage)?.label || stage}.`);
    } catch (cause: any) { setError(cause.message || 'Could not move the application.'); }
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
        const updated = await ApiClient.request<AdmissionApplication>(`/school/admissions/${application.id}/pipeline-stage`, { method: 'PATCH', body: JSON.stringify({ stage: 'rejected' }) });
        setApplications(rows => rows.map(row => row.id === application.id ? updated : row));
        setNotice('Application rejected.');
      }
    } catch (cause: any) { setError(cause.message || 'Could not process the application.'); }
  };

  const visibleRows = applications.filter(row =>
    (statusFilter === 'all' || getStage(row) === statusFilter) &&
    [row.firstName, row.middleName, row.lastName, row.gradeApplying, row.fatherPhone, row.motherPhone].join(' ').toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="school-people-page school-people-admissions-page p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">Admissions Pipeline</h1>
          <p className="text-xs text-[#64748B]">Review school admission applications and enroll approved students.</p>
        </div>
        <button type="button" onClick={() => { setError(null); setShowForm(true); }} disabled={isReadOnly || classes.length === 0} className="px-3 py-2 bg-[#0F766E] text-white rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />New Application</button>
      </div>

      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{notice}</div>}
      {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">{error}</div>}

      <div className="schoolos-admissions-filterbar bg-white rounded-xl border border-[#E2E8F0] p-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search applicant, class or parent phone…" aria-label="Search admissions" className="w-full sm:max-w-sm px-3 py-2 text-xs border rounded-lg" />
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg text-xs">
          {['all', ...ADMISSION_STAGES.map(stage => stage.key)].map(status => <button key={status} onClick={() => setStatusFilter(status)} className={`px-3 py-1 font-medium rounded capitalize ${statusFilter === status ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B]'}`}>{status === 'all' ? 'Dhammaan' : ADMISSION_STAGES.find(stage => stage.key === status)?.label}</button>)}
        </div>
        <span className="sm:ml-auto text-xs text-slate-500">{visibleRows.length} applications</span>
      </div>

      {loading ? <div className="bg-white border rounded-xl p-8 text-center text-xs text-[#64748B]">Loading admissions...</div> : (
        <div className="people-admissions-board grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
          {ADMISSION_STAGES.map((stage, stageIndex) => {
            const stageRows = visibleRows.filter(row => getStage(row) === stage.key);
            return <section key={stage.key} aria-label={stage.label} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div><h2 className="text-sm font-bold text-[#132A29]">{stage.label}</h2><p className="text-[10px] text-slate-500 mt-0.5">{stage.hint}</p></div>
                <span className="rounded-full bg-white border border-[#E2E8F0] px-2.5 py-1 text-xs font-bold">{stageRows.length}</span>
              </div>
              <div className="space-y-2">
                {stageRows.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-5 text-center text-xs text-slate-400">Ma jiraan codsiyo marxaladdan.</div> : stageRows.map(row => (
                  <article key={row.id} className="rounded-lg border border-[#E2E8F0] bg-white p-3 shadow-xs">
                    <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold text-[#132A29]">{row.firstName} {row.middleName} {row.lastName}</h3><span className="shrink-0 rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-bold">{stage.label}</span></div>
                    <p className="mt-1 text-xs text-slate-600">{row.gradeApplying} · {classes.find(item => item.id === row.classId)?.name || 'Class unavailable'}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Waalid: {[row.fatherPhone, row.motherPhone].filter(Boolean).join(' · ') || '—'}</p>
                    <p className="mt-1 text-[10px] text-slate-400">Codsi: {row.appliedDate} · {row.gender}</p>
                    {row.studentId && <p className="mt-2 font-mono text-[11px] font-semibold text-emerald-700">Student ID: {row.studentId}</p>}
                    {stageIndex <= 3 && <div className="mt-3 flex flex-wrap gap-2">
                      {stageIndex > 0 && <button disabled={isReadOnly} onClick={() => void moveApplication(row, ADMISSION_STAGES[stageIndex - 1].key)} className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 rounded-lg disabled:opacity-50">← Dib u celi</button>}
                      {stageIndex < 3 && <button disabled={isReadOnly} onClick={() => void moveApplication(row, ADMISSION_STAGES[stageIndex + 1].key)} className="px-2.5 py-1.5 text-[11px] font-semibold text-white bg-[#0F766E] rounded-lg disabled:opacity-50">Hore →</button>}
                      {stage.key === 'accepted' && <button disabled={isReadOnly} onClick={() => void processApplication(row, 'approve')} className="px-2.5 py-1.5 text-[11px] font-semibold text-white bg-[#0F766E] rounded-lg disabled:opacity-50 flex items-center gap-1"><Check className="w-3 h-3" />Diiwaangeli ardayga</button>}
                      <button disabled={isReadOnly} onClick={() => void processApplication(row, 'reject')} className="px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 rounded-lg border border-rose-200 disabled:opacity-50">Diid</button>
                    </div>}
                  </article>
                ))}
              </div>
            </section>;
          })}
        </div>
      )}

      {showForm && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><form onSubmit={submitApplication} className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-3"><div className="flex items-center justify-between"><h2 className="text-base font-bold text-[#132A29]">New admission application</h2><button type="button" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-2"><input required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" className="px-3 py-2 text-xs border rounded-lg" /><input value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="Middle name" className="px-3 py-2 text-xs border rounded-lg" /><input required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" className="px-3 py-2 text-xs border rounded-lg" /></div><div className="grid grid-cols-2 gap-2"><select value={gender} onChange={e => setGender(e.target.value as 'male' | 'female')} className="px-3 py-2 text-xs border rounded-lg bg-white"><option value="female">Female</option><option value="male">Male</option></select><input required value={gradeApplying} onChange={e => setGradeApplying(e.target.value)} placeholder="Grade applying" className="px-3 py-2 text-xs border rounded-lg" /></div><select required value={classId} onChange={e => setClassId(e.target.value)} className="w-full px-3 py-2 text-xs border rounded-lg bg-white"><option value="">Select class</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name} ({item.section})</option>)}</select><div className="grid grid-cols-2 gap-2"><input value={fatherPhone} onChange={e => setFatherPhone(e.target.value)} placeholder="Father phone" className="px-3 py-2 text-xs border rounded-lg" /><input value={motherPhone} onChange={e => setMotherPhone(e.target.value)} placeholder="Mother phone" className="px-3 py-2 text-xs border rounded-lg" /></div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setShowForm(false)} className="px-3 py-2 border rounded-lg text-xs">Cancel</button><button type="submit" className="px-3 py-2 bg-[#0F766E] text-white rounded-lg text-xs font-semibold">Save application</button></div></form></div>}
    </div>
  );
};
