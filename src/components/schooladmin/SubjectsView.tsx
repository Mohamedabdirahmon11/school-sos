import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, Loader2, Pencil, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { subjectText } from '../../lib/academic-translations.ts';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { Subject } from '../../types/index.ts';

export const SubjectsView: React.FC = () => {
  const { school, isReadOnly, language } = useAuth();
  const tx = (key: string, values: Record<string, string | number> = {}) => Object.entries(values).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)), subjectText(language, key));
  const load = useApi(() => ApiClient.getSubjects(), [school?.id], Boolean(school));
  const subjects: Subject[] = Array.isArray(load.data) ? load.data : [];
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState<Subject | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const visible = useMemo(() => subjects.filter(subject =>
    [subject.name, subject.code || ''].some(value => String(value).toLowerCase().includes(search.trim().toLowerCase()))
  ).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), [subjects, search]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const resetForm = () => { setName(''); setCode(''); setEditing(null); setError(''); };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanName) { setError(tx('enterName')); return; }
    if (cleanCode.length > 6) { setError(tx('codeLength')); return; }
    setBusy(true);
    try {
      if (editing) await ApiClient.updateSubject(editing.id, { name: cleanName, code: cleanCode });
      else await ApiClient.addSubject({ name: cleanName, code: cleanCode });
      await load.retry();
      setNotice(editing ? tx('updated') : tx('saved'));
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tx('saveError'));
    } finally { setBusy(false); }
  };

  const addDefaults = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await ApiClient.addDefaultSubjects();
      await load.retry();
      setNotice(result.createdCount
        ? tx('defaultAdded',{created:result.createdCount,skipped:result.skippedCount})
        : tx('defaultsExist'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tx('defaultsError'));
    } finally { setBusy(false); }
  };

  const remove = async (subject: Subject) => {
    if (!window.confirm(`${tx('confirmDelete',{name:subject.name})}`)) return;
    setError('');
    setBusy(true);
    try {
      await ApiClient.deleteSubject(subject.id);
      await load.retry();
      if (editing?.id === subject.id) resetForm();
      setNotice(tx('deleted'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tx('deleteError'));
    } finally { setBusy(false); }
  };

  if (load.loading) return <div className="mx-auto w-full max-w-5xl space-y-4 p-5 md:p-8"><div className="h-8 w-1/3 animate-pulse rounded bg-slate-200" /><div className="h-48 animate-pulse rounded-2xl bg-white" /></div>;
  if (load.error) return <div className="p-5 md:p-8"><ErrorState error={load.error} onRetry={load.retry} /></div>;

  return (
    <div className="mx-auto min-w-0 w-full max-w-5xl space-y-6 p-5 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#102522] dark:text-white">{tx('title')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tx('subtitle')}</p>
        </div>
        <span className="rounded-full bg-[#E7F4F0] px-3 py-1.5 text-xs font-semibold text-[#0F766E]">{subjects.length} {tx('count')}</span>
      </header>

      {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <section className="space-y-4 rounded-2xl border border-[#DCE7E4] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-700">
          <h2 className="flex items-center gap-2 text-base font-bold text-[#132A29] dark:text-white"><BookOpen className="h-5 w-5 text-[#0F766E]" />{editing ? tx('editTitle') : tx('addTitle')}</h2>
          <button type="button" disabled={busy || isReadOnly} onClick={() => void addDefaults()} className="inline-flex items-center gap-2 rounded-xl border border-[#B7D8D0] px-3 py-2 text-xs font-semibold text-[#0F766E] hover:bg-[#F3F8F6] disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Maaddooyin caadi ah
          </button>
        </div>
        <form onSubmit={save} className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{tx('name')} *
            <input value={name} onChange={event => setName(event.target.value)} maxLength={150} required disabled={busy || isReadOnly} placeholder={tx('namePlaceholder')} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-[#0F766E] dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
          </label>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{tx('code')}
            <input value={code} onChange={event => setCode(event.target.value.toUpperCase().slice(0, 6))} maxLength={6} disabled={busy || isReadOnly} placeholder={tx('codePlaceholder')} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal uppercase text-slate-900 outline-none focus:border-[#0F766E] dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy || isReadOnly || !name.trim()} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0D655E] disabled:opacity-50"><Plus className="h-4 w-4" />{editing ? tx('save') : tx('add')}</button>
            {editing && <button type="button" onClick={resetForm} className="rounded-xl border border-slate-300 px-3 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300" aria-label={tx('cancel')}><X className="h-4 w-4" /></button>}
          </div>
        </form>
      </section>

      <section className="space-y-4 rounded-2xl border border-[#DCE7E4] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[#132A29] dark:text-white">{tx('list')}</h2>
          <label className="relative block w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={tx('search')} aria-label={tx('search')} className="w-full rounded-xl border border-slate-300 bg-[#F8FBFA] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#0F766E] dark:border-slate-600 dark:bg-slate-800 dark:text-white" /></label>
        </div>
        {visible.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700">{search ? tx('noResults') : tx('empty')}</div> : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visible.map(subject => <article key={subject.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
              <div className="min-w-0"><h3 className="truncate text-sm font-bold text-[#132A29] dark:text-white">{subject.name}</h3>{subject.code && <span className="mt-1 inline-flex rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">{subject.code}</span>}</div>
              <div className="flex shrink-0 gap-1">
                <button type="button" disabled={busy || isReadOnly} onClick={() => { setEditing(subject); setName(subject.name); setCode(subject.code || ''); setError(''); }} aria-label={`${tx('edit')} ${subject.name}`} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-[#0F766E] disabled:opacity-50 dark:border-slate-600"><Pencil className="h-4 w-4" /></button>
                <button type="button" disabled={busy || isReadOnly} onClick={() => void remove(subject)} aria-label={`${tx('delete')} ${subject.name}`} className="rounded-lg border border-red-100 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            </article>)}
          </div>
        )}
      </section>
    </div>
  );
};
