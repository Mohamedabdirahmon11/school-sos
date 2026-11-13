import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, Save } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { SchoolSetupData } from '../../types/index.ts';
import { getEthiopianCalendarInfo } from '../../lib/ethiopian-calendar.ts';

interface Props { onNavigate: (view: string) => void; onComplete: () => Promise<void>; }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DEFAULT_DATA: SchoolSetupData = {
  schoolInformation: { name: '', logoUrl: '', address: '', phone: '', email: '', schoolType: 'combined' },
  academicYear: { name: '', startDate: '', endDate: '', isCurrent: true },
  terms: [{ name: 'Term 1', startDate: '', endDate: '' }, { name: 'Term 2', startDate: '', endDate: '' }],
  calendar: { workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], weeklyHolidays: ['Saturday', 'Sunday'], nationalHolidays: [], schoolHolidays: [], calendarType: 'both' },
  workingHours: { openingTime: '07:30', classStartTime: '08:00', closingTime: '16:00', breakStartTime: '10:00', breakEndTime: '10:30', periodsPerDay: 8 },
  completedSteps: []
};

const STEPS = [
  { title: 'School Information', description: 'Confirm the official details and contact information for this school.' },
  { title: 'Academic Year', description: 'Set the academic year and its official start and end dates.' },
  { title: 'Terms / Semesters', description: 'Create one, two, or three terms for the academic year.' },
  { title: 'Academic Calendar', description: 'Choose working days, holidays, and the calendar display used by your school.' },
  { title: 'Working Hours', description: 'Set the daily schedule and the number of teaching periods.' }
];

export const SchoolSetupWizard: React.FC<Props> = ({ onComplete }) => {
  const { school } = useAuth();
  const [data, setData] = useState<SchoolSetupData>(DEFAULT_DATA);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number[]>([]);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    let active = true;
    ApiClient.getSchoolSetupData().then(result => {
      if (!active) return;
      const incoming = result.data || {};
      setData({
        ...DEFAULT_DATA, ...incoming,
        schoolInformation: { ...DEFAULT_DATA.schoolInformation, ...result.school, ...(incoming.schoolInformation || {}) },
        academicYear: { ...DEFAULT_DATA.academicYear, ...(incoming.academicYear || {}) },
        terms: incoming.terms?.length ? incoming.terms : DEFAULT_DATA.terms,
        calendar: { ...DEFAULT_DATA.calendar, ...(incoming.calendar || {}) },
        workingHours: { ...DEFAULT_DATA.workingHours, ...(incoming.workingHours || {}) },
        completedSteps: incoming.completedSteps || []
      });
      setSaved(incoming.completedSteps || []);
      setStep(Math.min(5, Math.max(1, result.progress?.currentStep || 1)));
    }).catch(err => setError(err instanceof Error ? err.message : 'Unable to load school setup.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [school?.id]);

  const patch = <K extends keyof SchoolSetupData>(key: K, value: SchoolSetupData[K]) => setData(current => ({ ...current, [key]: value }));
  const saveStep = async (advance: boolean) => {
    setSaving(true); setError(null);
    try {
      const section: Partial<SchoolSetupData> = step === 1 ? { schoolInformation: data.schoolInformation }
        : step === 2 ? { academicYear: data.academicYear }
        : step === 3 ? { terms: data.terms }
        : step === 4 ? { calendar: data.calendar }
        : { workingHours: data.workingHours };
      // Convert logos saved by the older Base64 flow into Storage on the next Step 1 save.
      if (step === 1 && typeof data.schoolInformation.logoUrl === 'string' && data.schoolInformation.logoUrl.startsWith('data:image/')) {
        const legacyBlob = await fetch(data.schoolInformation.logoUrl).then(response => response.blob());
        const legacyFile = new File([legacyBlob], 'school-logo', { type: legacyBlob.type });
        const uploaded = await ApiClient.uploadSchoolLogo(legacyFile);
        section.schoolInformation = { ...data.schoolInformation, logoUrl: uploaded.logoUrl };
        setData(current => ({ ...current, schoolInformation: { ...current.schoolInformation, logoUrl: uploaded.logoUrl } }));
      }
      const result = await ApiClient.saveSchoolSetupStep(step, section);
      setData(result.data); setSaved(result.data.completedSteps || []);
      if (result.completed) await onComplete();
      else if (advance && step < 5) setStep(step + 1);
    } catch (err) { setError(err instanceof Error ? err.message : 'This setup step could not be saved.'); }
    finally { setSaving(false); }
  };

  const field = (label: string, value: string, onChange: (value: string) => void, type = 'text', placeholder = '') => (
    <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">{label}</span><input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />{type === 'date' && value && <span className="block text-xs text-teal-700">Ethiopian date: {getEthiopianCalendarInfo(value).dateLabel} · Gregorian date: {value}</span>}</label>
  );
  const select = (label: string, value: string, options: Array<[string, string]>, onChange: (value: string) => void) => (
    <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">{label}</span><select value={value} onChange={e => onChange(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-teal-600">{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
  );

  if (loading) return <div className="mx-auto max-w-4xl p-8 text-sm text-slate-500">Loading school setup…</div>;

  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#092f2d] via-[#0d4843] to-[#117568] p-6 text-white shadow-lg sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-teal-200">SCHOOL OS · SCHOOL ADMIN</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">School Setup Wizard</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-teal-50">Complete these five essential steps. Each step is saved immediately, so you can leave and continue later.</p></div><div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-right"><div className="text-2xl font-bold">{saved.length}/5</div><div className="text-xs text-teal-100">Steps saved</div></div></div>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-teal-300 transition-all" style={{ width: (saved.length / 5 * 100) + '%' }} /></div>
      <div className="mt-5 grid grid-cols-5 gap-2">{STEPS.map((s, i) => <button key={s.title} type="button" onClick={() => { if (i + 1 <= step || saved.includes(i + 1)) setStep(i + 1); }} className={'rounded-xl px-2 py-2 text-left text-xs transition ' + (step === i + 1 ? 'bg-white text-teal-900' : saved.includes(i + 1) ? 'bg-teal-300/20 text-white' : 'bg-white/10 text-teal-100')}><span className="flex items-center gap-1.5 font-bold">{saved.includes(i + 1) ? <CheckCircle2 size={14} /> : <span>{i + 1}</span>}<span className="hidden sm:inline">STEP {i + 1}</span></span><span className="mt-1 hidden sm:block">{s.title}</span></button>)}</div>
    </header>

    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle size={18} className="mt-0.5 shrink-0" />{error}</div>}

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="mb-6"><p className="text-xs font-bold uppercase tracking-widest text-teal-700">STEP {step} OF 5</p><h2 className="mt-1 text-xl font-bold text-slate-900">{STEPS[step - 1].title}</h2><p className="mt-1 text-sm text-slate-500">{STEPS[step - 1].description}</p></div>

      {step === 1 && <div className="grid gap-4 sm:grid-cols-2">
        {field('School name', data.schoolInformation.name, v => patch('schoolInformation', { ...data.schoolInformation, name: v }))}
        <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">School logo (PNG, JPEG or WebP · max 1.5 MB)</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={logoUploading} onChange={e => { const input = e.currentTarget; const file = input.files?.[0]; if (!file) return; if (file.size > 1_572_864 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Choose a PNG, JPEG or WebP logo smaller than 1.5 MB.'); input.value = ''; return; } setLogoUploading(true); setError(null); void ApiClient.uploadSchoolLogo(file).then(result => setData(current => ({ ...current, schoolInformation: { ...current.schoolInformation, logoUrl: result.logoUrl } }))).catch(err => setError(err instanceof Error ? err.message : 'The school logo could not be uploaded.')).finally(() => { setLogoUploading(false); input.value = ''; }); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:opacity-50" />{logoUploading && <span className="text-xs text-teal-700">Uploading logo securely to Supabase Storage…</span>}{!logoUploading && data.schoolInformation.logoUrl && <div className="flex items-center gap-3 text-xs text-teal-700"><img src={data.schoolInformation.logoUrl} alt="School logo preview" className="h-12 w-12 rounded-lg border border-slate-200 object-contain" />Logo uploaded and ready to save.</div>}</label>
        {field('School address', data.schoolInformation.address, v => patch('schoolInformation', { ...data.schoolInformation, address: v }))}
        {field('Phone number', data.schoolInformation.phone, v => patch('schoolInformation', { ...data.schoolInformation, phone: v }), 'tel')}
        {field('Email address', data.schoolInformation.email, v => patch('schoolInformation', { ...data.schoolInformation, email: v }), 'email')}
        {select('School type', data.schoolInformation.schoolType, [['primary', 'Primary'], ['secondary', 'Secondary'], ['combined', 'Combined']], v => patch('schoolInformation', { ...data.schoolInformation, schoolType: v as any }))}
      </div>}

      {step === 2 && <div className="grid gap-4 sm:grid-cols-2">
        {field('Academic year (e.g. 2026/2027)', data.academicYear.name, v => patch('academicYear', { ...data.academicYear, name: v }), 'text', '2026/2027')}
        {field('Start date', data.academicYear.startDate, v => patch('academicYear', { ...data.academicYear, startDate: v }), 'date')}
        {field('End date', data.academicYear.endDate, v => patch('academicYear', { ...data.academicYear, endDate: v }), 'date')}
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm font-medium text-slate-700"><input type="checkbox" checked={data.academicYear.isCurrent} onChange={e => patch('academicYear', { ...data.academicYear, isCurrent: e.target.checked })} className="h-4 w-4 accent-teal-700" /> Set as the current academic year</label>
      </div>}

      {step === 3 && <div className="space-y-4">
        {data.terms.map((term, index) => <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          {field('Term name', term.name, v => patch('terms', data.terms.map((t, i) => i === index ? { ...t, name: v } : t)))}
          {field('Start date', term.startDate, v => patch('terms', data.terms.map((t, i) => i === index ? { ...t, startDate: v } : t)), 'date')}
          {field('End date', term.endDate, v => patch('terms', data.terms.map((t, i) => i === index ? { ...t, endDate: v } : t)), 'date')}
          <button type="button" disabled={data.terms.length <= 1} onClick={() => patch('terms', data.terms.filter((_, i) => i !== index))} className="rounded-lg border border-rose-200 px-3 py-3 text-sm font-semibold text-rose-700 disabled:opacity-30">Remove</button>
        </div>)}
        <button type="button" disabled={data.terms.length >= 3} onClick={() => patch('terms', [...data.terms, { name: 'Term ' + (data.terms.length + 1), startDate: '', endDate: '' }])} className="rounded-xl border border-dashed border-teal-400 px-4 py-3 text-sm font-semibold text-teal-800 disabled:opacity-40">+ Add term (maximum 3)</button>
      </div>}

      {step === 4 && <div className="space-y-6">
        <div><h3 className="mb-3 text-sm font-bold text-slate-800">Working days</h3><div className="flex flex-wrap gap-2">{DAYS.map(day => <label key={day} className={'cursor-pointer rounded-full border px-4 py-2 text-sm ' + (data.calendar.workingDays.includes(day) ? 'border-teal-700 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600')}><input className="sr-only" type="checkbox" checked={data.calendar.workingDays.includes(day)} onChange={e => { const workingDays = e.target.checked ? [...data.calendar.workingDays, day] : data.calendar.workingDays.filter(d => d !== day); patch('calendar', { ...data.calendar, workingDays, weeklyHolidays: DAYS.filter(d => !workingDays.includes(d)) }); }} />{day}</label>)}</div><p className="mt-2 text-xs text-slate-500">Every day must be assigned as a working day or weekly holiday. Weekly holidays update automatically when you change working days.</p></div>
        {select('Calendar display', data.calendar.calendarType, [['both', 'Ethiopian + Gregorian'], ['ethiopian', 'Ethiopian calendar'], ['gregorian', 'Gregorian calendar']], v => patch('calendar', { ...data.calendar, calendarType: v as any }))}
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><h3 className="text-sm font-bold text-slate-800">National holidays</h3>{data.calendar.nationalHolidays.map((h, i) => <div key={i} className="flex gap-2"><input aria-label="Holiday name" value={h.name} onChange={e => patch('calendar', { ...data.calendar, nationalHolidays: data.calendar.nationalHolidays.map((x, n) => n === i ? { ...x, name: e.target.value } : x) })} placeholder="Holiday name" className="min-w-0 flex-1 rounded-lg border border-slate-200 p-2 text-sm" /><div className="space-y-1"><input aria-label="Holiday date (Gregorian equivalent)" type="date" value={h.date} onChange={e => patch('calendar', { ...data.calendar, nationalHolidays: data.calendar.nationalHolidays.map((x, n) => n === i ? { ...x, date: e.target.value } : x) })} className="w-36 rounded-lg border border-slate-200 p-2 text-sm" />{h.date && <p className="text-[10px] text-slate-500">Ethiopian date: {getEthiopianCalendarInfo(h.date).dateLabel}</p>}<select aria-label="Holiday calendar" value={h.calendar} onChange={e => patch('calendar', { ...data.calendar, nationalHolidays: data.calendar.nationalHolidays.map((x, n) => n === i ? { ...x, calendar: e.target.value as 'ethiopian' | 'gregorian' } : x) })} className="w-36 rounded-lg border border-slate-200 p-2 text-xs"><option value="ethiopian">Ethiopian</option><option value="gregorian">Gregorian</option></select></div><button type="button" onClick={() => patch('calendar', { ...data.calendar, nationalHolidays: data.calendar.nationalHolidays.filter((_, n) => n !== i) })} className="px-2 text-rose-600">×</button></div>)}<button type="button" onClick={() => patch('calendar', { ...data.calendar, nationalHolidays: [...data.calendar.nationalHolidays, { name: '', date: '', calendar: 'ethiopian' }] })} className="text-sm font-semibold text-teal-700">+ Add national holiday</button></div>
        <div className="space-y-2"><h3 className="text-sm font-bold text-slate-800">School holidays</h3>{data.calendar.schoolHolidays.map((h, i) => <div key={i} className="space-y-2 rounded-xl border border-slate-200 p-3"><input aria-label="School holiday name" value={h.name} onChange={e => patch('calendar', { ...data.calendar, schoolHolidays: data.calendar.schoolHolidays.map((x, n) => n === i ? { ...x, name: e.target.value } : x) })} placeholder="Holiday name" className="w-full rounded-lg border border-slate-200 p-2 text-sm" /><div className="grid grid-cols-2 gap-2"><div className="min-w-0 space-y-1"><input aria-label="Holiday start date (Gregorian equivalent)" type="date" value={h.startDate} onChange={e => patch('calendar', { ...data.calendar, schoolHolidays: data.calendar.schoolHolidays.map((x, n) => n === i ? { ...x, startDate: e.target.value } : x) })} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />{h.startDate && <p className="text-[10px] text-slate-500">ET: {getEthiopianCalendarInfo(h.startDate).dateLabel}</p>}</div><div className="min-w-0 space-y-1"><input aria-label="Holiday end date (Gregorian equivalent)" type="date" value={h.endDate} onChange={e => patch('calendar', { ...data.calendar, schoolHolidays: data.calendar.schoolHolidays.map((x, n) => n === i ? { ...x, endDate: e.target.value } : x) })} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />{h.endDate && <p className="text-[10px] text-slate-500">ET: {getEthiopianCalendarInfo(h.endDate).dateLabel}</p>}</div></div><button type="button" onClick={() => patch('calendar', { ...data.calendar, schoolHolidays: data.calendar.schoolHolidays.filter((_, n) => n !== i) })} className="text-xs font-semibold text-rose-600">Remove holiday</button></div>)}<button type="button" onClick={() => patch('calendar', { ...data.calendar, schoolHolidays: [...data.calendar.schoolHolidays, { name: '', startDate: '', endDate: '' }] })} className="text-sm font-semibold text-teal-700">+ Add school holiday</button></div></div>
      </div>}

      {step === 5 && <div className="grid gap-4 sm:grid-cols-2">
        {field('School opening time', data.workingHours.openingTime, v => patch('workingHours', { ...data.workingHours, openingTime: v }), 'time')}
        {field('Class start time', data.workingHours.classStartTime, v => patch('workingHours', { ...data.workingHours, classStartTime: v }), 'time')}
        {field('School closing time', data.workingHours.closingTime, v => patch('workingHours', { ...data.workingHours, closingTime: v }), 'time')}
        {field('Break start time', data.workingHours.breakStartTime, v => patch('workingHours', { ...data.workingHours, breakStartTime: v }), 'time')}
        {field('Break end time', data.workingHours.breakEndTime, v => patch('workingHours', { ...data.workingHours, breakEndTime: v }), 'time')}
        <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">Periods per day</span><input type="number" min="1" max="16" value={data.workingHours.periodsPerDay} onChange={e => patch('workingHours', { ...data.workingHours, periodsPerDay: Number(e.target.value) })} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" /></label>
      </div>}

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
        <button type="button" disabled={step === 1 || saving} onClick={() => setStep(step - 1)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-40"><ArrowLeft size={16} /> Back</button>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={saving || logoUploading} onClick={() => void saveStep(false)} className="inline-flex items-center gap-2 rounded-xl border border-teal-200 px-4 py-3 text-sm font-semibold text-teal-800 disabled:opacity-50"><Save size={16} /> Save and exit later</button><button type="button" disabled={saving || logoUploading} onClick={() => void saveStep(true)} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-teal-800 disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : step === 5 ? <CheckCircle2 size={16} /> : <ArrowRight size={16} />}{step === 5 ? 'Complete setup' : 'Save and continue'}</button></div>
      </footer>
    </section>
  </main>;
};
