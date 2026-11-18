import React, { useCallback, useEffect, useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { academicText } from '../../lib/academic-translations.ts';
import { Plus, Pencil, Trash2, X, Check, Layers, RefreshCw, Sparkles } from 'lucide-react';

type Section = { id:string; name:string; legacy_class_id:string|null };
type ClassGroup = { id:string; name:string; sort_order:number; class_sections:Section[] };

export const ClassesView: React.FC = () => {
  const { isReadOnly, language } = useAuth();
  const tx = (key: string, values: Record<string, string | number> = {}) => Object.entries(values).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)), academicText(language, key));
  const [rows,setRows] = useState<ClassGroup[]>([]);
  const [loading,setLoading] = useState(true);
  const [name,setName] = useState('');
  const [sections,setSections] = useState('');
  const [sectionDraft,setSectionDraft] = useState<Record<string,string>>({});
  const [editing,setEditing] = useState<string|null>(null);
  const [editName,setEditName] = useState('');
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState<{kind:'ok'|'error';text:string}|null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await ApiClient.getClassGroups()); }
    catch(e:any) { setNotice({kind:'error',text:e?.message || tx('loadError')}); }
    finally { setLoading(false); }
  },[language]);
  useEffect(()=>{ void load(); },[load]);

  const run = async (action:()=>Promise<any>, success:string) => {
    setBusy(true); setNotice(null);
    try { await action(); setNotice({kind:'ok',text:success}); await load(); }
    catch(e:any) { setNotice({kind:'error',text:e?.message || tx('actionError')}); }
    finally { setBusy(false); }
  };

  const create = async (e:React.FormEvent) => {
    e.preventDefault();
    const parsed = sections.split(',').map(x=>x.trim()).filter(Boolean);
    await run(async()=>{ await ApiClient.createClassGroup(name,parsed); setName(''); setSections(''); },tx('savedClass'));
  };
  const defaults = async () => {
    await run(async()=>{const r=await ApiClient.createDefaultClassGroups();setNotice({kind:'ok',text:tx('defaultsResult',{created:r.created,skipped:r.skipped})});},tx('defaultsChecked'));
  };
  const rename = async (id:string) => {
    await run(async()=>{await ApiClient.renameClassGroup(id,editName);setEditing(null);},tx('renamed'));
  };

  return <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="flex items-center gap-2 text-sm font-semibold text-teal-700"><Layers size={17}/> {tx('academics')}</div><h1 className="mt-1 text-2xl font-bold text-slate-900">{tx('classes')}</h1><p className="mt-1 text-sm text-slate-500">{tx('subtitle')}</p></div>
      <button onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw size={15}/> {tx('refresh')}</button>
    </div>
    {notice && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${notice.kind==='ok'?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-rose-200 bg-rose-50 text-rose-800'}`}>{notice.text}</div>}
    {!isReadOnly && <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <form onSubmit={create} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">{tx('addClass')}</h2>
        <label className="block text-sm font-medium text-slate-700">{tx('className')}<input value={name} onChange={e=>setName(e.target.value)} maxLength={120} required placeholder={tx('classExample')} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"/></label>
        <label className="block text-sm font-medium text-slate-700">{tx('sections')}<input value={sections} onChange={e=>setSections(e.target.value)} placeholder={tx('sectionExample')} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"/><span className="mt-1 block text-xs text-slate-500">{tx('sectionHelp')}</span></label>
        <button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"><Plus size={16}/> {tx('saveClass')}</button>
      </form>
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-teal-100 bg-teal-50/70 p-5">
        <div><div className="flex items-center gap-2 font-bold text-slate-900"><Sparkles size={17} className="text-teal-700"/> {tx('defaults')}</div><p className="mt-2 text-sm leading-6 text-slate-600">{tx('defaultsHelp')}</p></div>
        <button disabled={busy} onClick={()=>void defaults()} className="rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-sm font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50">{tx('addDefaults')}</button>
      </div>
    </div>}
    <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">{tx('classList')}</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{rows.length} {tx('classCount')}</span></div>
    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">{tx('loading')}</div> : rows.length===0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{tx('empty')}</div> :
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((row,index)=><article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1">{editing===row.id ? <div className="flex gap-2"><input value={editName} onChange={e=>setEditName(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"/><button onClick={()=>void rename(row.id)} title={tx('save')} className="text-emerald-700"><Check size={18}/></button><button onClick={()=>setEditing(null)} title={tx('cancel')} className="text-slate-400"><X size={18}/></button></div> : <><div className="text-xs font-semibold text-teal-700">{tx('classLabel')} {index+1}</div><h3 className="mt-1 truncate text-lg font-bold text-slate-900">{row.name}</h3></>}</div>
          {!isReadOnly && editing!==row.id && <div className="flex gap-1"><button onClick={()=>{setEditing(row.id);setEditName(row.name);}} title={tx('rename')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil size={16}/></button><button onClick={()=>{if(window.confirm(tx('confirmDelete')))void run(()=>ApiClient.deleteClassGroup(row.id),tx('deleted'))}} title={tx('delete')} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={16}/></button></div>}
        </div>
        <div className="mt-4 flex min-h-9 flex-wrap gap-2">{row.class_sections?.length ? row.class_sections.map(sec=><span key={sec.id} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-semibold text-slate-700">{sec.name}{!isReadOnly && !sec.legacy_class_id && <button onClick={()=>void run(()=>ApiClient.deleteClassSection(sec.id),tx('sectionDeleted'))} title={tx('delete')} className="ml-1 text-slate-400 hover:text-rose-600"><X size={13}/></button>}</span>) : <span className="text-sm text-slate-400">{tx('noSections')}</span>}</div>
        {!isReadOnly && <form className="mt-4 flex gap-2 border-t border-slate-100 pt-3" onSubmit={e=>{e.preventDefault();const value=sectionDraft[row.id]?.trim();if(value)void run(async()=>{await ApiClient.addClassSection(row.id,value);setSectionDraft(v=>({...v,[row.id]:''}));},tx('sectionAdded'))}}><input value={sectionDraft[row.id]||''} onChange={e=>setSectionDraft(v=>({...v,[row.id]:e.target.value}))} placeholder={tx('newSection')} maxLength={80} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"/><button disabled={busy||!sectionDraft[row.id]?.trim()} className="rounded-lg bg-slate-900 px-3 text-white disabled:opacity-40" title={tx('addSection')}><Plus size={17}/></button></form>}
      </article>)}</div>}
  </div>;
};
