import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, Lock, Plus, RefreshCw, Save, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';

type AcademicYear = {
  id: string; name: string; start_date: string; end_date: string;
  is_current: boolean; status: 'draft' | 'active' | 'closed'; closed_at?: string | null;
};
type Semester = {
  id: string; name: 'Semester 1' | 'Semester 2'; start_date: string; end_date: string;
  is_current: boolean; status: 'open' | 'closed'; closedAt?: string | null;
  examPeriod?: { id: string; start_date: string; end_date: string; results_publish_date?: string | null } | null;
};

const blankYear = { name: '', startDate: '', endDate: '' };
const blankSemester = {
  name: 'Semester 1' as 'Semester 1' | 'Semester 2',
  startDate: '', endDate: '', examStartDate: '', examEndDate: '', resultsPublishDate: ''
};
const dateLabel = (value?: string) => value ? new Date(value + 'T00:00:00').toLocaleDateString() : '—';

export const AcademicYearManagementView: React.FC = () => {
  const { school, isReadOnly } = useAuth();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState('');
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [yearForm, setYearForm] = useState(blankYear);
  const [semesterForm, setSemesterForm] = useState(blankSemester);
  const [editingYearId, setEditingYearId] = useState<string | null>(null);
  const [editingSemesterId, setEditingSemesterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedYear = useMemo(() => years.find(year => year.id === selectedYearId) || null, [years, selectedYearId]);
  const canEdit = !isReadOnly && selectedYear?.status !== 'closed';

  const loadYears = useCallback(async () => {
    if (!school?.id) { setYears([]); setSelectedYearId(''); setLoading(false); return; }
    setLoading(true);
    try {
      const result = await ApiClient.getAcademicYears();
      setYears(result);
      setSelectedYearId(current => current && result.some(year => year.id === current)
        ? current : (result.find(year => year.is_current)?.id || result[0]?.id || ''));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Academic years could not be loaded.');
    } finally { setLoading(false); }
  }, [school?.id]);

  const loadSemesters = useCallback(async () => {
    if (!selectedYearId) { setSemesters([]); return; }
    try {
      setSemesters(await ApiClient.getAcademicYearSemesters(selectedYearId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Semesters could not be loaded.');
    }
  }, [selectedYearId]);

  useEffect(() => { void loadYears(); }, [loadYears]);
  useEffect(() => { void loadSemesters(); }, [loadSemesters]);

  const resetYear = () => { setYearForm(blankYear); setEditingYearId(null); };
  const resetSemester = () => { setSemesterForm(blankSemester); setEditingSemesterId(null); };

  const submitYear = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isReadOnly) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const saved = editingYearId
        ? await ApiClient.updateAcademicYear(editingYearId, yearForm)
        : await ApiClient.createAcademicYear(yearForm);
      await loadYears();
      if (saved?.id) setSelectedYearId(saved.id);
      resetYear();
      setNotice(editingYearId ? 'Academic year updated.' : 'Academic year created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Academic year could not be saved.');
    } finally { setSaving(false); }
  };

  const editYear = (year: AcademicYear) => {
    setEditingYearId(year.id);
    setYearForm({ name: year.name, startDate: year.start_date, endDate: year.end_date });
  };

  const activateYear = async (year: AcademicYear) => {
    if (isReadOnly) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await ApiClient.activateAcademicYear(year.id);
      await loadYears();
      setSelectedYearId(year.id);
      setNotice(year.name + ' is now the active academic year.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Academic year could not be activated.'); }
    finally { setSaving(false); }
  };

  const closeYear = async (year: AcademicYear) => {
    if (isReadOnly || !window.confirm('Close ' + year.name + '? Historical records will be preserved and the year will become read-only.')) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await ApiClient.closeAcademicYear(year.id);
      await loadYears();
      await loadSemesters();
      setNotice(year.name + ' has been closed.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Academic year could not be closed.'); }
    finally { setSaving(false); }
  };

  const submitSemester = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedYearId || !canEdit) return;
    setSaving(true); setError(''); setNotice('');
    const payload = {
      name: semesterForm.name, startDate: semesterForm.startDate, endDate: semesterForm.endDate,
      ...(semesterForm.examStartDate && semesterForm.examEndDate ? {
        examStartDate: semesterForm.examStartDate, examEndDate: semesterForm.examEndDate
      } : {}),
      ...(semesterForm.resultsPublishDate ? { resultsPublishDate: semesterForm.resultsPublishDate } : {})
    };
    try {
      if (editingSemesterId) await ApiClient.updateAcademicSemester(editingSemesterId, payload);
      else await ApiClient.createAcademicSemester(selectedYearId, payload);
      await loadSemesters();
      resetSemester();
      setNotice(editingSemesterId ? 'Semester updated.' : 'Semester created.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Semester could not be saved.'); }
    finally { setSaving(false); }
  };

  const editSemester = (semester: Semester) => {
    setEditingSemesterId(semester.id);
    setSemesterForm({
      name: semester.name, startDate: semester.start_date, endDate: semester.end_date,
      examStartDate: semester.examPeriod?.start_date || '',
      examEndDate: semester.examPeriod?.end_date || '',
      resultsPublishDate: semester.examPeriod?.results_publish_date || ''
    });
  };

  const changeSemesterStatus = async (semester: Semester, action: 'activate' | 'close' | 'reopen') => {
    if (!canEdit) return;
    if (action === 'close' && !window.confirm('Close ' + semester.name + '? Finalized academic records will be protected.')) return;
    setSaving(true); setError(''); setNotice('');
    try {
      if (action === 'activate') await ApiClient.activateAcademicSemester(semester.id);
      else if (action === 'close') await ApiClient.closeAcademicSemester(semester.id);
      else await ApiClient.reopenAcademicSemester(semester.id);
      await loadSemesters();
      setNotice(semester.name + ' ' + (action === 'activate' ? 'activated.' : action === 'close' ? 'closed.' : 'reopened.'));
    } catch (err) { setError(err instanceof Error ? err.message : 'Semester status could not be changed.'); }
    finally { setSaving(false); }
  };

  const existingNames = new Set(semesters.map(item => item.name));
  const availableName = (name: 'Semester 1' | 'Semester 2') => !existingNames.has(name) || semesters.some(item => item.id === editingSemesterId && item.name === name);

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-teal-700"><CalendarDays size={17}/> Academic structure</div>
          <h2 className="mt-1 text-lg font-bold text-slate-900">Academic Years & Semesters</h2>
          <p className="mt-1 text-sm text-slate-500">Manage school-year history and the two semesters without deleting past academic records.</p>
        </div>
        <button type="button" onClick={() => { void loadYears(); void loadSemesters(); }} disabled={loading || saving}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={15}/> Refresh
        </button>
      </div>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)]">
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-800">School academic years</h3>
          {loading ? <div className="py-8 text-center text-sm text-slate-500">Loading academic years…</div> :
            years.length ? <div className="space-y-2">
              {years.map(year => (
                <div key={year.id} className={`rounded-xl border p-3 ${selectedYearId === year.id ? 'border-teal-300 bg-teal-50/50' : 'border-slate-200'}`}>
                  <button type="button" onClick={() => { setSelectedYearId(year.id); resetSemester(); }}
                    className="flex w-full items-start justify-between gap-3 text-left">
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900">{year.name}</span>
                      <span className="mt-1 block text-xs text-slate-500">{dateLabel(year.start_date)} – {dateLabel(year.end_date)}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${year.status === 'active' ? 'bg-emerald-100 text-emerald-800' : year.status === 'closed' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>
                      {year.status === 'active' ? 'Active' : year.status === 'closed' ? 'Closed' : 'Draft'}
                    </span>
                  </button>
                  {!isReadOnly && <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200/70 pt-2">
                    {year.status !== 'active' && year.status !== 'closed' && <button type="button" disabled={saving} onClick={() => void activateYear(year)} className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Activate</button>}
                    {year.status !== 'closed' && <button type="button" disabled={saving} onClick={() => editYear(year)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">Edit</button>}
                    {year.status === 'active' && <button type="button" disabled={saving} onClick={() => void closeYear(year)} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-800 disabled:opacity-50">Close year</button>}
                  </div>}
                </div>
              ))}
            </div> : <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">No academic years have been created for this school yet.</p>}
        </div>

        {!isReadOnly && <form onSubmit={submitYear} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-800">{editingYearId ? 'Edit academic year' : 'Create academic year'}</h3>
            {editingYearId && <button type="button" onClick={resetYear} className="text-slate-500 hover:text-slate-800" aria-label="Cancel edit"><X size={17}/></button>}
          </div>
          <label className="block space-y-1 text-sm"><span className="font-medium text-slate-700">Academic year name</span><input required maxLength={40} value={yearForm.name} onChange={e => setYearForm(v => ({...v,name:e.target.value}))} placeholder="2026-2027" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"/></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm"><span className="font-medium text-slate-700">Start date</span><input required type="date" value={yearForm.startDate} onChange={e => setYearForm(v => ({...v,startDate:e.target.value}))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"/></label>
            <label className="block space-y-1 text-sm"><span className="font-medium text-slate-700">End date</span><input required type="date" value={yearForm.endDate} onChange={e => setYearForm(v => ({...v,endDate:e.target.value}))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"/></label>
          </div>
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save size={15}/>{saving ? 'Saving…' : editingYearId ? 'Save changes' : 'Create year'}</button>
        </form>}
      </div>

      <div className="border-t border-slate-200 pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-800">Two semesters</h3>
            <p className="text-xs text-slate-500">{selectedYear ? selectedYear.name : 'Select or create an academic year first.'}</p>
          </div>
          {selectedYear && <span className="text-xs text-slate-500">{semesters.length} of 2 configured</span>}
        </div>
        {!selectedYear ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Choose an academic year to manage its semesters.</p> :
          <div className="grid gap-3 md:grid-cols-2">
            {semesters.map(semester => (
              <article key={semester.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><h4 className="font-semibold text-slate-900">{semester.name}</h4><p className="mt-1 text-xs text-slate-500">{dateLabel(semester.start_date)} – {dateLabel(semester.end_date)}</p></div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${semester.status === 'closed' ? 'bg-slate-100 text-slate-600' : semester.is_current ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>{semester.status === 'closed' ? 'Closed' : semester.is_current ? 'Active' : 'Open'}</span>
                </div>
                {semester.examPeriod && <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
                  <p>Exam: {dateLabel(semester.examPeriod.start_date)} – {dateLabel(semester.examPeriod.end_date)}</p>
                  <p>Results publish: {dateLabel(semester.examPeriod.results_publish_date || '')}</p>
                </div>}
                {canEdit && <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <button type="button" disabled={saving} onClick={() => editSemester(semester)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">Edit</button>
                  {semester.status === 'closed'
                    ? <button type="button" disabled={saving} onClick={() => void changeSemesterStatus(semester,'reopen')} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-800 disabled:opacity-50">Reopen</button>
                    : <><button type="button" disabled={saving || semester.is_current} onClick={() => void changeSemesterStatus(semester,'activate')} className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Activate</button><button type="button" disabled={saving} onClick={() => void changeSemesterStatus(semester,'close')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">Close</button></>}
                </div>}
              </article>
            ))}
            {semesters.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 md:col-span-2">No semesters configured for this academic year.</p>}
          </div>}
      </div>

      {canEdit && semesters.length < 2 && <form onSubmit={submitSemester} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-slate-800">{editingSemesterId ? 'Edit semester' : 'Add semester'}</h3>{editingSemesterId && <button type="button" onClick={resetSemester} className="text-slate-500" aria-label="Cancel semester edit"><X size={17}/></button>}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1 text-sm"><span className="font-medium text-slate-700">Semester</span><select value={semesterForm.name} onChange={e => setSemesterForm(v => ({...v,name:e.target.value as 'Semester 1'|'Semester 2'}))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
            {(['Semester 1','Semester 2'] as const).filter(availableName).map(name => <option key={name}>{name}</option>)}
          </select></label>
          <label className="block space-y-1 text-sm"><span className="font-medium text-slate-700">Start date</span><input required type="date" value={semesterForm.startDate} onChange={e => setSemesterForm(v => ({...v,startDate:e.target.value}))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"/></label>
          <label className="block space-y-1 text-sm"><span className="font-medium text-slate-700">End date</span><input required type="date" value={semesterForm.endDate} onChange={e => setSemesterForm(v => ({...v,endDate:e.target.value}))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"/></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1 text-sm"><span className="font-medium text-slate-700">Exam starts</span><input type="date" value={semesterForm.examStartDate} onChange={e => setSemesterForm(v => ({...v,examStartDate:e.target.value}))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"/></label>
          <label className="block space-y-1 text-sm"><span className="font-medium text-slate-700">Exam ends</span><input type="date" value={semesterForm.examEndDate} onChange={e => setSemesterForm(v => ({...v,examEndDate:e.target.value}))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"/></label>
          <label className="block space-y-1 text-sm"><span className="font-medium text-slate-700">Results publish date</span><input type="date" value={semesterForm.resultsPublishDate} onChange={e => setSemesterForm(v => ({...v,resultsPublishDate:e.target.value}))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"/></label>
        </div>
        <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus size={15}/>{saving ? 'Saving…' : editingSemesterId ? 'Save semester' : 'Add semester'}</button>
      </form>}
      {selectedYear?.status === 'closed' && <p className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600"><Lock size={14}/> This academic year is closed. Historical dates and semester records are protected.</p>}
      <p className="flex items-center gap-2 text-[11px] text-slate-500"><Clock3 size={13}/> Dates are stored as Gregorian ISO dates; the school's Ethiopian/Gregorian calendar preference controls how dates are presented elsewhere.</p>
    </section>
  );
};
