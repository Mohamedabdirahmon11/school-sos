import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Circle, Loader2, SkipForward } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { SchoolSetupProgressUpdate, SchoolSetupState } from '../../types/index.ts';
import { TranslationDict } from '../../lib/translations.ts';

interface Props {
  onNavigate: (view: string) => void;
  onComplete: () => Promise<void>;
}

interface StepDefinition {
  id: number;
  titleKey: keyof TranslationDict;
  helpKey: keyof TranslationDict;
  target?: string;
  optional: boolean;
}

const STEP_DEFINITIONS: StepDefinition[] = [
  { id: 1, titleKey: 'setup_step_1_title', helpKey: 'setup_step_1_help', target: 'sch_setup_academics', optional: false },
  { id: 2, titleKey: 'setup_step_2_title', helpKey: 'setup_step_2_help', target: 'sch_settings', optional: false },
  { id: 3, titleKey: 'setup_step_3_title', helpKey: 'setup_step_3_help', target: 'sch_classes', optional: false },
  { id: 4, titleKey: 'setup_step_4_title', helpKey: 'setup_step_4_help', target: 'sch_classes', optional: false },
  { id: 5, titleKey: 'setup_step_5_title', helpKey: 'setup_step_5_help', target: 'sch_teachers', optional: false },
  { id: 6, titleKey: 'setup_step_6_title', helpKey: 'setup_step_6_help', target: 'sch_students', optional: false },
  { id: 7, titleKey: 'setup_step_7_title', helpKey: 'setup_step_7_help', target: 'sch_timetable', optional: true },
  { id: 8, titleKey: 'setup_step_8_title', helpKey: 'setup_step_8_help', target: 'sch_setup_academics', optional: false },
  { id: 9, titleKey: 'setup_step_9_title', helpKey: 'setup_step_9_help', target: 'sch_inventory', optional: true },
  { id: 10, titleKey: 'setup_step_10_title', helpKey: 'setup_step_10_help', optional: false }
];

export const SchoolSetupWizard: React.FC<Props> = ({ onNavigate, onComplete }) => {
  const { school, t } = useAuth();
  const [state, setState] = useState<SchoolSetupState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const steps = useMemo(() => STEP_DEFINITIONS.map(item => ({
    ...item,
    title: t(item.titleKey),
    help: t(item.helpKey)
  })), [t]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setState(await ApiClient.getSchoolSetupProgress());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('setup_needs_attention'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [school?.id]);

  const persist = async (update: SchoolSetupProgressUpdate): Promise<SchoolSetupState | null> => {
    if (!state) return null;
    setSaving(true);
    setError(null);
    try {
      const next = await ApiClient.updateSchoolSetupProgress(update);
      setState(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('setup_needs_attention'));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const openStep = async (id: number, target?: string) => {
    if (!state || !target) return;
    const skippedSteps = state.progress.skippedSteps.filter(step => step !== id);
    const completedSteps = state.progress.completedSteps.filter(step => step !== 10 && Boolean(state.checklist[step]?.ready) && step !== id);
    const saved = await persist({ currentStep: id, completedSteps, skippedSteps });
    if (saved) onNavigate(target);
  };

  const markComplete = async (id: number) => {
    if (!state) return;
    const validCompleted = state.progress.completedSteps.filter(step => step !== 10 && Boolean(state.checklist[step]?.ready));
    const completedSteps = [...new Set([...validCompleted.filter(step => step !== id), id])].sort((a, b) => a - b);
    const skippedSteps = state.progress.skippedSteps.filter(step => step !== id);
    await persist({ currentStep: Math.min(10, id + 1), completedSteps, skippedSteps });
  };

  const skipStep = async (id: number) => {
    if (!state) return;
    const completedSteps = state.progress.completedSteps.filter(step => step !== 10 && Boolean(state.checklist[step]?.ready) && step !== id);
    const skippedSteps = [...new Set([...state.progress.skippedSteps.filter(step => step !== id), id])].sort((a, b) => a - b);
    await persist({ currentStep: Math.min(10, id + 1), completedSteps, skippedSteps });
  };

  const finish = async () => {
    if (!state) return;
    const saved = await persist({
      currentStep: 10,
      completedSteps: state.progress.completedSteps.filter(step => step !== 10 && Boolean(state.checklist[step]?.ready)),
      skippedSteps: state.progress.skippedSteps,
      complete: true
    });
    if (saved?.progress.completedAt) await onComplete();
  };

  if (loading) {
    return <div className="mx-auto max-w-5xl p-6 text-sm text-slate-500">{t('setup_loading')}</div>;
  }
  if (!state) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error || t('setup_needs_attention')}</div>
        <button type="button" onClick={() => void load()} className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">{t('setup_retry')}</button>
      </div>
    );
  }

  const completedCount = state.progress.completedSteps.filter(id => id !== 10 && Boolean(state.checklist[id]?.ready)).length + state.progress.skippedSteps.length;
  const percent = Math.round((completedCount / 9) * 100);

  return (
    <section className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="rounded-2xl bg-[#0B2B2A] p-6 text-white shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-200">SchoolOS</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{t('setup_title')}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-teal-50">{t('setup_subtitle')}</p>
        <p className="mt-4 text-sm font-semibold">{school?.name || t('school_admin')}</p>
        <div className="mt-5 flex items-center justify-between text-xs text-teal-100">
          <span>{t('setup_progress')} · {t('setup_current_step')} {state.progress.currentStep}/10</span>
          <span>{completedCount}/9</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-teal-300 transition-all" style={{ width: percent + '%' }} />
        </div>
        <p className="mt-3 text-xs text-teal-100">{t('setup_saved')}</p>
      </header>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      <div className="grid gap-3">
        {steps.map(item => {
          const isFinal = item.id === 10;
          const isCompleted = state.progress.completedSteps.includes(item.id) && (isFinal ? Boolean(state.progress.completedAt) : Boolean(state.checklist[item.id]?.ready));
          const isSkipped = state.progress.skippedSteps.includes(item.id);
          const ready = isFinal ? state.canFinish : Boolean(state.checklist[item.id]?.ready);
          const status = isCompleted ? t('setup_completed') : isSkipped ? t('setup_skipped') : ready ? t('setup_pending') : t('setup_needs_attention');
          return (
            <article key={item.id} aria-current={item.id === state.progress.currentStep ? 'step' : undefined} className={'rounded-xl border p-4 shadow-sm sm:p-5 ' + (item.id === state.progress.currentStep ? 'border-teal-300 bg-teal-50/40' : 'border-slate-200 bg-white')}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 gap-3">
                  <div className="mt-0.5 shrink-0 text-teal-700">
                    {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : isSkipped ? <SkipForward className="h-5 w-5" /> : <Circle className="h-5 w-5 text-slate-300" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-[#132A29]">{item.id}. {item.title}</h2>
                      <span className={'rounded-full px-2 py-0.5 text-[10px] font-semibold ' + (item.optional ? 'bg-slate-100 text-slate-600' : 'bg-teal-50 text-teal-700')}>
                        {item.optional ? t('setup_optional') : t('setup_required')}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500">{status}</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.help}</p>
                    {!ready && !isFinal && (
                      <p className="mt-2 text-xs text-amber-700">{state.checklist[item.id]?.reason || t('setup_needs_attention')}</p>
                    )}
                    {isFinal && <p className="mt-2 text-xs text-slate-500">{t('setup_finish_help')}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                  {item.target && (
                    <button type="button" disabled={saving} onClick={() => void openStep(item.id, item.target)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      {t('setup_open_step')} <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!isFinal && !isCompleted && !isSkipped && (
                    <button type="button" disabled={saving || !ready} onClick={() => void markComplete(item.id)} className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40">
                      {t('setup_mark_complete')}
                    </button>
                  )}
                  {item.optional && !isSkipped && !isCompleted && (
                    <button type="button" disabled={saving} onClick={() => void skipStep(item.id)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                      {t('setup_skip_for_now')}
                    </button>
                  )}
                  {isFinal && (
                    <button type="button" disabled={saving || !state.canFinish} onClick={() => void finish()} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40">
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      {t('setup_finish')}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
