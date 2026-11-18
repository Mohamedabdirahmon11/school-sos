import React, { useCallback, useEffect, useState } from 'react';
import './classes-step2.css';
import { Plus, Pencil, X, Check, RefreshCw, Sparkles, Layers } from 'lucide-react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { PageHeader, Stepper, Card, Button, Chip, Pill, Table, EmptyState, FormRow } from '../SchoolDesignSystem.tsx';

type Section = { id:string; name:string; legacy_class_id:string|null };
type ClassGroup = { id:string; name:string; sort_order:number; class_sections:Section[] };

export const ClassesView: React.FC = () => {
  const { isReadOnly } = useAuth();
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
    catch(e:any) { setNotice({kind:'error',text:e?.message || 'Fasallada lama soo qaadi karin.'}); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{ void load(); },[load]);

  const run = async (action:()=>Promise<any>, success:string) => {
    setBusy(true); setNotice(null);
    try { await action(); setNotice({kind:'ok',text:success}); await load(); }
    catch(e:any) { setNotice({kind:'error',text:e?.message || 'Hawlgalka wuu fashilmay.'}); }
    finally { setBusy(false); }
  };

  const create = async (e:React.FormEvent) => {
    e.preventDefault();
    const parsed = sections.split(',').map(x=>x.trim()).filter(Boolean);
    await run(async()=>{ await ApiClient.createClassGroup(name.trim(),parsed); setName(''); setSections(''); },'Fasalka waa la kaydiyay.');
  };
  const defaults = async () => {
    await run(async()=>{const r=await ApiClient.createDefaultClassGroups();setNotice({kind:'ok',text:r.created+' fasal ayaa la sameeyay; '+r.skipped+' waa hore u jireen.'});},'Fasallada caadiga ah waa la hubiyay.');
  };
  const rename = async (id:string) => {
    await run(async()=>{await ApiClient.renameClassGroup(id,editName.trim());setEditing(null);},'Magaca fasalka waa la beddelay.');
  };
  const removeClass = (row:ClassGroup) => {
    if(window.confirm('Ma hubtaa inaad tirtirayso fasalka '+row.name+'? Haddii xog kale ku xiran tahay, nidaamku wuu diidi doonaa.')) {
      void run(()=>ApiClient.deleteClassGroup(row.id),'Fasalka waa la tirtiray.');
    }
  };

  return <div className="school-design-system classes-step2">
    <div className="classes-content">
      <PageHeader title="Fasallo" subtitle="Maamul fasallada dugsiga iyo qaybaha ay ka kooban yihiin." />
      <Stepper activeStep={2} />
      {notice && <div role="status" aria-live="polite" className={'ds-notice '+(notice.kind==='ok'?'is-success':'is-error')}>{notice.text}</div>}

      {!isReadOnly && <div className="classes-create-grid">
        <Card>
          <div className="ds-card-heading"><div><span className="ds-eyebrow">MAAMULKA FASALLADA</span><h2>Ku dar fasal cusub</h2></div><span className="ds-icon-tile"><Layers size={19}/></span></div>
          <form onSubmit={create} className="ds-form">
            <FormRow label="Magaca fasalka"><input value={name} onChange={e=>setName(e.target.value)} maxLength={120} required placeholder="Tusaale: Grade 9" /></FormRow>
            <FormRow label="Qaybaha (ikhtiyaari)" hint="Kala saar magacyada hakad (,). Fasalku wuu jiri karaa isaga oo aan qaybo lahayn."><input value={sections} onChange={e=>setSections(e.target.value)} placeholder="Tusaale: A, B, C" /></FormRow>
            <Button variant="primary" type="submit" disabled={busy}><Plus size={17}/> Kaydi fasalka</Button>
          </form>
        </Card>
        <Card className="classes-default-card">
          <div><span className="ds-eyebrow">HAL MAR KU DAR</span><h2><Sparkles size={19}/> Fasallada caadiga ah</h2><p>Ku dar KG 1 iyo Grade 1 ilaa Grade 8. Fasallada hore u jiray waa la dhaafayaa, mana la samaynayo nuqullo.</p></div>
          <Button variant="secondary" disabled={busy} onClick={()=>void defaults()}>KG 1 – Grade 8</Button>
        </Card>
      </div>}

      <div className="classes-list-heading"><div><h2>Liiska fasallada</h2><p>Magaca fasalka, qaybihiisa iyo maamulka.</p></div><Pill>{rows.length} fasal</Pill></div>
      {loading ? <Card><EmptyState>Fasallada waa la soo rarayaa…</EmptyState></Card> : rows.length===0 ? <Card><EmptyState>Weli fasallo lama samayn. Ku dar fasalka koowaad.</EmptyState></Card> :
        <Card className="classes-list-card">
          <Table>
            {rows.map((row,index)=><div className="ds-list-row" key={row.id}>
              <div className="ds-row-main">
                <div className="ds-row-title">
                  {editing===row.id ? <div className="ds-rename"><input aria-label="Magaca cusub ee fasalka" value={editName} onChange={e=>setEditName(e.target.value)} maxLength={120}/><Button variant="primary" aria-label="Kaydi magaca" disabled={busy||!editName.trim()} onClick={()=>void rename(row.id)}><Check size={17}/></Button><Button variant="secondary" aria-label="Jooji beddelka" onClick={()=>setEditing(null)}><X size={17}/></Button></div> :
                    <><span className="ds-eyebrow">FASALKA {index+1}</span><h3>{row.name}</h3></>}
                </div>
                <div className="ds-section-pills">{row.class_sections?.length ? row.class_sections.map(sec=><Chip key={sec.id} onRemove={!isReadOnly?()=>void run(()=>ApiClient.deleteClassSection(sec.id),'Qaybta waa la tirtiray.'):undefined}>{sec.name}</Chip>) : <span className="ds-muted">Qaybo weli ma jiraan</span>}</div>
              </div>
              {!isReadOnly && editing!==row.id && <div className="ds-row-actions"><Button variant="secondary" aria-label={'Beddel magaca '+row.name} onClick={()=>{setEditing(row.id);setEditName(row.name);}}><Pencil size={17}/></Button><Button variant="danger" aria-label={'Tirtir fasalka '+row.name} onClick={()=>removeClass(row)}><X size={17}/></Button></div>}
              {!isReadOnly && <form className="ds-inline-add" onSubmit={e=>{e.preventDefault();const value=sectionDraft[row.id]?.trim();if(value)void run(async()=>{await ApiClient.addClassSection(row.id,value);setSectionDraft(v=>({...v,[row.id]:''}));},'Qaybta waa lagu daray.');}}>
                <input value={sectionDraft[row.id]||''} onChange={e=>setSectionDraft(v=>({...v,[row.id]:e.target.value}))} placeholder="Qayb cusub (A, B…)" maxLength={80} aria-label={'Qayb cusub oo loogu darayo '+row.name}/>
                <Button variant="secondary" type="submit" disabled={busy||!sectionDraft[row.id]?.trim()}><Plus size={17}/> Ku dar qayb</Button>
              </form>}
            </div>)}
          </Table>
        </Card>
      }
      <div className="ds-bottom-nav"><Button variant="secondary" onClick={()=>window.history.back()}>Hore</Button><Button variant="primary" disabled title="Tallaabada xigta kuma jirto hawsha Fasallo iyo Qaybo">Xiga</Button></div>
      <p className="ds-footer-note"><RefreshCw size={14}/> Isbeddellada si toos ah ayaa loo kaydiyaa, waana sii jiri doonaan marka bogga dib loo furo.</p>
    </div>
  </div>;
};
