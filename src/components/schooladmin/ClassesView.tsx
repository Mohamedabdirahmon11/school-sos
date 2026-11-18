import React, { useCallback, useEffect, useState } from 'react';
import './classes-step2.css';
import { Plus, Pencil, X, Check, RefreshCw, Sparkles, Layers } from 'lucide-react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { academicText } from '../../lib/academic-translations.ts';
import { PageHeader, Stepper, Card, Button, Chip, Pill, Table, EmptyState, FormRow } from '../SchoolDesignSystem.tsx';

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
    catch { setNotice({kind:'error',text:tx('loadError')}); }
    finally { setLoading(false); }
  },[language]);
  useEffect(()=>{ void load(); },[load]);

  const run = async (action:()=>Promise<any>, success:string) => {
    setBusy(true); setNotice(null);
    try { await action(); setNotice({kind:'ok',text:success}); await load(); }
    catch { setNotice({kind:'error',text:tx('actionError')}); }
    finally { setBusy(false); }
  };

  const create = async (e:React.FormEvent) => {
    e.preventDefault();
    const parsed = sections.split(',').map(x=>x.trim()).filter(Boolean);
    await run(async()=>{ await ApiClient.createClassGroup(name.trim(),parsed); setName(''); setSections(''); },tx('savedClass'));
  };
  const defaults = async () => {
    await run(async()=>{const r=await ApiClient.createDefaultClassGroups();setNotice({kind:'ok',text:tx('defaultsResult',{created:r.created,skipped:r.skipped})});},tx('defaultsChecked'));
  };
  const rename = async (id:string) => {
    await run(async()=>{await ApiClient.renameClassGroup(id,editName.trim());setEditing(null);},tx('renamed'));
  };
  const removeClass = (row:ClassGroup) => {
    if(window.confirm(tx('confirmDelete')+' '+row.name)) {
      void run(()=>ApiClient.deleteClassGroup(row.id),tx('deleted'));
    }
  };

  return <div className="school-design-system classes-step2">
    <div className="classes-content">
      <PageHeader title={tx('classes')} subtitle={tx('subtitle')} />
      <Stepper activeStep={2} />
      {notice && <div role="status" aria-live="polite" className={'ds-notice '+(notice.kind==='ok'?'is-success':'is-error')}>{notice.text}</div>}

      {!isReadOnly && <div className="classes-create-grid">
        <Card>
          <div className="ds-card-heading"><div><span className="ds-eyebrow">{tx('academics')}</span><h2>{tx('addClass')}</h2></div><span className="ds-icon-tile"><Layers size={19}/></span></div>
          <form onSubmit={create} className="ds-form">
            <FormRow label={tx('className')}><input value={name} onChange={e=>setName(e.target.value)} maxLength={120} required placeholder={tx('classExample')} /></FormRow>
            <FormRow label={tx('sections')} hint={tx('sectionHelp')}><input value={sections} onChange={e=>setSections(e.target.value)} placeholder={tx('sectionExample')} /></FormRow>
            <Button variant="primary" type="submit" disabled={busy}><Plus size={17}/> {tx('saveClass')}</Button>
          </form>
        </Card>
        <Card className="classes-default-card">
          <div><span className="ds-eyebrow">{tx('defaults')}</span><h2><Sparkles size={19}/> {tx('defaults')}</h2><p>{tx('defaultsHelp')}</p></div>
          <Button variant="secondary" disabled={busy} onClick={()=>void defaults()}>{tx('addDefaults')}</Button>
        </Card>
      </div>}

      <div className="classes-list-heading"><div><h2>{tx('classList')}</h2><p>{tx('subtitle')}</p></div><Pill>{rows.length} {tx('classCount')}</Pill></div>
      {loading ? <Card><EmptyState>{tx('loading')}</EmptyState></Card> : rows.length===0 ? <Card><EmptyState>{tx('empty')}</EmptyState></Card> :
        <Card className="classes-list-card">
          <Table>
            {rows.map((row,index)=><div className="ds-list-row" key={row.id}>
              <div className="ds-row-main">
                <div className="ds-row-title">
                  {editing===row.id ? <div className="ds-rename"><input aria-label={tx('className')} value={editName} onChange={e=>setEditName(e.target.value)} maxLength={120}/><Button variant="primary" aria-label={tx('save')} disabled={busy||!editName.trim()} onClick={()=>void rename(row.id)}><Check size={17}/></Button><Button variant="secondary" aria-label={tx('cancel')} onClick={()=>setEditing(null)}><X size={17}/></Button></div> :
                    <><span className="ds-eyebrow">{tx('classLabel')} {index+1}</span><h3>{row.name}</h3></>}
                </div>
                <div className="ds-section-pills">{row.class_sections?.length ? row.class_sections.map(sec=><Chip key={sec.id} onRemove={!isReadOnly?()=>void run(()=>ApiClient.deleteClassSection(sec.id),tx('sectionDeleted')):undefined}>{sec.name}</Chip>) : <span className="ds-muted">{tx('noSections')}</span>}</div>
              </div>
              {!isReadOnly && editing!==row.id && <div className="ds-row-actions"><Button variant="secondary" aria-label={tx('rename')+' '+row.name} onClick={()=>{setEditing(row.id);setEditName(row.name);}}><Pencil size={17}/></Button><Button variant="danger" aria-label={tx('delete')+' '+row.name} onClick={()=>removeClass(row)}><X size={17}/></Button></div>}
              {!isReadOnly && <form className="ds-inline-add" onSubmit={e=>{e.preventDefault();const value=sectionDraft[row.id]?.trim();if(value)void run(async()=>{await ApiClient.addClassSection(row.id,value);setSectionDraft(v=>({...v,[row.id]:''}));},tx('sectionAdded'));}}>
                <input value={sectionDraft[row.id]||''} onChange={e=>setSectionDraft(v=>({...v,[row.id]:e.target.value}))} placeholder={tx('newSection')} maxLength={80} aria-label={tx('newSection')+' '+row.name}/>
                <Button variant="secondary" type="submit" disabled={busy||!sectionDraft[row.id]?.trim()}><Plus size={17}/> {tx('addSection')}</Button>
              </form>}
            </div>)}
          </Table>
        </Card>
      }
      <div className="ds-bottom-nav"><Button variant="secondary" onClick={()=>window.history.back()}>{language==='so'?'Hore':language==='am'?'ቀዳሚ':language==='ar'?'السابق':'Back'}</Button><Button variant="primary" disabled>{language==='so'?'Xiga':language==='am'?'ቀጣይ':language==='ar'?'التالي':'Next'}</Button></div>
      <p className="ds-footer-note"><RefreshCw size={14}/> {language==='so'?'Isbeddellada si toos ah ayaa loo kaydiyaa, waana sii jiri doonaan marka bogga dib loo furo.':language==='am'?'ለውጦች በራስ-ሰር ይቀመጣሉ።':'Changes are saved automatically and remain after you reopen the page.'}</p>
    </div>
  </div>;
};
