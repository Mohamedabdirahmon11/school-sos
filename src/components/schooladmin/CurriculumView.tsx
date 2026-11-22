import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, Copy, Loader2, Save, AlertTriangle } from 'lucide-react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { SchoolClass, Subject } from '../../types/index.ts';
import { PageHeader, Stepper, Card, Button, Pill, EmptyState, FormRow } from '../SchoolDesignSystem.tsx';

type CurriculumRow = { id: string; subjectId: string; periodsPerWeek: number; isActive: boolean };
type CurriculumDetail = {
  class: SchoolClass;
  capacity: { workingDays: number; lessonPeriodsPerDay: number; weeklyCapacity: number };
  curriculum: CurriculumRow[];
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export const CurriculumView: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { school, isReadOnly } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classId, setClassId] = useState('');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [detail, setDetail] = useState<CurriculumDetail | null>(null);
  const [included, setIncluded] = useState<string[]>([]);
  const [periods, setPeriods] = useState<Record<string, number>>({});
  const [targets, setTargets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState<Record<'1-4' | '5-6' | '7-8', string[]>>({ '1-4': [], '5-6': [], '7-8': [] });
  const [templateBand, setTemplateBand] = useState<'1-4' | '5-6' | '7-8'>('1-4');
  const [templateDraft, setTemplateDraft] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateApplying, setTemplateApplying] = useState(false);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [classRows, subjectRows, templateRows] = await Promise.all([ApiClient.getClasses(), ApiClient.getSubjects(), ApiClient.getPrimarySubjectTemplates()]);
      const activeClasses = (Array.isArray(classRows) ? classRows : []).filter(row => !row.isArchived);
      setClasses(activeClasses);
      setSubjects(Array.isArray(subjectRows) ? subjectRows : []);
      setTemplates(templateRows);
      setClassId(current => activeClasses.some(row => row.id === current) ? current : activeClasses[0]?.id || '');
    } catch (cause) {
      setError(errorMessage(cause, 'Fasallada iyo maaddooyinka lama soo qaadi karin.'));
    } finally {
      setLoading(false);
    }
  }, [school?.id]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) { setDetail(null); setIncluded([]); setPeriods({}); return; }
    const value = await ApiClient.getClassCurriculum(id) as CurriculumDetail;
    setDetail(value);
    const rows = (value.curriculum || []).filter(row => row.isActive);
    setIncluded(rows.map(row => row.subjectId));
    setPeriods(Object.fromEntries(rows.map(row => [row.subjectId, row.periodsPerWeek])));
  }, []);

  useEffect(() => { void loadBase(); }, [loadBase]);
  useEffect(() => {
    let active = true;
    if (classId) {
      setError('');
      void ApiClient.getClassCurriculum(classId).then(result => {
        if (!active) return;
        const value = result as CurriculumDetail;
        setDetail(value);
        const rows = (value.curriculum || []).filter(row => row.isActive);
        setIncluded(rows.map(row => row.subjectId));
        setPeriods(Object.fromEntries(rows.map(row => [row.subjectId, row.periodsPerWeek])));
      }).catch(cause => { if (active) setError(errorMessage(cause, 'Manhajka fasalka lama soo qaadi karin.')); });
    } else {
      setDetail(null); setIncluded([]); setPeriods({});
    }
    return () => { active = false; };
  }, [classId, school?.id]);

  useEffect(() => { setTemplateDraft((templates[templateBand] || []).join('\n')); }, [templates, templateBand]);

  const capacity = detail?.capacity.weeklyCapacity ?? 0;
  const total = useMemo(() => included.reduce((sum, id) => sum + (periods[id] || 1), 0), [included, periods]);
  const overCapacity = total > capacity;
  const classLabel = (row: SchoolClass) => [row.name, row.section, row.academicYear].filter(Boolean).join(' · ');
  const filteredSubjects = useMemo(() => subjects.filter(subject => (subject.name + ' ' + (subject.code || '')).toLowerCase().includes(subjectSearch.trim().toLowerCase())), [subjects, subjectSearch]);

  const toggleSubject = (subjectId: string, checked: boolean) => {
    setIncluded(current => checked ? [...current, subjectId] : current.filter(id => id !== subjectId));
    if (checked) setPeriods(current => ({ ...current, [subjectId]: current[subjectId] || 1 }));
  };

  const saveTemplate = async () => {
    const names = templateDraft.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
    if (!names.length || names.length > 30 || new Set(names.map(name => name.toLocaleLowerCase())).size !== names.length) { setError('Enter 1–30 unique subject names, one per line.'); return; }
    setTemplateSaving(true); setError(''); setNotice('');
    try {
      const result = await ApiClient.savePrimarySubjectTemplate(templateBand, names);
      setTemplates(result.templates);
      setNotice(`Template for Grades ${templateBand} saved for this school.`);
    } catch (cause) { setError(errorMessage(cause, 'Subject template could not be saved.')); }
    finally { setTemplateSaving(false); }
  };

  const applyTemplate = async () => {
    if (!classId || isReadOnly) return;
    setTemplateApplying(true); setError(''); setNotice('');
    try {
      const result = await ApiClient.applyPrimarySubjectTemplate(classId);
      await Promise.all([loadBase(), loadDetail(classId)]);
      setNotice(`Grades ${result.gradeBand} template applied. ${result.added} subjects added to the class curriculum.`);
    } catch (cause) { setError(errorMessage(cause, 'Subject template could not be applied.')); }
    finally { setTemplateApplying(false); }
  };
  const save = async () => {
    if (!classId || overCapacity || isReadOnly) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await ApiClient.saveClassCurriculum(classId, included.map(subjectId => ({ subjectId, periodsPerWeek: periods[subjectId] || 1 })));
      await loadDetail(classId);
      setNotice('Manhajka fasalka si guul leh ayaa loo kaydiyey.');
    } catch (cause) {
      setError(errorMessage(cause, 'Manhajka lama kaydin karin. Hubi xiisadaha iyo xiriirrada jadwalka.'));
    } finally { setSaving(false); }
  };

  const copy = async () => {
    if (!classId || !targets.length || isReadOnly) return;
    setCopying(true); setError(''); setNotice('');
    try {
      await ApiClient.saveClassCurriculum(classId, included.map(subjectId => ({ subjectId, periodsPerWeek: periods[subjectId] || 1 })));
      const result = await ApiClient.copyClassCurriculum(classId, targets);
      await loadDetail(classId);
      setNotice(`Manhajka waxaa lagu koobiyeeyey ${result.copiedClasses} fasal.`);
      setTargets([]);
    } catch (cause) {
      setError(errorMessage(cause, 'Manhajka lama koobiyeeyn karin.'));
    } finally { setCopying(false); }
  };

  if (loading) return <div className="mx-auto w-full max-w-5xl space-y-4 p-5 md:p-8"><div className="h-8 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /><div className="h-48 animate-pulse rounded-2xl bg-white dark:bg-slate-900" /></div>;

  return <div className="mx-auto min-w-0 w-full max-w-5xl space-y-5 p-4 md:p-8">
    <PageHeader title="Manhajka Fasalka" subtitle="Dooro maaddooyinka fasal kasta iyo tirada xiisadaha toddobaadkii." />
    <Stepper activeStep={4} labels={['Sannad & Xiisado', 'Fasallo', 'Maaddooyin', 'Manhaj']} ariaLabel="Tallaabooyinka dejinta waxbarashada" />
    {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">{error}</div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3"><h2 className="text-sm font-bold text-slate-900 dark:text-white">Ethiopian primary subject templates</h2><p className="mt-1 text-xs text-slate-500">Edit the school-specific subject list for each grade band. New Grade 1–8 classes receive the matching template automatically.</p></div>
      <div className="grid gap-3 md:grid-cols-[180px_1fr]">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Grade band
          <select value={templateBand} onChange={event => setTemplateBand(event.target.value as '1-4' | '5-6' | '7-8')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="1-4">Grades 1–4</option><option value="5-6">Grades 5–6</option><option value="7-8">Grades 7–8</option></select>
        </label>
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Subjects (one per line)
          <textarea value={templateDraft} onChange={event => setTemplateDraft(event.target.value)} rows={4} maxLength={5000} disabled={isReadOnly} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="primary" disabled={isReadOnly || templateSaving} onClick={() => void saveTemplate()}>{templateSaving ? 'Saving…' : 'Save school template'}</Button><Button type="button" variant="secondary" disabled={isReadOnly || templateApplying || !classId} onClick={() => void applyTemplate()}>{templateApplying ? 'Applying…' : 'Apply to selected class'}</Button></div>
    </section>

    {!classes.length ? <Card><EmptyState><div className="space-y-3"><BookOpen className="mx-auto h-8 w-8 text-teal-700" /><p className="font-semibold text-slate-800 dark:text-white">Weli fasallo lama samayn.</p><p>Marka hore samee fasallada iyo qaybaha.</p><Button variant="primary" type="button" onClick={() => onNavigate('sch_classes')}>Tag Fasallada</Button></div></EmptyState></Card>
      : !subjects.length ? <Card><EmptyState><div className="space-y-3"><BookOpen className="mx-auto h-8 w-8 text-teal-700" /><p className="font-semibold text-slate-800 dark:text-white">Weli maaddooyin lama diiwaangelin.</p><p>Marka hore ku dar maaddooyinka dugsiga.</p><Button variant="primary" type="button" onClick={() => onNavigate('sch_subjects')}>Tag Maaddooyinka</Button></div></EmptyState></Card>
      : <>
        <Card className="space-y-4">
          <FormRow label="Dooro fasalka">
            <select value={classId} onChange={event => setClassId(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
              {classes.map(row => <option key={row.id} value={row.id}>{classLabel(row)}</option>)}
            </select>
          </FormRow>
          {detail && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
            <div><p className="text-xs text-slate-500 dark:text-slate-400">Awoodda toddobaadlaha ah</p><p className="text-sm font-semibold text-slate-800 dark:text-white">{detail.capacity.workingDays} maalmood × {detail.capacity.lessonPeriodsPerDay} xiisadood maalintii</p></div>
            <Pill>{detail.capacity.weeklyCapacity} xiisad toddobaadkii</Pill>
          </div>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-bold text-[#132A29] dark:text-white"><BookOpen className="h-5 w-5 text-teal-700" /> Maaddooyinka fasalkan</h2>
            <Pill>{included.length} maaddo</Pill>
          </div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Raadi maaddooyinka
            <input value={subjectSearch} onChange={event => setSubjectSearch(event.target.value)} placeholder="Magaca ama koodhka maaddada" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
          </label>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>{included.length} maaddo la doortay</span><span>·</span><span>{total} / {capacity} xiisadood toddobaadkii</span></div>
          <div className="space-y-2">
            {filteredSubjects.map(subject => {
              const checked = included.includes(subject.id);
              return <label key={subject.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <input type="checkbox" checked={checked} disabled={isReadOnly || saving} onChange={event => toggleSubject(subject.id, event.target.checked)} className="h-4 w-4 shrink-0 accent-teal-700" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800 dark:text-white">{subject.name}</span>{subject.code && <span className="text-xs text-slate-500">{subject.code}</span>}</span>
                <span className="w-28 shrink-0"><span className="sr-only">Xiisadaha toddobaadkii ee {subject.name}</span><input type="number" min={1} max={12} step={1} disabled={!checked || isReadOnly || saving} value={periods[subject.id] || 1} onChange={event => setPeriods(current => ({ ...current, [subject.id]: Math.min(12, Math.max(1, Number(event.target.value) || 1)) }))} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-center text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800" /></span>
              </label>;
            })}
            {!filteredSubjects.length && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">Maaddo ku habboon lama helin.</p>}
          </div>
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${overCapacity ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200' : 'border-teal-100 bg-teal-50 text-teal-900 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-100'}`}>
            <div className="flex items-center gap-2 text-sm font-bold">{overCapacity && <AlertTriangle className="h-4 w-4" />} Wadarta: {total} / {capacity} xiisad</div>
            {overCapacity && <span className="text-xs">Wadartu waxay dhaaftay awoodda fasalka.</span>}
          </div>
          {!isReadOnly && <div className="flex justify-end"><Button variant="primary" type="button" disabled={saving || overCapacity || !classId} onClick={() => void save()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Kaydi manhajka</Button></div>}
        </Card>

        {!isReadOnly && <Card className="space-y-4">
          <div className="flex items-center gap-2"><Copy className="h-5 w-5 text-teal-700" /><h2 className="font-bold text-[#132A29] dark:text-white">Koobi manhajka</h2></div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manhajka fasalka hadda la doortay ku koobi fasallo kale. Macallimiinta iyo dejimaha imtixaanka ee fasallada kale lama beddelayo.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {classes.filter(row => row.id !== classId).map(row => <label key={row.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"><input type="checkbox" checked={targets.includes(row.id)} disabled={copying} onChange={event => setTargets(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} className="h-4 w-4 accent-teal-700" /><span className="text-slate-800 dark:text-slate-200">{classLabel(row)}</span></label>)}
          </div>
          <div className="flex justify-end"><Button type="button" variant="secondary" disabled={copying || !targets.length || !included.length} onClick={() => void copy()}>{copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Koobi {targets.length ? `(${targets.length})` : 'manhajka'}</Button></div>
        </Card>}
      </>}
  </div>;
};
