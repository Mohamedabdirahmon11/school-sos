import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Copy, Printer, RefreshCw, Users } from 'lucide-react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { PageHeader, Stepper, Card, Button, Pill, EmptyState, FormRow } from '../SchoolDesignSystem.tsx';

type Row = { id: string; class_id: string; subject_id: string; teacher_id: string | null; periods_per_week: number; is_active: boolean };
type Assignment = { id: string; academic_year_id: string; term_id: string | null; class_id: string; section_id: string | null; subject_id: string; teacher_id: string; qualification_override: boolean };
type Data = {
  academicYears: any[]; terms: any[]; classes: any[]; sections: any[]; subjects: any[]; teachers: any[];
  curriculum: Row[]; assignments: Assignment[]; qualifiedTeacherIdsBySubject: Record<string, string[]>;
  workload: Array<{ teacherId: string; periodsPerWeek: number; maxPeriodsPerWeek: number | null; overloaded: boolean }>;
  unassigned: Array<{ classId: string; subjectId: string; periodsPerWeek: number }>;
  selectedAcademicYearId: string; selectedTermId: string; totalClassSubjects: number; assignedCount: number; unassignedCount: number; overloadedCount: number;
};
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Qoondeynta lama kaydin karin.';

export const TeacherAssignmentsView: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { school, isReadOnly } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [view, setView] = useState<'matrix' | 'teacher'>('matrix');
  const [classFilter, setClassFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTeacher, setBulkTeacher] = useState('');
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkClasses, setBulkClasses] = useState<string[]>([]);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceFrom, setReplaceFrom] = useState('');
  const [replaceTo, setReplaceTo] = useState('');
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyYear, setCopyYear] = useState('');
  const [copyTerm, setCopyTerm] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const q = new URLSearchParams();
      if (yearId) q.set('academicYearId', yearId);
      if (termId) q.set('termId', termId);
      const result = await ApiClient.request<Data>('/teacher-assignments' + (q.size ? '?' + q.toString() : ''));
      setData(result);
      if (!yearId && result.selectedAcademicYearId) setYearId(result.selectedAcademicYearId);
      if (!termId && result.selectedTermId) setTermId(result.selectedTermId);
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [school?.id, yearId, termId]);

  useEffect(() => { void load(); }, [load]);

  const assignmentFor = (classId: string, subjectId: string) => {
    if (!data) return undefined;
    const sectionId = data.sections.find(s => s.legacy_class_id === classId)?.id || null;
    return data.assignments.find(a => a.class_id === classId && a.subject_id === subjectId && (a.section_id === sectionId || !a.section_id));
  };
  const qualified = (subjectId: string, teacherId: string) => (data?.qualifiedTeacherIdsBySubject?.[subjectId] || []).includes(teacherId);
  const className = (id: string) => {
    const row = data?.classes.find(c => c.id === id);
    return row ? [row.name, row.section].filter(Boolean).join(' · ') : id;
  };
  const subjectName = (id: string) => data?.subjects.find(s => s.id === id)?.name || id;
  const teacherName = (id: string) => data?.teachers.find(t => t.id === id)?.full_name || id;
  const saveCell = async (row: Row, teacherId: string) => {
    if (!data || isReadOnly || saving) return;
    const existing = assignmentFor(row.class_id, row.subject_id);
    if (!teacherId) {
      if (!existing || !window.confirm('Ma tirtiraysaa qoondeyntan? Haddii jadwal ku xiran yahay waa in la nadiifiyaa.')) return;
      const clear = window.confirm('Haddii jadwal casharro ku xiran yahay, ma xaqiijinaysaa in la nadiifiyo? Cancel haddii aadan rabin.');
      setSaving(true); setError(''); setNotice('');
      try {
        await ApiClient.request('/teacher-assignments/' + existing.id, { method: 'DELETE', body: JSON.stringify({ clearDependentEntries: clear }) });
        setNotice('Qoondeynta waa la tirtiray.'); await load();
      } catch (e) { setError(errorText(e)); }
      finally { setSaving(false); }
      return;
    }
    const isQualified = qualified(row.subject_id, teacherId);
    const override = !isQualified && window.confirm('DIGNIIN: Macallinkan kuma xirna maaddadan. Ma oggolaanaysaa ka-reebis cad?');
    if (!isQualified && !override) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const payload = {
        academicYearId: yearId, termId: termId || null, classId: row.class_id,
        sectionId: data.sections.find(s => s.legacy_class_id === row.class_id)?.id || null,
        subjectId: row.subject_id, teacherId, override
      };
      const result: any = await ApiClient.request(existing ? '/teacher-assignments/' + existing.id : '/teacher-assignments', {
        method: existing ? 'PUT' : 'POST', body: JSON.stringify(payload)
      });
      setNotice(result.warning || 'Macallinka si guul leh ayaa loo qoondeeyey.'); await load();
    } catch (e) { setError(errorText(e)); }
    finally { setSaving(false); }
  };

  const filteredClasses = useMemo(() => (data?.classes || []).filter(c => {
    const q = search.trim().toLowerCase();
    return (!classFilter || c.id === classFilter) && (!q || [c.name, c.section, c.academic_year].some(v => String(v || '').toLowerCase().includes(q)));
  }), [data, classFilter, search]);
  const filteredSubjects = useMemo(() => (data?.subjects || []).filter(s => {
    const q = search.trim().toLowerCase();
    return (!subjectFilter || s.id === subjectFilter) && (!q || [s.name, s.code].some(v => String(v || '').toLowerCase().includes(q)));
  }), [data, subjectFilter, search]);
  const filteredRows = useMemo(() => (data?.curriculum || []).filter(r => {
    if (classFilter && r.class_id !== classFilter) return false;
    if (subjectFilter && r.subject_id !== subjectFilter) return false;
    if (unassignedOnly && assignmentFor(r.class_id, r.subject_id)) return false;
    if (teacherFilter && assignmentFor(r.class_id, r.subject_id)?.teacher_id !== teacherFilter) return false;
    const q = search.trim().toLowerCase();
    return !q || [className(r.class_id), subjectName(r.subject_id)].some(v => v.toLowerCase().includes(q));
  }), [data, classFilter, subjectFilter, unassignedOnly, teacherFilter, search, yearId, termId]);
  const assignedPercent = data?.totalClassSubjects ? Math.round((data.assignedCount / data.totalClassSubjects) * 100) : 0;

  const doBulk = async () => {
    if (!data || !bulkTeacher || !bulkSubject || !bulkClasses.length) return;
    const isQualified = qualified(bulkSubject, bulkTeacher);
    const override = !isQualified && window.confirm('Macallinku kuma xirna maaddadan. Ma oggolaanaysaa ka-reebis?');
    if (!isQualified && !override) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const targets = bulkClasses.flatMap(classId => data.curriculum.filter(r => r.class_id === classId && r.subject_id === bulkSubject).map(r => ({
        classId, sectionId: data.sections.find(s => s.legacy_class_id === classId)?.id || null, subjectId: bulkSubject
      })));
      const result: any = await ApiClient.request('/teacher-assignments/bulk', { method: 'POST', body: JSON.stringify({
        teacherId: bulkTeacher, academicYearId: yearId, termId: termId || null, override, targets
      }) });
      setNotice(result.saved + ' qoondeyn ayaa la sameeyey; ' + (result.skipped?.length || 0) + ' waa la dhaafay.');
      if (result.skipped?.length) setError(result.skipped.map((x: any) => x.reason).join(' · '));
      setBulkOpen(false); setBulkClasses([]); await load();
    } catch (e) { setError(errorText(e)); }
    finally { setSaving(false); }
  };

  const doReplace = async () => {
    if (!replaceFrom || !replaceTo || replaceFrom === replaceTo) return;
    const clear = window.confirm('Haddii jadwal casharro ku xiran yahay, ma xaqiijinaysaa in gelinnadaas la nadiifiyo?');
    setSaving(true); setError(''); setNotice('');
    try {
      const result: any = await ApiClient.request('/teacher-assignments/replace-teacher', { method: 'POST', body: JSON.stringify({
        fromTeacherId: replaceFrom, toTeacherId: replaceTo, clearDependentEntries: clear
      }) });
      setNotice(result.changed + ' qoondeyn ayaa loo wareejiyey macallinka cusub; ' + result.skipped.length + ' waa la dhaafay.');
      if (result.skipped.length) setError(result.skipped.map((x: any) => x.reason).join(' · '));
      setReplaceOpen(false); await load();
    } catch (e) { setError(errorText(e)); }
    finally { setSaving(false); }
  };

  const doCopy = async () => {
    if (!copyYear || !yearId) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const result: any = await ApiClient.request('/teacher-assignments/copy', { method: 'POST', body: JSON.stringify({
        sourceAcademicYearId: copyYear, sourceTermId: copyTerm || null,
        targetAcademicYearId: yearId, targetTermId: termId || null
      }) });
      setNotice(result.copied + ' qoondeyn ayaa la koobiyeeyey; ' + result.skipped.length + ' waa la dhaafay.');
      if (result.skipped.length) setError(result.skipped.map((x: any) => x.reason).join(' · '));
      setCopyOpen(false); await load();
    } catch (e) { setError(errorText(e)); }
    finally { setSaving(false); }
  };

  if (loading && !data) return <div className="mx-auto max-w-6xl space-y-4 p-5"><div className="h-8 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /><div className="h-40 animate-pulse rounded-2xl bg-white dark:bg-slate-900" /></div>;
  if (error && !data) return <div className="mx-auto max-w-4xl p-6"><Card><EmptyState><p className="font-semibold">{error}</p><Button onClick={() => void load()}>Mar kale isku day</Button></EmptyState></Card></div>;
  if (!data) return null;

  const workloadByTeacher = new Map(data.workload.map(w => [w.teacherId, w]));
  return <main className="mx-auto min-w-0 w-full max-w-[1500px] space-y-5 p-4 md:p-8">
    <PageHeader title="Qoondeynta Macallimiinta" subtitle="Ku xidh macallin, maaddo iyo fasal/qayb; la soco culayska shaqada toddobaadlaha ah." />
    <Stepper activeStep={6} labels={['Sannad & Xiisado', 'Fasallo', 'Maaddooyin', 'Manhaj', 'Macallimiin', 'Qoondeyn']} ariaLabel="Tallaabooyinka dejinta waxbarashada" />
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">{error}</div>}
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[['Maaddooyinka fasallada', data.totalClassSubjects], ['La qoondeeyey', data.assignedCount], ['Aan macallin lahayn', data.unassignedCount], ['Macallimiin culayskoodu badan yahay', data.overloadedCount]].map(([label, value]) =>
        <Card key={String(label)} className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p></Card>)}
    </section>
    <Card className="space-y-2 p-4">
      <div className="flex items-center justify-between text-sm"><span className="font-semibold">Horumarka qoondeynta</span><strong>{assignedPercent}% la qoondeeyey</strong></div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: assignedPercent + '%' }} /></div>
    </Card>
    <div className="flex flex-wrap items-end gap-3">
      <FormRow label="Sannad-dugsiyeed"><select value={yearId} onChange={e => { setYearId(e.target.value); setTermId(''); }} className="min-w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">{data.academicYears.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' · Hadda' : ''}</option>)}</select></FormRow>
      <FormRow label="Term"><select value={termId} onChange={e => setTermId(e.target.value)} className="min-w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Sannadka oo dhan</option>{data.terms.filter(t => t.academic_year_id === yearId).map(t => <option key={t.id} value={t.id}>{t.name}{t.is_current ? ' · Hadda' : ''}</option>)}</select></FormRow>
      <FormRow label="Fasal"><select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="min-w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Dhammaan fasallada</option>{data.classes.map(c => <option key={c.id} value={c.id}>{className(c.id)}</option>)}</select></FormRow>
      <FormRow label="Maaddo"><select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} className="min-w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Dhammaan maaddooyinka</option>{data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FormRow>
      <FormRow label="Macallin"><select value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)} className="min-w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Dhammaan macallimiinta</option>{data.teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></FormRow>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={unassignedOnly} onChange={e => setUnassignedOnly(e.target.checked)} /> Kuwa bannaan oo keliya</label>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Raadi fasal ama maaddo..." className="min-w-40 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2"><Button variant={view === 'matrix' ? 'primary' : 'secondary'} onClick={() => setView('matrix')}>Matrix</Button><Button variant={view === 'teacher' ? 'primary' : 'secondary'} onClick={() => setView('teacher')}>Macallin kasta</Button></div>
      <div className="flex flex-wrap gap-2"><Button disabled={isReadOnly} onClick={() => setBulkOpen(!bulkOpen)}>Qoondee fasallo badan</Button><Button disabled={isReadOnly} onClick={() => setReplaceOpen(!replaceOpen)}>Beddel macallin</Button><Button disabled={isReadOnly} onClick={() => setCopyOpen(!copyOpen)}><Copy className="mr-1 inline h-4 w-4" /> Koobiyeey</Button><Button onClick={() => window.print()}><Printer className="mr-1 inline h-4 w-4" /> Daabac / PDF</Button><Button onClick={() => void load()}><RefreshCw className="mr-1 inline h-4 w-4" /> Cusboonaysii</Button></div>
    </div>
    {bulkOpen && <Card className="grid gap-3 p-4 md:grid-cols-2"><h3 className="font-semibold md:col-span-2">Hal macallin ku qoondee fasallo badan</h3><FormRow label="Macallin"><select value={bulkTeacher} onChange={e => setBulkTeacher(e.target.value)} className="rounded-xl border p-2 dark:bg-slate-900"><option value="">Dooro macallin</option>{data.teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></FormRow><FormRow label="Maaddo"><select value={bulkSubject} onChange={e => setBulkSubject(e.target.value)} className="rounded-xl border p-2 dark:bg-slate-900"><option value="">Dooro maaddo</option>{data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FormRow><div className="md:col-span-2 flex flex-wrap gap-3">{data.classes.filter(c => !bulkSubject || data.curriculum.some(r => r.class_id === c.id && r.subject_id === bulkSubject)).map(c => <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bulkClasses.includes(c.id)} onChange={e => setBulkClasses(old => e.target.checked ? [...old, c.id] : old.filter(id => id !== c.id))} />{className(c.id)}</label>)}</div><div className="flex gap-2"><Button variant="primary" disabled={saving || isReadOnly} onClick={() => void doBulk()}>Kaydi qoondeynta</Button><Button onClick={() => setBulkOpen(false)}>Xir</Button></div></Card>}
    {replaceOpen && <Card className="grid gap-3 p-4 md:grid-cols-2"><h3 className="font-semibold md:col-span-2">U wareeji dhammaan qoondeynta macallin kale</h3><FormRow label="Macallinka hadda"><select value={replaceFrom} onChange={e => setReplaceFrom(e.target.value)} className="rounded-xl border p-2 dark:bg-slate-900"><option value="">Dooro macallin</option>{data.teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></FormRow><FormRow label="Macallinka cusub"><select value={replaceTo} onChange={e => setReplaceTo(e.target.value)} className="rounded-xl border p-2 dark:bg-slate-900"><option value="">Dooro macallin</option>{data.teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></FormRow><div className="flex gap-2"><Button variant="primary" disabled={saving || isReadOnly} onClick={() => void doReplace()}>Beddel dhammaan</Button><Button onClick={() => setReplaceOpen(false)}>Xir</Button></div></Card>}
    {copyOpen && <Card className="grid gap-3 p-4 md:grid-cols-2"><h3 className="font-semibold md:col-span-2">Ka soo koobiyee sannad ama term hore</h3><FormRow label="Sannadka laga koobiyeeynayo"><select value={copyYear} onChange={e => { setCopyYear(e.target.value); setCopyTerm(''); }} className="rounded-xl border p-2 dark:bg-slate-900"><option value="">Dooro sannad</option>{data.academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select></FormRow><FormRow label="Term-ka laga koobiyeeynayo"><select value={copyTerm} onChange={e => setCopyTerm(e.target.value)} className="rounded-xl border p-2 dark:bg-slate-900"><option value="">Sannadka oo dhan</option>{data.terms.filter(t => t.academic_year_id === copyYear).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></FormRow><div className="flex gap-2"><Button variant="primary" disabled={saving || isReadOnly || !copyYear} onClick={() => void doCopy()}>Koobiyee, iska dhaaf isku dhacyada</Button><Button onClick={() => setCopyOpen(false)}>Xir</Button></div></Card>}
    {view === 'matrix' ? <Card className="overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr><th className="p-3">Fasal / Qayb</th>{filteredSubjects.map(s => <th key={s.id} className="p-3">{s.name}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filteredClasses.map(c => <tr key={c.id}><th className="p-3 font-semibold">{className(c.id)}</th>{filteredSubjects.map(s => { const row = data.curriculum.find(r => r.class_id === c.id && r.subject_id === s.id); const assigned = row ? assignmentFor(c.id, s.id) : undefined; const teacherIds = data.qualifiedTeacherIdsBySubject[s.id] || []; const options = [...data.teachers].sort((a,b) => Number(teacherIds.includes(b.id)) - Number(teacherIds.includes(a.id))); return <td key={s.id} className="p-2">{!row ? <span className="text-slate-300">—</span> : <div className={!assigned ? 'rounded-lg bg-amber-50 p-1 dark:bg-amber-950/40' : ''}><select aria-label={className(c.id) + ' ' + s.name} disabled={isReadOnly || saving} value={assigned?.teacher_id || ''} onChange={e => void saveCell(row, e.target.value)} className="w-full min-w-36 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"><option value="">— Lama qoondeyn —</option>{options.map(t => <option key={t.id} value={t.id}>{teacherIds.includes(t.id) ? '' : '⚠ '}{t.full_name}</option>)}</select>{assigned?.qualification_override && <p className="mt-1 text-[10px] text-amber-700">⚠ Ka-reebis</p>}</div>}</td>; })}</tr>)}</tbody></table></div>{!data.curriculum.length && <EmptyState><BookOpen className="mx-auto h-8 w-8 text-teal-700" /><p>Manhaj lama helin.</p><Button onClick={() => onNavigate('sch_curriculum')}>Tag Manhajka (Tallaabada 4)</Button></EmptyState>}</Card>
    : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.teachers.filter(t => !teacherFilter || t.id === teacherFilter).map(t => { const w = workloadByTeacher.get(t.id); const pct = w?.maxPeriodsPerWeek ? Math.min(100, Math.round(w.periodsPerWeek / w.maxPeriodsPerWeek * 100)) : 0; const tone = w?.overloaded ? 'bg-rose-600' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-600'; const rows = data.assignments.filter(a => a.teacher_id === t.id); return <Card key={t.id} className="space-y-3 p-4"><div className="flex items-center justify-between"><div><h3 className="font-semibold">{t.full_name}</h3><p className="text-xs text-slate-500">{t.teacher_code || t.staff_id || ''}</p></div><Pill>{rows.length} qoondeyn</Pill></div><div><div className="flex justify-between text-xs"><span>Culayska toddobaadka</span><strong>{w?.periodsPerWeek || 0} / {w?.maxPeriodsPerWeek ?? '—'} xiisadood</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={'h-full rounded-full ' + tone} style={{ width: (w?.maxPeriodsPerWeek ? pct : 0) + '%' }} /></div>{w?.overloaded && <p className="mt-1 text-xs text-rose-700">Culayska shaqadu wuu ka badan yahay xadka.</p>}</div><div className="flex flex-wrap gap-1">{rows.map(a => <Pill key={a.id}>{className(a.class_id)} · {subjectName(a.subject_id)}</Pill>)}</div></Card>})}</div>}
    {!!data.unassigned.length && <Card className="p-4"><div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" />Maaddooyinka aan weli macallin loo qoondeyn</div><p className="mt-1 text-xs text-slate-500">{data.unassigned.length} maaddo/fasal ayaa sugaya qoondeyn.</p><div className="mt-3 flex flex-wrap gap-2">{data.unassigned.map((r,i) => <Pill key={i}>{className(r.classId)} · {subjectName(r.subjectId)} ({r.periodsPerWeek})</Pill>)}</div></Card>}
    {!data.teachers.length && <Card><EmptyState><Users className="mx-auto h-8 w-8 text-teal-700" /><p>Macallimiin lama helin.</p><Button onClick={() => onNavigate('sch_teachers')}>Tag Macallimiinta (Tallaabada 5)</Button></EmptyState></Card>}
  </main>;
};
