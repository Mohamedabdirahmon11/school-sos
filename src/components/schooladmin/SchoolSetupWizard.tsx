import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, Save } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { SchoolSetupData, SchoolSetupState } from '../../types/index.ts';
import { getEthiopianCalendarInfo } from '../../lib/ethiopian-calendar.ts';

interface Props { onNavigate: (view: string) => void; onComplete: () => Promise<void>; }

type TimetableSettings = { shiftCount: 1 | 2; firstPeriodStart: string; periodMinutes: number; breakAfterPeriod: number; breakMinutes: number; shift2FirstPeriodStart: string; shift2PeriodMinutes: number; shift2BreakAfterPeriod: number; shift2BreakMinutes: number };
const toMinutes = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
const toTime = (value: number) => `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const shiftFinish = (start: string, duration: number, breakAfter: number, breakMinutes: number, periods: number) => toMinutes(start) + duration * periods + (periods > breakAfter ? breakMinutes : 0);
const updateDurationForFinish = (start: string, finish: string, breakAfter: number, breakMinutes: number, periods: number) => Math.round((toMinutes(finish) - toMinutes(start) - (periods > breakAfter ? breakMinutes : 0)) / periods);

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DEFAULT_DATA: SchoolSetupData = {
  schoolInformation: { name: '', logoUrl: '', address: '', city: '', phone: '', email: '', whatsappPhone: '', schoolType: 'combined' },
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

const CHECKLIST_STEPS: Array<{ id: number; title: string; description: string; coreSteps?: number[]; optional?: boolean; views?: Array<{ label: string; view: string }> }> = [
  { id: 1, title: 'Academic Year & Semesters', description: 'Confirm the current academic year and semester dates.', coreSteps: [2, 3] },
  { id: 2, title: 'School Information & WhatsApp', description: 'Confirm the school profile and administration WhatsApp number.', coreSteps: [1] },
  { id: 3, title: 'Classes & Grades', description: 'Create the school classes and sections. KG 1 and KG 2 are supported.', views: [{ label: 'Open Classes', view: 'sch_classes' }] },
  { id: 4, title: 'Subjects', description: 'Add school subjects and edit Ethiopian primary templates for Grades 1–4, 5–6 and 7–8. New Grade 1–8 classes receive their matching template automatically.', views: [{ label: 'Open Subjects', view: 'sch_subjects' }, { label: 'Primary Templates & Curriculum', view: 'sch_curriculum' }] },
  { id: 5, title: 'Teachers & Teacher IDs', description: 'Create teachers with school-specific IDs and PIN/password login.', views: [{ label: 'Open Teachers', view: 'sch_teachers' }] },
  { id: 0, title: 'Teacher Assignment & Form Teachers', description: 'Assign a Form Teacher to every active class and a teacher to every active curriculum subject. Workload must not exceed 30 periods per week.', views: [{ label: 'Open Teacher Assignments', view: 'sch_teacher_assignments' }] },
  { id: 6, title: 'Students & Parents', description: 'Register students, bulk import records and PINs, and add parent contacts.', views: [{ label: 'Open Students', view: 'sch_students' }, { label: 'Open Parents', view: 'sch_parents' }] },
  { id: 7, title: 'Timetable', description: 'Review the school calendar and working hours, then create the timetable or skip timetable setup for now.', optional: true, coreSteps: [4, 5], views: [{ label: 'Open Timetable', view: 'sch_timetable' }] },
  { id: 8, title: 'Attendance & Exams', description: 'Review attendance rules and configure examinations.', views: [{ label: 'Open Attendance', view: 'sch_attendance' }, { label: 'Open Exams', view: 'sch_exams' }] },
  { id: 9, title: 'Fees & Extra Modules', description: 'Create fee structures or skip fees for the Accountant; configure optional modules as needed.', optional: true, views: [{ label: 'Open Fees', view: 'sch_fees' }, { label: 'Inventory', view: 'sch_inventory' }, { label: 'Library', view: 'sch_library' }, { label: 'Transport', view: 'sch_transport' }, { label: 'Discipline', view: 'sch_discipline' }, { label: 'Health', view: 'sch_health' }] }
];

const REFERENCE_STEP_BY_PROGRESS_ID: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 0: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9 };

export const SchoolSetupWizard: React.FC<Props> = ({ onNavigate, onComplete }) => {
  const { school, user } = useAuth();
  const [data, setData] = useState<SchoolSetupData>(DEFAULT_DATA);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number[]>([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const [timetable, setTimetable] = useState<TimetableSettings>({ shiftCount: 1, firstPeriodStart: '08:00', periodMinutes: 40, breakAfterPeriod: 3, breakMinutes: 20, shift2FirstPeriodStart: '13:00', shift2PeriodMinutes: 40, shift2BreakAfterPeriod: 3, shift2BreakMinutes: 20 });
  const [showChecklist, setShowChecklist] = useState(true);
  const [returnToChecklist, setReturnToChecklist] = useState(false);
  const [setupState, setSetupState] = useState<SchoolSetupState | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [referenceStep, setReferenceStep] = useState(0);

  const refreshSetupProgress = async () => {
    setChecklistLoading(true);
    try {
      const current = await ApiClient.getSchoolSetupProgress();
      if (current.progress.completedAt) {
        setSetupState(current);
        setReferenceStep(9);
        return;
      }
      const order = [1, 2, 3, 4, 5, 0, 6, 7, 8, 9];
      const skippedSteps = current.progress.skippedSteps.filter(id => !current.checklist[id]?.ready);
      const completedSteps = order.filter(id => current.checklist[id]?.ready && !skippedSteps.includes(id)).sort((a, b) => a - b);
      const currentStep = order.find(id => !completedSteps.includes(id) && !skippedSteps.includes(id)) ?? 10;
      const unchanged = current.progress.currentStep === currentStep
        && JSON.stringify(current.progress.completedSteps) === JSON.stringify(completedSteps)
        && JSON.stringify(current.progress.skippedSteps) === JSON.stringify(skippedSteps);
      const next = unchanged ? current : await ApiClient.updateSchoolSetupProgress({ currentStep, completedSteps, skippedSteps });
      setSetupState(next);
      setReferenceStep(REFERENCE_STEP_BY_PROGRESS_ID[next.progress.currentStep] ?? 9);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The school setup checklist could not be refreshed.');
    } finally {
      setChecklistLoading(false);
    }
  };

  const skipOptionalStep = async (stepId: number) => {
    if (!setupState || ![7, 9].includes(stepId)) return;
    setSaving(true);
    setError(null);
    try {
      const skippedSteps = [...new Set([...setupState.progress.skippedSteps, stepId])].sort((a, b) => a - b);
      const completedSteps = setupState.progress.completedSteps.filter(id => id !== stepId);
      const currentStep = [1, 2, 3, 4, 5, 0, 6, 7, 8, 9].find(id => !completedSteps.includes(id) && !skippedSteps.includes(id)) ?? 10;
      const next = await ApiClient.updateSchoolSetupProgress({ currentStep, completedSteps, skippedSteps });
      setSetupState(next);
      setReferenceStep(REFERENCE_STEP_BY_PROGRESS_ID[next.progress.currentStep] ?? 9);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This optional setup step could not be skipped.');
    } finally {
      setSaving(false);
    }
  };

  const finishSetup = async () => {
    if (!setupState?.canFinish) return;
    setSaving(true);
    setError(null);
    try {
      await ApiClient.updateSchoolSetupProgress({
        currentStep: 10,
        completedSteps: setupState.progress.completedSteps,
        skippedSteps: setupState.progress.skippedSteps,
        complete: true
      });
      await onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The final setup checks did not pass. Please review the checklist.');
      await refreshSetupProgress();
    } finally {
      setSaving(false);
    }
  };

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
        workingHours: { ...DEFAULT_DATA.workingHours, ...(incoming.workingHours || {}), periodsPerDay: Math.min(8, Math.max(1, Number(incoming.workingHours?.periodsPerDay || DEFAULT_DATA.workingHours.periodsPerDay))) },
        completedSteps: incoming.completedSteps || []
      });
      setSaved(incoming.completedSteps || []);
      const nextCoreStep = [1, 2, 3, 4, 5].find(id => !(incoming.completedSteps || []).includes(id)) || 5;
      setStep(nextCoreStep);
      void refreshSetupProgress();
    }).catch(err => setError(err instanceof Error ? err.message : 'Unable to load school setup.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [school?.id]);

  useEffect(() => {
    let active = true;
    ApiClient.getTimetableSettings().then(settings => {
      if (!active) return;
      setTimetable({
        shiftCount: settings.shiftCount === 2 ? 2 : 1,
        firstPeriodStart: settings.firstPeriodStart || '08:00',
        periodMinutes: Number(settings.periodMinutes) || 40,
        breakAfterPeriod: Number(settings.breakAfterPeriod) || 3,
        breakMinutes: Number(settings.breakMinutes ?? 20),
        shift2FirstPeriodStart: settings.shift2FirstPeriodStart || '13:00',
        shift2PeriodMinutes: Number(settings.shift2PeriodMinutes) || 40,
        shift2BreakAfterPeriod: Number(settings.shift2BreakAfterPeriod) || 3,
        shift2BreakMinutes: Number(settings.shift2BreakMinutes ?? 20)
      });
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Unable to load shift timetable settings.'); });
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
      if (step === 5) {
        const periods = Math.min(8, Math.max(1, Number(data.workingHours.periodsPerDay || 8)));
        const firstFinish = shiftFinish(timetable.firstPeriodStart, timetable.periodMinutes, timetable.breakAfterPeriod, timetable.breakMinutes, periods);
        const secondFinish = shiftFinish(timetable.shift2FirstPeriodStart, timetable.shift2PeriodMinutes, timetable.shift2BreakAfterPeriod, timetable.shift2BreakMinutes, periods);
        if (timetable.periodMinutes < 20 || timetable.periodMinutes > 120 || timetable.shift2PeriodMinutes < 20 || timetable.shift2PeriodMinutes > 120) throw new Error('Each shift period must be between 20 and 120 minutes.');
        if (firstFinish > toMinutes(data.workingHours.closingTime)) throw new Error('Shift 1 must finish at or before the school closing time. Adjust its finish time or school closing time.');
        if (timetable.shiftCount === 2 && (toMinutes(timetable.shift2FirstPeriodStart) < firstFinish || secondFinish > toMinutes(data.workingHours.closingTime))) throw new Error('Shift 2 must start after Shift 1 and finish no later than the school closing time.');
        await ApiClient.saveTimetableSettings(timetable);
      }
      const result = await ApiClient.saveSchoolSetupStep(step, section);
      setData(result.data); setSaved(result.data.completedSteps || []);
      if (result.completed) await onComplete();
      else if (result.coreSetupCompleted || returnToChecklist) {
        setShowChecklist(true);
        setReturnToChecklist(false);
        await refreshSetupProgress();
      } else if (advance && step < 5) setStep(step + 1);
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

  if (showChecklist) {
    const wizardSteps: Array<{ id: string; title: string; required: boolean; evidence: number; assignmentEvidence?: number; needs: string[]; view?: string }> = [
      { id: 'year', title: 'Sanad dugsiyeed & Semesters', required: true, evidence: 1, needs: [], view: 'sch_setup_academics' },
      { id: 'profile', title: 'Macluumaadka dugsiga & WhatsApp', required: true, evidence: 2, needs: ['year'], view: 'sch_settings' },
      { id: 'classes', title: 'Classes & Grades (KG 1 / KG 2)', required: true, evidence: 3, needs: ['year', 'profile'], view: 'sch_classes' },
      { id: 'subjects', title: 'Maaddooyinka & Curriculum', required: true, evidence: 4, needs: ['classes'], view: 'sch_subjects' },
      { id: 'teachers', title: 'Macallimiinta & Teacher Assignment', required: true, evidence: 5, assignmentEvidence: 0, needs: ['classes', 'subjects'], view: 'sch_teachers' },
      { id: 'students', title: 'Ardayda & Waalidiinta', required: true, evidence: 6, needs: ['teachers'], view: 'sch_students' },
      { id: 'timetable', title: 'Timetable', required: false, evidence: 7, needs: ['students'], view: 'sch_timetable' },
      { id: 'attendance', title: 'Attendance & Exams', required: true, evidence: 8, needs: ['students'] },
      { id: 'fees', title: 'Fees & Extra Modules', required: false, evidence: 9, needs: ['students'], view: 'sch_fees' },
      { id: 'finish', title: 'Hubinta ugu dambaysa & Dashboard', required: true, evidence: -1, needs: ['year', 'profile', 'classes', 'subjects', 'teachers', 'students', 'attendance'] }
    ];
    const readyFor = (id: string) => {
      const item = wizardSteps.find(candidate => candidate.id === id);
      if (!item || !setupState) return false;
      if (id === 'finish') return Boolean(setupState.canFinish);
      if (id === 'teachers') return Boolean(setupState.checklist[5]?.ready && setupState.checklist[0]?.ready);
      if (id === 'timetable') return Boolean(setupState.checklist[7]?.ready || setupState.progress.skippedSteps.includes(7));
      if (id === 'attendance') return Boolean(setupState.checklist[8]?.ready);
      if (id === 'fees') return Boolean(setupState.checklist[9]?.ready || setupState.progress.skippedSteps.includes(9));
      return Boolean(setupState.checklist[item.evidence]?.ready);
    };
    const unlockedFor = (id: string) => {
      const item = wizardSteps.find(candidate => candidate.id === id);
      return Boolean(item && item.needs.every(readyFor));
    };
    const current = wizardSteps[referenceStep] || wizardSteps[0];
    const currentEvidence = current.evidence >= 0 ? setupState?.checklist[current.evidence] : undefined;
    const assignmentEvidence = setupState?.checklist[current.assignmentEvidence ?? -1];
    const completedCount = wizardSteps.filter(item => readyFor(item.id)).length;
    const openTarget = (id: string) => {
      const item = wizardSteps.find(candidate => candidate.id === id);
      if (!item || !unlockedFor(id)) return;
      setError(null);
      if (item.view) onNavigate(item.view);
      else setReferenceStep(wizardSteps.findIndex(candidate => candidate.id === id));
    };
    return <div className="school-setup-reference">
      <style>{`
        .school-setup-reference{--sw-bg:#f6f4ee;--sw-card:#fff;--sw-ink:#1c2b26;--sw-muted:#5f6f68;--sw-line:#d9d6cb;--sw-side:#1f4d3f;--sw-sideink:#e8f1ec;--sw-ok:#1b7f4b;--sw-warn:#a65b00;--sw-bad:#b3261e;--sw-accent:#1f4d3f;--sw-soft:#eaf2ed;display:grid;grid-template-columns:290px minmax(0,1fr);min-height:calc(100vh - 2rem);background:var(--sw-bg);color:var(--sw-ink);margin:-1rem;border-radius:12px;overflow:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);font:16px/1.5 "Source Sans 3","Segoe UI",system-ui,sans-serif}
        .school-setup-reference *{box-sizing:border-box}.school-setup-reference h1,.school-setup-reference h2,.school-setup-reference h3{font-family:Georgia,"Iowan Old Style",serif}
        .sw-side{background:var(--sw-side);color:var(--sw-sideink);padding:20px 14px}.sw-side h1{font-size:20px;margin:0 8px 4px}.sw-side p{margin:0 8px 14px;font-size:13px;opacity:.8}
        .sw-step{display:flex;gap:10px;align-items:center;width:100%;text-align:left;background:none;border:0;color:inherit;padding:9px 8px;border-radius:8px;font:inherit;cursor:pointer}.sw-step:hover:not(:disabled){background:rgba(255,255,255,.08)}.sw-step:disabled{opacity:.45;cursor:not-allowed}.sw-step[aria-current=step]{background:rgba(255,255,255,.14);font-weight:600}
        .sw-dot{flex:none;width:24px;height:24px;border-radius:50%;border:2px solid currentColor;display:grid;place-items:center;font-size:12px}.sw-dot.ready{background:var(--sw-ok);border-color:var(--sw-ok);color:#fff}.sw-tag{margin-left:auto;font-size:11px;opacity:.85}
        .sw-main{padding:24px clamp(16px,4vw,48px);max-width:860px;width:100%}.sw-main h2{font-size:26px;margin:0 0 4px}.sw-sub{color:var(--sw-muted);margin:0 0 18px}.sw-start{background:var(--sw-soft);border:1px solid var(--sw-line);border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:14px}
        .sw-card{background:var(--sw-card);border:1px solid var(--sw-line);border-radius:12px;padding:18px;margin-bottom:14px}.sw-miss{border-left:4px solid var(--sw-warn);background:var(--sw-card);padding:10px 14px;border-radius:0 8px 8px 0;margin-bottom:14px;font-size:14px}.sw-miss strong{color:var(--sw-warn)}.sw-good{border-left-color:var(--sw-ok)}.sw-good strong{color:var(--sw-ok)}
        .sw-actions{display:flex;justify-content:space-between;gap:10px;margin-top:16px;flex-wrap:wrap}.sw-btn{background:var(--sw-accent);color:#fff;border:0;border-radius:8px;padding:10px 16px;font:inherit;font-weight:600;cursor:pointer}.sw-btn.secondary{background:transparent;color:var(--sw-ink);border:1px solid var(--sw-line)}.sw-btn:disabled{opacity:.45;cursor:not-allowed}
        .sw-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}.sw-stats div{background:var(--sw-soft);border-radius:10px;padding:10px}.sw-stats b{font-size:22px;display:block}
        .school-setup-reference button:focus-visible,.school-setup-reference input:focus-visible,.school-setup-reference select:focus-visible{outline:3px solid var(--sw-accent);outline-offset:1px}
        @media(prefers-color-scheme:dark){.school-setup-reference:not([data-theme=light]){--sw-bg:#121a17;--sw-card:#1a2420;--sw-ink:#e6efe9;--sw-muted:#9db0a7;--sw-line:#2d3b35;--sw-side:#0d2a21;--sw-sideink:#d5e6dd;--sw-ok:#4cc58a;--sw-warn:#e8a042;--sw-bad:#f2867f;--sw-accent:#4cc58a;--sw-soft:#1f2f28;color-scheme:dark}}
        html[data-theme=dark] .school-setup-reference{--sw-bg:#121a17;--sw-card:#1a2420;--sw-ink:#e6efe9;--sw-muted:#9db0a7;--sw-line:#2d3b35;--sw-side:#0d2a21;--sw-sideink:#d5e6dd;--sw-ok:#4cc58a;--sw-warn:#e8a042;--sw-bad:#f2867f;--sw-accent:#4cc58a;--sw-soft:#1f2f28;color-scheme:dark}
        html[data-theme=light] .school-setup-reference{--sw-bg:#f6f4ee;--sw-card:#fff;--sw-ink:#1c2b26;--sw-muted:#5f6f68;--sw-line:#d9d6cb;--sw-side:#1f4d3f;--sw-sideink:#e8f1ec;--sw-ok:#1b7f4b;--sw-warn:#a65b00;--sw-bad:#b3261e;--sw-accent:#1f4d3f;--sw-soft:#eaf2ed;color-scheme:light}
        @media(max-width:760px){.school-setup-reference{grid-template-columns:1fr}.sw-side{padding:12px}.sw-side p{display:none}.sw-steps{display:flex;overflow-x:auto;gap:4px;scrollbar-width:thin}.sw-step{width:auto;white-space:nowrap;flex:none}.sw-main{padding:20px 16px}}
      `}</style>
      <aside className="sw-side"><h1>Setup Wizard</h1><p>Dugsi cusub: dhammaystir tallaabooyinka si Dashboard-ku u furmo.</p>
        <nav className="sw-steps" aria-label="Tallaabooyinka">
          {wizardSteps.map((item, index) => {
            const isReady = readyFor(item.id), locked = !unlockedFor(item.id);
            return <button key={item.id} type="button" className="sw-step" aria-current={referenceStep === index ? 'step' : undefined} disabled={locked} onClick={() => setReferenceStep(index)}>
              <span className={'sw-dot' + (isReady ? ' ready' : '')}>{isReady ? '✓' : locked ? '🔒' : index + 1}</span>
              <span>{item.title}</span><span className="sw-tag">{item.followUp ? 'dabagal' : item.required ? 'khasab' : 'optional'}</span>
            </button>;
          })}
        </nav>
      </aside>
      <main className="sw-main">
        {!setupState?.progress.completedAt && (!setupState?.checklist[1]?.ready || !setupState?.checklist[2]?.ready) && <div className="sw-start"><strong>START HERE:</strong> Dugsigaagu wuxuu u baahan yahay dejin. Ka bilow macluumaadka dugsiga, kadib raac tallaabooyinka kala horreeya.</div>}
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2>{current.title}</h2><p className="sw-sub">{current.followUp ? 'Tallaabo dabagal ah · ma xannibayso Dashboard-ka' : current.required ? 'Tallaabo khasab ah' : 'Tallaabo optional ah'} · Tallaabada {referenceStep + 1} ee {wizardSteps.length}</p></div><div className="text-sm font-semibold">{completedCount}/{wizardSteps.length} diyaar</div></div>
        {error && <div role="alert" className="sw-miss"><strong>Cilad:</strong> {error}</div>}
        {current.id !== 'finish' && current.id !== 'timetable' && current.id !== 'fees' && currentEvidence && <div className={'sw-miss' + (currentEvidence.ready ? ' sw-good' : '')} role="status"><strong>{currentEvidence.ready ? 'Tallaabadani waa diyaar ✓' : 'Wax ka maqan:'}</strong>{!currentEvidence.ready && <p className="mt-1">{currentEvidence.reason}</p>}</div>}
        {current.id === 'profile' && <section className="sw-card"><p className="sw-sub">Diiwaangeli magaca rasmiga ah, cinwaanka, magaalada, telefoonka, email-ka iyo lambarka WhatsApp-ka maamulka oo leh country code.</p><button className="sw-btn" type="button" onClick={() => openTarget('profile')}>Fur School Profile & WhatsApp →</button></section>}
        {current.id === 'year' && <section className="sw-card"><p className="sw-sub">Deji sannad-dugsiyeedka iyo labada semester, taariikhahooda bilowga iyo dhammaadka. Xogtu waxay ku kaydsamaysaa School Settings → Academics.</p><button className="sw-btn" type="button" onClick={() => openTarget('year')}>Fur Academic Year & Semesters →</button></section>}
        {current.id === 'classes' && <section className="sw-card"><p className="sw-sub">Samee fasallada iyo sections-ka. KG 1 iyo KG 2 waa la taageeraa, sidoo kale Grade 1–12 iyo fasallo isku-dhafan.</p><button className="sw-btn" type="button" onClick={() => openTarget('classes')}>Fur Classes & Grades →</button></section>}
        {current.id === 'subjects' && <section className="sw-card"><p className="sw-sub">Ku dar maaddooyinka, kadibna ku xidh Class Curriculum. Fasal kasta oo firfircoon waa inuu leeyahay ugu yaraan hal maaddo.</p><div className="flex flex-wrap gap-2"><button className="sw-btn" type="button" onClick={() => openTarget('subjects')}>Fur Subjects →</button><button className="sw-btn secondary" type="button" onClick={() => onNavigate('sch_curriculum')}>Fur Class Curriculum →</button></div></section>}
        {current.id === 'teachers' && <section className="sw-card"><p className="sw-sub">Diiwaangeli macallimiinta adigoo siinaya Teacher ID u gaar ah dugsigan iyo PIN/password login. Kadib qoondee Form Teacher iyo macallimiinta maaddooyinka.</p><div className="space-y-1 text-sm"><p><strong>Teacher records:</strong> {setupState?.checklist[5]?.ready ? '✓ Diyaar' : 'Weli waa dhiman'}</p><p><strong>Teacher assignment:</strong> {assignmentEvidence?.ready ? '✓ Diyaar' : 'Weli waa dhiman'}</p>{!assignmentEvidence?.ready && assignmentEvidence?.reason && <p className="text-xs" style={{color:'var(--sw-muted)'}}>{assignmentEvidence.reason}</p>}</div><div className="flex flex-wrap gap-2"><button className="sw-btn" type="button" onClick={() => openTarget('teachers')}>Fur Teachers →</button><button className="sw-btn secondary" type="button" disabled={!setupState?.checklist[5]?.ready} onClick={() => onNavigate('sch_teacher_assignments')}>Fur Teacher Assignment →</button></div></section>}
        
        {current.id === 'students' && <section className="sw-card"><p className="sw-sub">Diiwaangeli ardayda iyo waalidiinta/mas'uuliyiinta. Students wuxuu taageeraa bulk import, PIN generation/reset iyo soo saarista PIN slips.</p><div className="flex flex-wrap gap-2"><button className="sw-btn" type="button" onClick={() => openTarget('students')}>Fur Students & Bulk Import →</button><button className="sw-btn secondary" type="button" onClick={() => onNavigate('sch_parents')}>Fur Parents →</button></div></section>}
        {current.id === 'timetable' && <section className="sw-card"><p className="sw-sub">Samee jadwalka fasallada ama ka bood hadda oo dib uga samee Timetable. Tallaabadani waa optional; ma xannibayso dejinta aasaasiga ah.</p><div className="flex flex-wrap gap-2"><button className="sw-btn" type="button" onClick={() => openTarget('timetable')}>Fur Timetable →</button><button className="sw-btn secondary" type="button" disabled={saving || !setupState} onClick={() => void skipOptionalStep(7)}>Ka bood hadda</button></div></section>}
        {current.id === 'attendance' && <section className="sw-card"><p className="sw-sub">Hubi attendance rules-ka dugsiga iyo exam configuration-ka. Tani waa tallaabo dabagal ah oo muuqata; hadda ma xannibayso Dashboard-ka haddii dejinta aasaasiga ahi diyaar tahay.</p><div className="flex flex-wrap gap-2"><button className="sw-btn" type="button" onClick={() => onNavigate('sch_attendance')}>Fur Attendance →</button><button className="sw-btn secondary" type="button" onClick={() => onNavigate('sch_exams')}>Fur Exams →</button></div></section>}
        {current.id === 'fees' && <section className="sw-card"><p className="sw-sub">Samee fee structures ama u daa Accountant-ka inuu dambe dejiyo. Inventory, Library, Transport, Discipline iyo Health waa modules dheeraad ah oo dugsigu dooran karo.</p><div className="flex flex-wrap gap-2"><button className="sw-btn" type="button" onClick={() => openTarget('fees')}>Fur Fees →</button><button className="sw-btn secondary" type="button" onClick={() => onNavigate('sch_inventory')}>Inventory</button><button className="sw-btn secondary" type="button" onClick={() => onNavigate('sch_library')}>Library</button><button className="sw-btn secondary" type="button" onClick={() => onNavigate('sch_transport')}>Transport</button><button className="sw-btn secondary" type="button" onClick={() => onNavigate('sch_discipline')}>Discipline</button><button className="sw-btn secondary" type="button" onClick={() => onNavigate('sch_health')}>Health</button><button className="sw-btn secondary" type="button" disabled={saving || !setupState} onClick={() => void skipOptionalStep(9)}>Ka bood Fees & Modules</button></div></section>}
        {current.id === 'finish' && <>
          {setupState?.progress.completedAt && !setupState?.checklist[0]?.ready && <div className="sw-miss" role="status"><strong>Digniin: Teacher Assignment ayaa u baahan dib-u-eegis.</strong><p className="mt-1">Dugsigan hore ayuu setup-kiisa u dhammeeyey, sidaas darteed Dashboard-ka dib looma xirin. Fadlan hubi qoondeynta macallimiinta marka ay kuu suurto gasho.</p><button className="sw-btn secondary mt-2" type="button" onClick={() => onNavigate('sch_teacher_assignments')}>Hubi Teacher Assignment</button></div>}
          <section className="sw-card">
            <h3 className="mb-3 text-lg font-semibold">Hubinta xogta aasaasiga ah</h3>
            <div className="sw-stats">
              <div><b>{setupState?.checklist[1]?.ready ? '✓' : '—'}</b>Academic Year</div>
              <div><b>{setupState?.checklist[2]?.ready ? '✓' : '—'}</b>School Profile</div>
              <div><b>{setupState?.checklist[3]?.ready ? '✓' : '—'}</b>Classes</div>
              <div><b>{setupState?.checklist[4]?.ready ? '✓' : '—'}</b>Subjects</div>
              <div><b>{setupState?.checklist[5]?.ready ? '✓' : '—'}</b>Teachers</div>
              <div><b>{setupState?.checklist[0]?.ready ? '✓' : '—'}</b>Teacher Assignment</div>
              <div><b>{setupState?.checklist[6]?.ready ? '✓' : '—'}</b>Students & Parents</div>
            </div>
          </section>
          <section className="sw-card">
            <h3 className="mb-2 text-base font-semibold">Timetable, Attendance, Exams & Fees</h3>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3">
              <div><strong>Timetable</strong><p className="text-xs" style={{color:'var(--sw-muted)'}}>{setupState?.checklist[7]?.ready ? 'Diyaar' : setupState?.progress.skippedSteps.includes(7) ? 'La booday' : 'Optional — wali lama dejin'}</p></div>
              <div className="flex flex-wrap gap-2"><button className="sw-btn secondary" type="button" onClick={() => onNavigate('sch_timetable')}>Fur</button>{!setupState?.checklist[7]?.ready && !setupState?.progress.skippedSteps.includes(7) && <button className="sw-btn secondary" type="button" disabled={saving} onClick={() => void skipOptionalStep(7)}>Ka bood</button>}</div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3">
              <div><strong>Attendance & Exams</strong><p className="text-xs" style={{color:'var(--sw-muted)'}}>{setupState?.checklist[8]?.ready ? 'Diyaar' : 'Dabagal ayaa dhiman; Dashboard ma xannibayo'}</p></div>
              <div className="flex flex-wrap gap-2"><button className="sw-btn secondary" type="button" onClick={() => onNavigate('sch_attendance')}>Attendance</button><button className="sw-btn secondary" type="button" onClick={() => onNavigate('sch_exams')}>Exams</button></div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div><strong>Fees & Extra Modules</strong><p className="text-xs" style={{color:'var(--sw-muted)'}}>{setupState?.checklist[9]?.ready ? 'Diyaar' : setupState?.progress.skippedSteps.includes(9) ? 'La booday' : 'Optional — wali lama dejin'}</p></div>
              <div className="flex flex-wrap gap-2"><button className="sw-btn secondary" type="button" onClick={() => onNavigate('sch_fees')}>Fur Fees</button>{!setupState?.checklist[9]?.ready && !setupState?.progress.skippedSteps.includes(9) && <button className="sw-btn secondary" type="button" disabled={saving} onClick={() => void skipOptionalStep(9)}>Ka bood</button>}</div>
            </div>
          </section>
          {!setupState?.canFinish && <div className="sw-miss"><strong>Wax ka maqan:</strong><p className="mt-1">Dashboard-ka lama furi karo ilaa dhammaan hubinnada aasaasiga ah gudbaan, Timetable iyo Fees-na la dhammeeyo ama laga boodo.</p></div>}
          <button type="button" className="sw-btn" disabled={!setupState?.canFinish || saving || checklistLoading} onClick={() => void finishSetup()}>{saving ? 'Waa la dhammaynayaa…' : 'Dhammee setup-ka oo fur Dashboard'}</button>
        </>}
        <div className="sw-actions"><button type="button" className="sw-btn secondary" disabled={referenceStep === 0} onClick={() => setReferenceStep(value => Math.max(0, value - 1))}>← Hore</button><button type="button" className="sw-btn" disabled={referenceStep === wizardSteps.length - 1 || (current.required && !readyFor(current.id))} onClick={() => setReferenceStep(value => Math.min(wizardSteps.length - 1, value + 1))}>Xiga →</button></div>
        <p className="text-xs mt-4" style={{color:'var(--sw-muted)'}}>Horumarka waxaa laga akhriyaa xogta dhabta ah ee SchoolOS. Waxba laguma kaydiyo browser localStorage.</p>
      </main>
    </div>;
  }

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
        <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">School code</span><input readOnly value={school?.code || ''} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-600" /></label>
        <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">School Administrator / Principal</span><input readOnly value={user?.fullName || ''} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-600" /></label>
        <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">School logo (PNG, JPEG or WebP · max 1.5 MB)</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={logoUploading} onChange={e => { const input = e.currentTarget; const file = input.files?.[0]; if (!file) return; if (file.size > 1_572_864 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Choose a PNG, JPEG or WebP logo smaller than 1.5 MB.'); input.value = ''; return; } setLogoUploading(true); setError(null); void ApiClient.uploadSchoolLogo(file).then(result => setData(current => ({ ...current, schoolInformation: { ...current.schoolInformation, logoUrl: result.logoUrl } }))).catch(err => setError(err instanceof Error ? err.message : 'The school logo could not be uploaded.')).finally(() => { setLogoUploading(false); input.value = ''; }); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:opacity-50" />{logoUploading && <span className="text-xs text-teal-700">Uploading logo securely to Supabase Storage…</span>}{!logoUploading && data.schoolInformation.logoUrl && <div className="flex items-center gap-3 text-xs text-teal-700"><img src={data.schoolInformation.logoUrl} alt="School logo preview" className="h-12 w-12 rounded-lg border border-slate-200 object-contain" />Logo uploaded and ready to save.</div>}</label>
        {field('School address', data.schoolInformation.address, v => patch('schoolInformation', { ...data.schoolInformation, address: v }))}
        {field('City / Town', data.schoolInformation.city, v => patch('schoolInformation', { ...data.schoolInformation, city: v }))}
        {field('Phone number', data.schoolInformation.phone, v => patch('schoolInformation', { ...data.schoolInformation, phone: v }), 'tel')}
        {field('Administration WhatsApp (+country code)', data.schoolInformation.whatsappPhone, v => patch('schoolInformation', { ...data.schoolInformation, whatsappPhone: v }), 'tel', '+2519…')}
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

      {step === 5 && <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {field('School opening time', data.workingHours.openingTime, v => patch('workingHours', { ...data.workingHours, openingTime: v }), 'time')}
          {field('School closing time', data.workingHours.closingTime, v => patch('workingHours', { ...data.workingHours, closingTime: v }), 'time')}
          {field('Break start time', data.workingHours.breakStartTime, v => patch('workingHours', { ...data.workingHours, breakStartTime: v }), 'time')}
          {field('Break end time', data.workingHours.breakEndTime, v => patch('workingHours', { ...data.workingHours, breakEndTime: v }), 'time')}
          <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">Periods per shift</span><input type="number" min="1" max="8" value={data.workingHours.periodsPerDay} onChange={e => patch('workingHours', { ...data.workingHours, periodsPerDay: Math.min(8, Math.max(1, Number(e.target.value) || 1)) })} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" /></label>
          <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">Number of shifts</span><select value={timetable.shiftCount} onChange={e => setTimetable(v => ({ ...v, shiftCount: Number(e.target.value) as 1 | 2 }))} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"><option value={1}>One shift</option><option value={2}>Two shifts</option></select></label>
        </div>
        <section className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 space-y-4">
          <div><h3 className="font-bold text-slate-900">Shift 1 · Morning</h3><p className="text-xs text-slate-600">Edit the arrival time, departure time, lesson duration and break. Departure time updates the lesson duration automatically.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('Shift 1 starts', timetable.firstPeriodStart, v => { setTimetable(x => ({ ...x, firstPeriodStart: v })); patch('workingHours', { ...data.workingHours, classStartTime: v }); }, 'time')}
            {field('Shift 1 finishes', toTime(shiftFinish(timetable.firstPeriodStart, timetable.periodMinutes, timetable.breakAfterPeriod, timetable.breakMinutes, data.workingHours.periodsPerDay)), v => { const duration = updateDurationForFinish(timetable.firstPeriodStart, v, timetable.breakAfterPeriod, timetable.breakMinutes, data.workingHours.periodsPerDay); if (duration >= 20 && duration <= 120) setTimetable(x => ({ ...x, periodMinutes: duration })); }, 'time')}
            <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">Lesson duration (minutes)</span><input type="number" min="20" max="120" value={timetable.periodMinutes} onChange={e => setTimetable(x => ({ ...x, periodMinutes: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" /></label>
            <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">Break after period</span><select value={timetable.breakAfterPeriod} onChange={e => setTimetable(x => ({ ...x, breakAfterPeriod: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm">{Array.from({ length: Math.max(1, data.workingHours.periodsPerDay - 1) }, (_, index) => index + 1).map(n => <option key={n} value={n}>{n}</option>)}</select></label>
            <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">Break duration (minutes)</span><input type="number" min="0" max="120" value={timetable.breakMinutes} onChange={e => setTimetable(x => ({ ...x, breakMinutes: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" /></label>
          </div>
          <p className="text-xs font-semibold text-teal-900">Calculated Shift 1 finish: {toTime(shiftFinish(timetable.firstPeriodStart, timetable.periodMinutes, timetable.breakAfterPeriod, timetable.breakMinutes, data.workingHours.periodsPerDay))}</p>
        </section>
        {timetable.shiftCount === 2 && <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-4">
          <div><h3 className="font-bold text-slate-900">Shift 2 · Afternoon</h3><p className="text-xs text-slate-600">Set independent start, finish, lesson duration and break times for the second shift.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('Shift 2 starts', timetable.shift2FirstPeriodStart, v => setTimetable(x => ({ ...x, shift2FirstPeriodStart: v })), 'time')}
            {field('Shift 2 finishes', toTime(shiftFinish(timetable.shift2FirstPeriodStart, timetable.shift2PeriodMinutes, timetable.shift2BreakAfterPeriod, timetable.shift2BreakMinutes, data.workingHours.periodsPerDay)), v => { const duration = updateDurationForFinish(timetable.shift2FirstPeriodStart, v, timetable.shift2BreakAfterPeriod, timetable.shift2BreakMinutes, data.workingHours.periodsPerDay); if (duration >= 20 && duration <= 120) setTimetable(x => ({ ...x, shift2PeriodMinutes: duration })); }, 'time')}
            <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">Lesson duration (minutes)</span><input type="number" min="20" max="120" value={timetable.shift2PeriodMinutes} onChange={e => setTimetable(x => ({ ...x, shift2PeriodMinutes: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" /></label>
            <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">Break after period</span><select value={timetable.shift2BreakAfterPeriod} onChange={e => setTimetable(x => ({ ...x, shift2BreakAfterPeriod: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm">{Array.from({ length: Math.max(1, data.workingHours.periodsPerDay - 1) }, (_, index) => index + 1).map(n => <option key={n} value={n}>{n}</option>)}</select></label>
            <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">Break duration (minutes)</span><input type="number" min="0" max="120" value={timetable.shift2BreakMinutes} onChange={e => setTimetable(x => ({ ...x, shift2BreakMinutes: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" /></label>
          </div>
          <p className="text-xs font-semibold text-indigo-900">Calculated Shift 2 finish: {toTime(shiftFinish(timetable.shift2FirstPeriodStart, timetable.shift2PeriodMinutes, timetable.shift2BreakAfterPeriod, timetable.shift2BreakMinutes, data.workingHours.periodsPerDay))}</p>
        </section>}
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">All shift settings are saved to this school and also appear under Settings → School Shifts. Shift 2 must start after Shift 1 and both shifts must finish by the school closing time.</p>
      </div>}

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
        <button type="button" disabled={step === 1 || saving} onClick={() => setStep(step - 1)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-40"><ArrowLeft size={16} /> Back</button>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={saving || logoUploading} onClick={() => void saveStep(false)} className="inline-flex items-center gap-2 rounded-xl border border-teal-200 px-4 py-3 text-sm font-semibold text-teal-800 disabled:opacity-50"><Save size={16} /> Save and exit later</button><button type="button" disabled={saving || logoUploading} onClick={() => void saveStep(true)} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-teal-800 disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : step === 5 ? <CheckCircle2 size={16} /> : <ArrowRight size={16} />}{step === 5 ? 'Complete setup' : 'Save and continue'}</button></div>
      </footer>
    </section>
  </main>;
};
