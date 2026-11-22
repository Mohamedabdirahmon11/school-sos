import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Copy, Printer, RefreshCw, Users } from 'lucide-react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { Card, Button, Pill, EmptyState, FormRow } from '../SchoolDesignSystem.tsx';
import { AcademicSetupHeader } from './AcademicSetupHeader.tsx';
import './academic-setup.css';

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
  const [formTeacherClasses, setFormTeacherClasses] = useState<any[]>([]);
  const [teacherUserIds, setTeacherUserIds] = useState<Record<string, string>>({});
  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [view, setView] = useState<'class' | 'matrix' | 'teacher'>('class');
  const [assignmentClassId, setAssignmentClassId] = useState('');
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
  const [replaceOverride, setReplaceOverride] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyYear, setCopyYear] = useState('');
  const [copyTerm, setCopyTerm] = useState('');
  const [workloadLimits, setWorkloadLimits] = useState<Record<string, string>>({});
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const q = new URLSearchParams();
      if (yearId) q.set('academicYearId', yearId);
      if (yearId) q.set('termId', termId || 'all');
      const result = await ApiClient.request<Data>('/teacher-assignments' + (q.size ? '?' + q.toString() : ''));
      setData(result);
      setWorkloadLimits(Object.fromEntries((result.teachers || []).map((t: any) => [t.id, t.max_periods_per_week == null ? '' : String(t.max_periods_per_week)])));
      if (!yearId && result.selectedAcademicYearId) setYearId(result.selectedAcademicYearId);
      if (!termId && result.selectedTermId) setTermId(result.selectedTermId);
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [school?.id, yearId, termId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (data?.classes.length && !data.classes.some(row => row.id === assignmentClassId)) {
      setAssignmentClassId(data.classes[0].id);
    }
  }, [data, assignmentClassId]);

  useEffect(() => {
    let active = true;
    if (!school?.id) return;
    Promise.all([ApiClient.getClasses(), ApiClient.getTeachers({ page: 1, pageSize: 200 })])
      .then(([classRows, teacherRows]) => {
        if (!active) return;
        setFormTeacherClasses(Array.isArray(classRows) ? classRows : []);
        setTeacherUserIds(Object.fromEntries((Array.isArray(teacherRows) ? teacherRows : []).map((teacher: any) => [teacher.id, teacher.userId || ''])));
      })
      .catch(() => { if (active) { setFormTeacherClasses([]); setTeacherUserIds({}); } });
    return () => { active = false; };
  }, [school?.id]);

  const saveFormTeacherClass = async (teacherId: string, classId: string) => {
    if (isReadOnly || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await ApiClient.updateTeacher(teacherId, { formTeacherClassId: classId } as any);
      const [classRows, teacherRows] = await Promise.all([ApiClient.getClasses(), ApiClient.getTeachers({ page: 1, pageSize: 200 })]);
      setFormTeacherClasses(Array.isArray(classRows) ? classRows : []);
      setTeacherUserIds(Object.fromEntries((Array.isArray(teacherRows) ? teacherRows : []).map((teacher: any) => [teacher.id, teacher.userId || ''])));
      setNotice(classId ? 'Fasalka Form Teacher waa la qoondeeyey.' : 'Qoondeynta Form Teacher waa laga qaaday.');
    } catch (e) { setError(errorText(e)); }
    finally { setSaving(false); }
  };

  const assignmentFor = (classId: string, subjectId: string) => {
    if (!data) return undefined;
    return data.assignments.find(a => a.class_id === classId && a.subject_id === subjectId);
  };
  const qualified = (subjectId: string, teacherId: string) => (data?.qualifiedTeacherIdsBySubject?.[subjectId] || []).includes(teacherId);
  const className = (id: string) => {
    const row = data?.classes.find(c => c.id === id);
    return row ? [row.name, row.section].filter(Boolean).join(' · ') : id;
  };
  const subjectName = (id: string) => data?.subjects.find(s => s.id === id)?.name || id;
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
      let result: any;
      try {
        result = await ApiClient.request(existing ? '/teacher-assignments/' + existing.id : '/teacher-assignments', {
          method: existing ? 'PUT' : 'POST', body: JSON.stringify(payload)
        });
      } catch (e) {
        if (!errorText(e).toLowerCase().includes('jadwal') || !window.confirm('Qoondeyntan jadwal ayaa ku xiran. Ma xaqiijinaysaa in jadwalka ku xiran la nadiifiyo si macallinka loo beddelo?')) throw e;
        result = await ApiClient.request(existing ? '/teacher-assignments/' + existing.id : '/teacher-assignments', {
          method: existing ? 'PUT' : 'POST', body: JSON.stringify({ ...payload, clearDependentEntries: true })
        });
      }
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
  const visibleRowKeys = new Set(filteredRows.map(row => row.class_id + ':' + row.subject_id));
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
      let result: any = await ApiClient.request('/teacher-assignments/bulk', { method: 'POST', body: JSON.stringify({
        teacherId: bulkTeacher, academicYearId: yearId, termId: termId || null, override, targets
      }) });
      const timetableBlocked = (result.skipped || []).filter((x: any) => String(x.reason).toLowerCase().includes('jadwal'));
      if (timetableBlocked.length && window.confirm('Qaar ka mid ah qoondeynta jadwal ayaa ku xiran. Ma xaqiijinaysaa in jadwalladaas la nadiifiyo oo qoondeynta la beddelo?')) {
        const retry: any = await ApiClient.request('/teacher-assignments/bulk', { method: 'POST', body: JSON.stringify({
          teacherId: bulkTeacher, academicYearId: yearId, termId: termId || null, override,
          clearDependentEntries: true, targets: timetableBlocked.map((x: any) => x.target)
        }) });
        result = { ...retry, saved: result.saved + retry.saved, skipped: [...(result.skipped || []).filter((x: any) => !String(x.reason).toLowerCase().includes('jadwal')), ...(retry.skipped || [])] };
      }
      setNotice(result.saved + ' qoondeyn ayaa la sameeyey; ' + (result.skipped?.length || 0) + ' waa la dhaafay.' + (result.warnings?.length ? ' ' + result.warnings.join(' ') : ''));
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
      const allowOverride = replaceOverride && window.confirm('DIGNIIN: Ka-reebis ayaa loo adeegsan doonaa maaddooyinka aanu macallinka cusub aqoon ahaan ugu xirnayn. Ma sii waddaa?');
      const result: any = await ApiClient.request('/teacher-assignments/replace-teacher', { method: 'POST', body: JSON.stringify({
        fromTeacherId: replaceFrom, toTeacherId: replaceTo, assignmentIds: selectedAssignmentIds,
        override: allowOverride, clearDependentEntries: clear
      }) });
      setNotice(result.changed + ' qoondeyn ayaa loo wareejiyey macallinka cusub; ' + result.skipped.length + ' waa la dhaafay.' + (result.warnings?.length ? ' ' + result.warnings.join(' ') : ''));
      if (result.skipped.length) setError(result.skipped.map((x: any) => x.reason).join(' · '));
      setReplaceOpen(false); setSelectedAssignmentIds([]); await load();
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

  if (loading && !data) return <div className="academic-setup"><div className="wrap"><AcademicSetupHeader active="sch_teacher_assignments" onNavigate={onNavigate} /><div className="loading">Loading teacher assignments…</div></div></div>;
  if (error && !data) return <div className="academic-setup"><div className="wrap"><AcademicSetupHeader active="sch_teacher_assignments" onNavigate={onNavigate} /><section className="card"><EmptyState><p className="font-semibold">{error}</p><Button onClick={() => void load()}>Mar kale isku day</Button></EmptyState></section></div></div>;
  if (!data) return null;
  const classViewClassId = data.classes.some(row => row.id === assignmentClassId) ? assignmentClassId : (data.classes[0]?.id || '');
  const classViewClass = data.classes.find(row => row.id === classViewClassId);
  const classViewRows = data.curriculum.filter(row => row.class_id === classViewClassId);
  const formTeacherClass = formTeacherClasses.find(row => row.id === classViewClassId);
  const formTeacherUserId = formTeacherClass?.classTeacherId || '';
  const formTeacherName = data.teachers.find(row => teacherUserIds[row.id] === formTeacherUserId)?.full_name || 'lama dooran';
  const classViewUnassigned = classViewRows.filter(row => !assignmentFor(row.class_id, row.subject_id)).length;

  const missingSetup = !data.academicYears.length
    ? { title: 'Sannad-dugsiyeed lama samayn', detail: 'Marka hore dhammee Tallaabada 1.', view: 'sch_setup_academics' }
    : !data.classes.length ? { title: 'Fasallo lama helin', detail: 'Marka hore dhammee Tallaabada 2.', view: 'sch_classes' }
    : !data.subjects.length ? { title: 'Maaddooyin lama helin', detail: 'Marka hore dhammee Tallaabada 3.', view: 'sch_subjects' }
    : !data.curriculum.length ? { title: 'Manhaj lama diyaarin', detail: 'Marka hore dhammee Tallaabada 4.', view: 'sch_curriculum' }
    : !data.teachers.length ? { title: 'Macallimiin lama diiwaangelin', detail: 'Marka hore dhammee Tallaabada 5.', view: 'sch_teachers' }
    : null;
  if (missingSetup) return <div className="academic-setup"><div className="wrap">
    <AcademicSetupHeader active="sch_teacher_assignments" onNavigate={onNavigate} />
    <h2>Teacher Assignment</h2>
    <p className="lead">Maaddo kasta ee fasalka waxaa leh hal macallin. Form Teacher-ku waa macallinka masuulka ah fasalka.</p>
    <section className="card"><EmptyState><BookOpen className="mx-auto h-8 w-8 text-teal-700" /><p className="font-semibold">{missingSetup.title}</p><p>{missingSetup.detail}</p><Button onClick={() => onNavigate(missingSetup.view)}>Tag tallaabada loo baahan yahay</Button></EmptyState></section>
  </div></div>;

  const workloadByTeacher = new Map(data.workload.map(w => [w.teacherId, w]));
  const replacementSubjectIds = [...new Set(data.assignments.filter(a => a.teacher_id === replaceFrom).map(a => a.subject_id))];
  const qualifiedForReplacement = (teacherId: string) => !replacementSubjectIds.length || replacementSubjectIds.every(subjectId => qualified(subjectId, teacherId));
  return <div className="academic-setup"><main className="wrap schoolos-assignment-page" aria-label="Qoondeynta Macallimiinta">
    <AcademicSetupHeader active="sch_teacher_assignments" onNavigate={onNavigate} />
    <h2>Teacher Assignment</h2>
    <p className="lead">Maaddo kasta ee fasalka waxaa leh hal macallin. Form Teacher-ku waa macallinka masuulka ah fasalka.</p>
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">{error}</div>}
    <div className="inline-flex min-h-9 items-center rounded-full border border-[var(--schoolos-line)] bg-[var(--schoolos-surface)] px-3 text-xs font-bold text-[var(--schoolos-accent)]">{data.unassignedCount > 0 ? data.unassignedCount + " maaddo macallin la’aan" : "Dhammaan waa la qoondeeyay"}</div>
    {view !== 'class' && <>
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[['Maaddooyinka fasallada', data.totalClassSubjects], ['La qoondeeyey', data.assignedCount], ['Maaddo macallin la’aan', data.unassignedCount], ['Macallimiin culayskoodu badan yahay', data.overloadedCount]].map(([label, value]) =>
        <Card key={String(label)} className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p></Card>)}
    </section>
    <Card className="space-y-2 p-4">
      <div className="flex items-center justify-between text-sm"><span className="font-semibold">Horumarka qoondeynta</span><strong>{assignedPercent}% la qoondeeyey</strong></div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: assignedPercent + '%' }} /></div>
    </Card>
    </>}
    {view !== 'class' && <div className="schoolos-assignment-toolbar flex flex-wrap items-end gap-3">
      <FormRow label="Sannad-dugsiyeed"><select value={yearId} onChange={e => { setYearId(e.target.value); setTermId(''); }} className="min-w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">{data.academicYears.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' · Hadda' : ''}</option>)}</select></FormRow>
      <FormRow label="Term"><select value={termId} onChange={e => setTermId(e.target.value)} className="min-w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Sannadka oo dhan</option>{data.terms.filter(t => t.academic_year_id === yearId).map(t => <option key={t.id} value={t.id}>{t.name}{t.is_current ? ' · Hadda' : ''}</option>)}</select></FormRow>
      <FormRow label="Fasal"><select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="min-w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Dhammaan fasallada</option>{data.classes.map(c => <option key={c.id} value={c.id}>{className(c.id)}</option>)}</select></FormRow>
      <FormRow label="Maaddo"><select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} className="min-w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Dhammaan maaddooyinka</option>{data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FormRow>
      <FormRow label="Macallin"><select value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)} className="min-w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Dhammaan macallimiinta</option>{data.teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></FormRow>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={unassignedOnly} onChange={e => setUnassignedOnly(e.target.checked)} /> Kuwa bannaan oo keliya</label>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Raadi fasal ama maaddo..." className="min-w-40 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2"><Button variant={view === 'class' ? 'primary' : 'secondary'} onClick={() => setView('class')}>Class view</Button><Button variant={view === 'matrix' ? 'primary' : 'secondary'} onClick={() => setView('matrix')}>Matrix</Button><Button variant={view === 'teacher' ? 'primary' : 'secondary'} onClick={() => setView('teacher')}>Macallin kasta</Button></div>
      <div className="flex flex-wrap gap-2"><Button disabled={isReadOnly} onClick={() => setBulkOpen(!bulkOpen)}>Ku dar</Button><Button disabled={isReadOnly} onClick={() => setReplaceOpen(!replaceOpen)}>Beddel macallin</Button><Button disabled={isReadOnly} onClick={() => setCopyOpen(!copyOpen)}><Copy className="mr-1 inline h-4 w-4" /> Koobiyeey</Button><Button onClick={() => window.print()}><Printer className="mr-1 inline h-4 w-4" /> Daabac / PDF</Button><Button onClick={() => void load()}><RefreshCw className="mr-1 inline h-4 w-4" /> Cusboonaysii</Button></div>
    </div>
    {bulkOpen && <Card className="grid gap-3 p-4 md:grid-cols-2"><h3 className="font-semibold md:col-span-2">Hal macallin ku qoondee fasallo badan</h3><FormRow label="Macallin"><select value={bulkTeacher} onChange={e => setBulkTeacher(e.target.value)} className="rounded-xl border p-2 dark:bg-slate-900"><option value="">Dooro macallin</option>{[...data.teachers].filter(t => t.status === 'active').sort((a,b) => Number(qualified(bulkSubject, b.id)) - Number(qualified(bulkSubject, a.id))).map(t => <option key={t.id} value={t.id}>{qualified(bulkSubject, t.id) ? '' : '⚠ '}{t.full_name}</option>)}</select></FormRow><FormRow label="Maaddo"><select value={bulkSubject} onChange={e => setBulkSubject(e.target.value)} className="rounded-xl border p-2 dark:bg-slate-900"><option value="">Dooro maaddo</option>{data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FormRow><div className="md:col-span-2 flex flex-wrap gap-3">{data.classes.filter(c => !bulkSubject || data.curriculum.some(r => r.class_id === c.id && r.subject_id === bulkSubject)).map(c => <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bulkClasses.includes(c.id)} onChange={e => setBulkClasses(old => e.target.checked ? [...old, c.id] : old.filter(id => id !== c.id))} />{className(c.id)}</label>)}</div><div className="flex gap-2"><Button variant="primary" disabled={saving || isReadOnly} onClick={() => void doBulk()}>Kaydi qoondeynta</Button><Button onClick={() => setBulkOpen(false)}>Xir</Button></div></Card>}
    {replaceOpen && <Card className="grid gap-3 p-4 md:grid-cols-2"><h3 className="font-semibold md:col-span-2">U wareeji dhammaan qoondeynta macallin kale</h3><FormRow label="Macallinka hadda"><select value={replaceFrom} onChange={e => setReplaceFrom(e.target.value)} className="rounded-xl border p-2 dark:bg-slate-900"><option value="">Dooro macallin</option>{data.teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></FormRow><FormRow label="Macallinka cusub"><select value={replaceTo} onChange={e => setReplaceTo(e.target.value)} className="rounded-xl border p-2 dark:bg-slate-900"><option value="">Dooro macallin</option>{data.teachers.filter(t => t.status === 'active').sort((a,b) => Number(qualifiedForReplacement(b.id)) - Number(qualifiedForReplacement(a.id))).map(t => <option key={t.id} value={t.id}>{qualifiedForReplacement(t.id) ? '' : '⚠ '}{t.full_name}</option>)}</select></FormRow><label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={replaceOverride} onChange={e => setReplaceOverride(e.target.checked)} /> Oggolow ka-reebis aqooneed (digniin)</label><div className="flex gap-2"><Button variant="primary" disabled={saving || isReadOnly} onClick={() => void doReplace()}>Beddel dhammaan / kuwa la doortay</Button><Button onClick={() => setReplaceOpen(false)}>Xir</Button></div></Card>}
    {copyOpen && <Card className="grid gap-3 p-4 md:grid-cols-2"><h3 className="font-semibold md:col-span-2">Ka soo koobiyee sannad ama term hore</h3><FormRow label="Sannadka laga koobiyeeynayo"><select value={copyYear} onChange={e => { setCopyYear(e.target.value); setCopyTerm(''); }} className="rounded-xl border p-2 dark:bg-slate-900"><option value="">Dooro sannad</option>{data.academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select></FormRow><FormRow label="Term-ka laga koobiyeeynayo"><select value={copyTerm} onChange={e => setCopyTerm(e.target.value)} className="rounded-xl border p-2 dark:bg-slate-900"><option value="">Sannadka oo dhan</option>{data.terms.filter(t => t.academic_year_id === copyYear).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></FormRow><div className="flex gap-2"><Button variant="primary" disabled={saving || isReadOnly || !copyYear} onClick={() => void doCopy()}>Koobiyee, iska dhaaf isku dhacyada</Button><Button onClick={() => setCopyOpen(false)}>Xir</Button></div></Card>}
    {view === 'class' ? <section className="gr">
      <section className="card">
        <div className="bar">
          <div className="f"><label htmlFor="assignment-year">Sannad-dugsiyeed</label><select id="assignment-year" value={yearId} onChange={event => { setYearId(event.target.value); setTermId(''); }}><option value="">Dooro sannad</option>{data.academicYears.map(year => <option key={year.id} value={year.id}>{year.name}</option>)}</select></div>
          <div className="f"><label htmlFor="assignment-term">Term</label><select id="assignment-term" value={termId} onChange={event => setTermId(event.target.value)}><option value="">Sannadka oo dhan</option>{data.terms.filter(term => term.academic_year_id === yearId).map(term => <option key={term.id} value={term.id}>{term.name}</option>)}</select></div>
          <div className="f"><label htmlFor="assignment-class">Class</label><select id="assignment-class" value={classViewClassId} onChange={event => setAssignmentClassId(event.target.value)}>{data.classes.map(row => <option key={row.id} value={row.id}>{className(row.id)}</option>)}</select></div>
          <span className="spacer" />
          <span className={`pill ${classViewUnassigned ? 'bad' : ''}`}>{classViewUnassigned ? classViewUnassigned + " maaddo macallin la’aan" : "Dhammaan waa la qoondeeyay"}</span>
        </div>
        {notice && <div role="status" className="msg ok">{notice}</div>}
        {error && <div role="alert" className="msg bad">{error}</div>}
        <p className="mut" style={{ marginBottom: 10 }}>Form Teacher: <b style={{ color: 'var(--fg)' }}>{formTeacherName}</b> · {Number(formTeacherClass?.shift || 1) === 2 ? 'Afternoon' : 'Morning'} shift</p>
        <div className="scroll"><table><thead><tr><th>Subject</th><th className="n">Periods</th><th>Teacher</th></tr></thead><tbody>
          {classViewRows.map(row => {
            const assigned = assignmentFor(row.class_id, row.subject_id);
            const teacherIds = data.qualifiedTeacherIdsBySubject[row.subject_id] || [];
            const options = [...data.teachers].filter(teacher => teacher.status === 'active').sort((a, b) => Number(teacherIds.includes(b.id)) - Number(teacherIds.includes(a.id)));
            return <tr key={row.id}>
              <td><b>{subjectName(row.subject_id)}</b></td>
              <td className="n">{row.periods_per_week}</td>
              <td><select aria-label={className(row.class_id) + ' ' + subjectName(row.subject_id)} disabled={isReadOnly || saving} value={assigned?.teacher_id || ''} onChange={event => void saveCell(row, event.target.value)}>
                <option value="">— Dooro macallin —</option>{options.map(teacher => <option key={teacher.id} value={teacher.id}>{teacherIds.includes(teacher.id) ? '' : '⚠ '}{teacher.full_name}</option>)}
              </select>{assigned?.qualification_override && <span className="mut"> · Ka-reebis</span>}</td>
            </tr>;
          })}
          {!classViewRows.length && <tr><td colSpan={3} className="mut">Fasalkan maaddo ma leh. Ka dooro Class Curriculum.</td></tr>}
        </tbody></table></div>
      </section>
      <aside className="card">
        <div className="lbl" style={{ marginBottom: 10 }}>Culeyska macallimiinta</div>
        <div className="wl">{data.teachers.map(teacher => {
          const workload = workloadByTeacher.get(teacher.id);
          const periods = workload?.periodsPerWeek || 0;
          const max = workload?.maxPeriodsPerWeek || 30;
          const assignments = data.assignments.filter(item => item.teacher_id === teacher.id);
          return <div key={teacher.id}>
            <div className="r"><b>{teacher.full_name}</b><span className={workload?.overloaded ? 'pill bad' : 'mut'}>{periods}/{max}</span></div>
            <div className={`meter ${workload?.overloaded ? 'over' : ''}`}><i style={{ width: Math.min(100, periods / max * 100) + '%' }} /></div>
            <div className="mut" style={{ fontSize: 12, marginTop: 3 }}>{assignments.length ? assignments.map(item => className(item.class_id) + ' · ' + subjectName(item.subject_id)).join(', ') : 'Wali lama qoondayn'}</div>
          </div>;
        })}</div>
      </aside>
    </section>
    : view === 'matrix' ? <Card className="overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr><th className="p-3">Fasal / Qayb</th>{filteredSubjects.map(s => <th key={s.id} className="p-3">{s.name}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filteredClasses.map(c => <tr key={c.id}><th className="p-3 font-semibold">{className(c.id)}</th>{filteredSubjects.map(s => { const row = data.curriculum.find(r => r.class_id === c.id && r.subject_id === s.id); const assigned = row ? assignmentFor(c.id, s.id) : undefined; const isVisible = row && visibleRowKeys.has(c.id + ':' + s.id); const teacherIds = data.qualifiedTeacherIdsBySubject[s.id] || []; const options = [...data.teachers].filter(t => t.status === 'active').sort((a,b) => Number(teacherIds.includes(b.id)) - Number(teacherIds.includes(a.id))); return <td key={s.id} className="p-2">{!row || !isVisible ? <span className="text-slate-300">—</span> : <div className={!assigned ? 'rounded-lg bg-amber-50 p-1 dark:bg-amber-950/40' : ''}><select aria-label={className(c.id) + ' ' + s.name} disabled={isReadOnly || saving} value={assigned?.teacher_id || ''} onChange={e => void saveCell(row, e.target.value)} className="w-full min-w-36 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"><option value="">— Lama qoondeyn —</option>{options.map(t => <option key={t.id} value={t.id}>{teacherIds.includes(t.id) ? '' : '⚠ '}{t.full_name}</option>)}</select>{assigned?.qualification_override && <p className="mt-1 text-[10px] text-amber-700">⚠ Ka-reebis</p>}</div>}</td>; })}</tr>)}</tbody></table></div>{!data.curriculum.length && <EmptyState><BookOpen className="mx-auto h-8 w-8 text-teal-700" /><p>Manhaj lama helin.</p><Button onClick={() => onNavigate('sch_curriculum')}>Tag Manhajka (Tallaabada 4)</Button></EmptyState>}</Card>
    : <section className="schoolos-teacher-roster space-y-3">
      <div className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--schoolos-line)] bg-[var(--schoolos-surface)] px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-[var(--schoolos-muted)] md:grid-cols-[minmax(170px,.8fr)_minmax(280px,1.8fr)_minmax(150px,.7fr)]">
        <span>Macallin</span><span>Fasallada uu dhigo (maaddo)</span><span>Form Teacher</span>
      </div>
      {data.teachers.filter(t => !unassignedOnly && (!teacherFilter || t.id === teacherFilter) && (!search.trim() || t.full_name.toLowerCase().includes(search.trim().toLowerCase()) || data.assignments.some(a => a.teacher_id === t.id && [className(a.class_id), subjectName(a.subject_id)].some(v => v.toLowerCase().includes(search.trim().toLowerCase())))) && data.assignments.some(a => a.teacher_id === t.id && (!classFilter || a.class_id === classFilter) && (!subjectFilter || a.subject_id === subjectFilter))).map(t => {
        const w = workloadByTeacher.get(t.id);
        const pct = w?.maxPeriodsPerWeek ? Math.min(100, Math.round(w.periodsPerWeek / w.maxPeriodsPerWeek * 100)) : 0;
        const tone = w?.overloaded ? 'bg-rose-600' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-600';
        const rows = data.assignments.filter(a => a.teacher_id === t.id && (!classFilter || a.class_id === classFilter) && (!subjectFilter || a.subject_id === subjectFilter));
        return <Card key={t.id} className="schoolos-teacher-row grid min-w-0 grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(170px,.8fr)_minmax(280px,1.8fr)_minmax(150px,.7fr)]">
          <div className="min-w-0"><h3 className="font-semibold text-[var(--schoolos-ink)]">{t.full_name}</h3><p className="mt-1 text-xs text-[var(--schoolos-muted)]">Koodh: {t.teacher_code || t.staff_id || '—'}</p><p className="mt-3 text-[11px] text-[var(--schoolos-muted)]">Culayska: {w?.periodsPerWeek || 0} / {w?.maxPeriodsPerWeek ?? '—'} xiisadood</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={'h-full rounded-full ' + tone} style={{ width: (w?.maxPeriodsPerWeek ? pct : 0) + '%' }} /></div>{w?.overloaded && <p className="mt-1 text-xs text-rose-700">Culayska shaqadu wuu ka badan yahay xadka.</p>}</div>
          <div className="min-w-0"><div className="flex flex-wrap gap-2">{rows.map(a => <label key={a.id} className="schoolos-assignment-chip inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: "hsl(" + ((Math.max(0, data.subjects.findIndex(subject => subject.id === a.subject_id)) * 53) % 360) + " 42% 78%)", backgroundColor: "hsl(" + ((Math.max(0, data.subjects.findIndex(subject => subject.id === a.subject_id)) * 53) % 360) + " 60% 96%)", color: "hsl(" + ((Math.max(0, data.subjects.findIndex(subject => subject.id === a.subject_id)) * 53) % 360) + " 48% 28%)" }}><input aria-label={'Dooro qoondeynta ' + className(a.class_id) + ' ' + subjectName(a.subject_id)} type="checkbox" checked={selectedAssignmentIds.includes(a.id)} onChange={e => setSelectedAssignmentIds(old => e.target.checked ? [...old, a.id] : old.filter(id => id !== a.id))} /><span>{className(a.class_id)} · {subjectName(a.subject_id)}</span><button type="button" aria-label={'Ka saar ' + subjectName(a.subject_id) + ' ee ' + className(a.class_id)} title="Ka saar qoondaynta" disabled={saving || isReadOnly} onClick={() => { const curriculumRow = data.curriculum.find(r => r.class_id === a.class_id && r.subject_id === a.subject_id); if (curriculumRow) void saveCell(curriculumRow, ''); }} className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-40">×</button></label>)}</div><div className="mt-3 flex items-end gap-2"><label className="min-w-0 flex-1 text-[11px] text-[var(--schoolos-muted)]">Xadka xiisadaha / toddobaad<input aria-label={'Xadka xiisadaha ' + t.full_name} type="number" min="1" max="30" value={workloadLimits[t.id] ?? ''} onChange={e => setWorkloadLimits(old => ({ ...old, [t.id]: e.target.value }))} placeholder="Aan xad lahayn" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" /></label><Button disabled={saving || isReadOnly} onClick={async () => { setSaving(true); setError(''); try { await ApiClient.request('/teacher-assignments/teachers/' + t.id + '/workload-limit', { method: 'PUT', body: JSON.stringify({ maxPeriodsPerWeek: workloadLimits[t.id] === '' ? null : Number(workloadLimits[t.id]) }) }); setNotice('Xadka culayska waa la kaydiyey.'); await load(); } catch (e) { setError(errorText(e)); } finally { setSaving(false); } }}>Kaydi xadka</Button></div></div>
          <div className="min-w-0"><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--schoolos-muted)] md:hidden">Form Teacher</p><select aria-label={'Form Teacher class for ' + t.full_name} value={formTeacherClasses.find(klass => klass.classTeacherId && klass.classTeacherId === teacherUserIds[t.id])?.id || ''} disabled={saving || isReadOnly || !teacherUserIds[t.id]} onChange={event => void saveFormTeacherClass(t.id, event.target.value)} className="w-full rounded-lg border border-[var(--schoolos-line)] bg-[var(--schoolos-surface)] px-3 py-2 text-xs text-[var(--schoolos-ink)]"><option value="">— Ma aha Form Teacher —</option>{formTeacherClasses.filter(klass => !klass.isArchived && (!klass.classTeacherId || klass.classTeacherId === teacherUserIds[t.id])).map(klass => <option key={klass.id} value={klass.id}>{klass.name}{klass.section ? ' · ' + klass.section : ''}</option>)}</select></div>
        </Card>;
      })}
    </section>}
    {!!data.unassigned.length && <Card className="p-4"><div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" />Maaddooyinka aan weli macallin loo qoondeyn</div><p className="mt-1 text-xs text-slate-500">{data.unassigned.length} maaddo/fasal ayaa sugaya qoondeyn.</p><div className="mt-3 flex flex-wrap gap-2">{data.unassigned.map((r,i) => <Pill key={i}>{className(r.classId)} · {subjectName(r.subjectId)} ({r.periodsPerWeek})</Pill>)}</div></Card>}
    {!data.teachers.length && <Card><EmptyState><Users className="mx-auto h-8 w-8 text-teal-700" /><p>Macallimiin lama helin.</p><Button onClick={() => onNavigate('sch_teachers')}>Tag Macallimiinta (Tallaabada 5)</Button></EmptyState></Card>}
  </main></div>;
};
