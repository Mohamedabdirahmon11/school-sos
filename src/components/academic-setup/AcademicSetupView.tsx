import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Pencil, Plus, Save, X } from 'lucide-react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { Button, Card, Chip, Table, EmptyState, FormRow, PageHeader, Pill, Stepper } from './AcademicSetupDesign.tsx';

type AcademicYear = { id:string; name:string; startDate:string; endDate:string; isCurrent:boolean };
type Term = { id:string; academicYearId:string; name:string; startDate:string; endDate:string; isCurrent:boolean };
type SchoolDay = { id:string; dayOfWeek:string; isWorking:boolean };
type Period = { id:string; number:number; type:'lesson'|'break'; startTime:string; endTime:string };
type PeriodForm = { number:number; type:'lesson'|'break'; startTime:string; endTime:string };
type SetupData = { academicYears:AcademicYear[]; terms:Term[]; schoolDays:SchoolDay[]; periods:Period[] };

const DAYS = [
  ['Monday','Isniin'],['Tuesday','Talaado'],['Wednesday','Arbaco'],['Thursday','Khamiis'],
  ['Friday','Jimce'],['Saturday','Sabti'],['Sunday','Axad']
] as const;
const DEFAULT_DAYS: SchoolDay[] = DAYS.map(([dayOfWeek]) => ({ id:dayOfWeek, dayOfWeek, isWorking:dayOfWeek !== 'Friday' }));
const EMPTY: SetupData = { academicYears:[], terms:[], schoolDays:DEFAULT_DAYS, periods:[] };
const emptyYear = { name:'', startDate:'', endDate:'', isCurrent:true };
const emptyTerm = { name:'', startDate:'', endDate:'', isCurrent:false };
const emptyPeriod = { number:1, type:'lesson' as const, startTime:'08:00', endTime:'08:40' };
const nextPeriodForm = (periods:Period[]):PeriodForm => {
  const last=[...periods].sort((a,b)=>a.number-b.number).at(-1);
  const start=last?.endTime || '08:00';
  const [hours,minutes]=start.split(':').map(Number);
  const finish=(hours*60+minutes+40)%1440;
  const end=String(Math.floor(finish/60)).padStart(2,'0')+':'+String(finish%60).padStart(2,'0');
  return {number:(last?.number||0)+1,type:'lesson',startTime:start,endTime:end};
};

export const AcademicSetupView: React.FC<{ onNavigate:(view:string)=>void }> = ({ onNavigate }) => {
  const { school, isReadOnly } = useAuth();
  const [data,setData] = useState<SetupData>(EMPTY);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [success,setSuccess] = useState('');
  const [selectedYearId,setSelectedYearId] = useState('');
  const [yearForm,setYearForm] = useState(emptyYear);
  const [editingYearId,setEditingYearId] = useState('');
  const [termForm,setTermForm] = useState(emptyTerm);
  const [editingTermId,setEditingTermId] = useState('');
  const [periodForm,setPeriodForm] = useState<PeriodForm>(emptyPeriod);
  const [editingPeriodId,setEditingPeriodId] = useState('');

  const selectedYear = data.academicYears.find(year => year.id === selectedYearId) || data.academicYears.find(year => year.isCurrent) || data.academicYears[0];
  const yearTerms = useMemo(() => data.terms.filter(term => term.academicYearId === selectedYear?.id).sort((a,b)=>a.startDate.localeCompare(b.startDate)),[data.terms,selectedYear?.id]);
  const workingDays = data.schoolDays.filter(day=>day.isWorking).length;
  const lessonCount = data.periods.filter(period=>period.type==='lesson').length;
  const stepComplete = Boolean(data.academicYears.length && data.terms.length && data.schoolDays.length===7 && data.periods.length);

  const refresh = async () => {
    const result = await ApiClient.getAcademicSetup();
    setData({ ...EMPTY, ...result, schoolDays:result.schoolDays?.length ? result.schoolDays : DEFAULT_DAYS });
    setPeriodForm(nextPeriodForm(result.periods || []));
    const current = result.academicYears?.find((year:AcademicYear)=>year.id===selectedYearId) || result.academicYears?.find((year:AcademicYear)=>year.isCurrent) || result.academicYears?.[0];
    setSelectedYearId(current?.id || '');
  };

  useEffect(() => {
    let active=true;
    ApiClient.getAcademicSetup().then(result=>{
      if(!active)return;
      setData({ ...EMPTY, ...result, schoolDays:result.schoolDays?.length ? result.schoolDays : DEFAULT_DAYS });
      setPeriodForm(nextPeriodForm(result.periods || []));
      const current=result.academicYears?.find((year:AcademicYear)=>year.isCurrent)||result.academicYears?.[0];
      setSelectedYearId(current?.id||'');
    }).catch(err=>{if(active)setError(err instanceof Error?err.message:'Xogta sannadka lama soo rari karin.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[school?.id]);

  const run = async (action:()=>Promise<unknown>, message:string) => {
    setSaving(true);setError('');setSuccess('');
    try { await action(); await refresh(); setSuccess(message); }
    catch(err){setError(err instanceof Error?err.message:'Kaydintu way fashilantay.');}
    finally{setSaving(false);}
  };

  const saveYear = (event:FormEvent) => {
    event.preventDefault();
    const payload={...yearForm};
    void run(async()=>{
      if(editingYearId) await ApiClient.updateAcademicYear(editingYearId,payload);
      else await ApiClient.createAcademicYear(payload);
      setEditingYearId('');setYearForm(emptyYear);
    },editingYearId?'Sannadka waa la cusboonaysiiyey.':'Sannadka waa la kaydiyey.');
  };
  const editYear = (year:AcademicYear) => {
    setEditingYearId(year.id);setYearForm({name:year.name,startDate:year.startDate,endDate:year.endDate,isCurrent:year.isCurrent});
  };
  const deleteYear = (year:AcademicYear) => {
    if(!window.confirm('Ma hubtaa inaad tirtirayso sannadka '+year.name+'?'))return;
    void run(()=>ApiClient.deleteAcademicYear(year.id),'Sannadka waa la tirtiray.');
  };

  const saveTerm = (event:FormEvent) => {
    event.preventDefault();
    if(!selectedYear)return;
    const payload={...termForm,academicYearId:selectedYear.id};
    void run(async()=>{
      if(editingTermId)await ApiClient.updateAcademicTerm(editingTermId,payload);
      else await ApiClient.createAcademicTerm(payload);
      setEditingTermId('');setTermForm(emptyTerm);
    },editingTermId?'Xiisadda waa la cusboonaysiiyey.':'Xiisadda waa la kaydiyey.');
  };
  const editTerm = (term:Term) => {
    setEditingTermId(term.id);setTermForm({name:term.name,startDate:term.startDate,endDate:term.endDate,isCurrent:term.isCurrent});
  };
  const deleteTerm = (term:Term) => {
    if(!window.confirm('Ma hubtaa inaad tirtirayso '+term.name+'?'))return;
    void run(()=>ApiClient.deleteAcademicTerm(term.id),'Xiisadda waa la tirtiray.');
  };

  const saveDays = () => void run(()=>ApiClient.saveAcademicWorkingDays(data.schoolDays.map(({dayOfWeek,isWorking})=>({dayOfWeek,isWorking}))), 'Maalmaha shaqada waa la kaydiyey.');
  const savePeriod = (event:FormEvent) => {
    event.preventDefault();
    void run(async()=>{
      if(editingPeriodId)await ApiClient.updateAcademicPeriod(editingPeriodId,periodForm);
      else await ApiClient.createAcademicPeriod(periodForm);
      setEditingPeriodId('');setPeriodForm(nextPeriodForm(data.periods));
    },editingPeriodId?'Xiisadda waa la cusboonaysiiyey.':'Xiisadda waa la kaydiyey.');
  };
  const editPeriod = (period:Period) => {
    setEditingPeriodId(period.id);setPeriodForm({number:period.number,type:period.type,startTime:period.startTime,endTime:period.endTime});
  };
  const deletePeriod = (period:Period) => {
    if(!window.confirm('Ma hubtaa inaad tirtirayso '+(period.type==='break'?'nasashadan':'xiisaddan')+'?'))return;
    void run(()=>ApiClient.deleteAcademicPeriod(period.id),'Xiisadda waa la tirtiray.');
  };
  const movePeriod = (period:Period,direction:-1|1) => {
    const ordered=[...data.periods].sort((a,b)=>a.number-b.number);
    const index=ordered.findIndex(item=>item.id===period.id), target=index+direction;
    if(target<0||target>=ordered.length)return;
    const moved=[...ordered];[moved[index],moved[target]]=[moved[target],moved[index]];
    void run(()=>ApiClient.reorderAcademicPeriods(moved.map(item=>item.id)),'Kala-horraynta waa la kaydiyey.');
  };

  if(loading)return <div className="academic-setup"><div className="as-card">Xogta sannadka ayaa la soo rarayaa…</div></div>;

  return <main className="academic-setup space-y-4">
    <PageHeader title="Sannad & Xiisado" subtitle="Deji sannadka waxbarashada, xiisadaha, maalmaha shaqada iyo waqtiyada maalinlaha ah." />
    <Stepper active={0} steps={[
      {label:'Sannad & Xiisado',complete:stepComplete},
      {label:'Fasallo'},{label:'Maaddooyin'},{label:'Manhaj'},{label:'Macallimiin'}
    ]} />
    {error&&<div role="alert" className="as-message as-message-error">{error}</div>}
    {success&&<div role="status" className="as-message as-message-success">{success}</div>}

    <Card title="A. Sannad-dugsiyeed" subtitle="Samee sannad cusub, wax ka beddel ama ka dhig kan hadda socda."
      actions={<Pill tone={selectedYear?'success':'muted'}>{selectedYear?'Sannad la doortay':'Sannad ma jiro'}</Pill>}>
      <form onSubmit={saveYear} className="flex flex-wrap items-end gap-3">
        <FormRow label="Magaca sannadka"><input required maxLength={50} placeholder="2026/2027" value={yearForm.name} onChange={e=>setYearForm(v=>({...v,name:e.target.value}))}/></FormRow>
        <FormRow label="Taariikhda bilowga"><input required type="date" value={yearForm.startDate} onChange={e=>setYearForm(v=>({...v,startDate:e.target.value}))}/></FormRow>
        <FormRow label="Taariikhda dhammaadka"><input required type="date" value={yearForm.endDate} onChange={e=>setYearForm(v=>({...v,endDate:e.target.value}))}/></FormRow>
        <label className="flex min-h-10 items-center gap-2 pb-1 text-sm text-[var(--as-text)]"><input type="checkbox" checked={yearForm.isCurrent} onChange={e=>setYearForm(v=>({...v,isCurrent:e.target.checked}))}/> Hadda jira</label>
        <Button variant="primary" type="submit" disabled={saving||isReadOnly}><Save size={15}/>{editingYearId?'Kaydi':'Ku dar'}</Button>
        {editingYearId&&<Button type="button" onClick={()=>{setEditingYearId('');setYearForm(emptyYear);}}>Jooji</Button>}
      </form>
      {data.academicYears.length===0?<EmptyState>Weli sannad-dugsiyeed lama diiwaangelin.</EmptyState>:<Table>
        <thead><tr><th>Sannadka</th><th>Bilow</th><th>Dhammaad</th><th>Xaalad</th><th>Ficil</th></tr></thead>
        <tbody>{data.academicYears.map(year=><tr key={year.id}>
          <td><button type="button" className="font-semibold text-[var(--as-primary)] underline-offset-2 hover:underline" onClick={()=>setSelectedYearId(year.id)}>{year.name}</button></td>
          <td>{year.startDate}</td><td>{year.endDate}</td><td>{year.isCurrent?<Pill tone="success">Hadda jira</Pill>:<Pill>Caadi</Pill>}</td>
          <td><div className="flex gap-1"><Button disabled={saving||isReadOnly} onClick={()=>{setSelectedYearId(year.id);editYear(year);}}><Pencil size={14}/>Wax ka beddel</Button><Button variant="danger" disabled={saving||isReadOnly} aria-label="Tirtir sannadka" onClick={()=>deleteYear(year)}><X size={17}/></Button></div></td>
        </tr>)}</tbody>
      </Table>}
    </Card>

    <Card title="B. Xiisadaha sannadka la doortay" subtitle={selectedYear?'Xiisadaha sannadka '+selectedYear.name+'.':'Marka hore samee ama dooro sannad-dugsiyeed.'}>
      <div className="flex flex-wrap items-end gap-3">
        <FormRow label="Sannad-dugsiyeedka"><select value={selectedYear?.id||''} onChange={e=>{setSelectedYearId(e.target.value);setEditingTermId('');setTermForm(emptyTerm);}}><option value="">Dooro sannad</option>{data.academicYears.map(year=><option key={year.id} value={year.id}>{year.name}{year.isCurrent?' · Hadda jira':''}</option>)}</select></FormRow>
      </div>
      {selectedYear&&<form onSubmit={saveTerm} className="flex flex-wrap items-end gap-3">
        <FormRow label="Magaca xiisadda"><input required maxLength={80} placeholder="Xiisadda 1" value={termForm.name} onChange={e=>setTermForm(v=>({...v,name:e.target.value}))}/></FormRow>
        <FormRow label="Bilowga"><input required type="date" min={selectedYear.startDate} max={selectedYear.endDate} value={termForm.startDate} onChange={e=>setTermForm(v=>({...v,startDate:e.target.value}))}/></FormRow>
        <FormRow label="Dhammaadka"><input required type="date" min={termForm.startDate||selectedYear.startDate} max={selectedYear.endDate} value={termForm.endDate} onChange={e=>setTermForm(v=>({...v,endDate:e.target.value}))}/></FormRow>
        <label className="flex min-h-10 items-center gap-2 pb-1 text-sm text-[var(--as-text)]"><input type="checkbox" checked={termForm.isCurrent} onChange={e=>setTermForm(v=>({...v,isCurrent:e.target.checked}))}/> Hadda socota</label>
        <Button variant="primary" type="submit" disabled={saving||isReadOnly}><Plus size={15}/>{editingTermId?'Kaydi':'Ku dar xiisad'}</Button>
        {editingTermId&&<Button type="button" onClick={()=>{setEditingTermId('');setTermForm(emptyTerm);}}>Jooji</Button>}
      </form>}
      {!selectedYear?<EmptyState>Ma jiro sannad la doortay.</EmptyState>:yearTerms.length===0?<EmptyState>Weli sannadkan xiisado laguma darin.</EmptyState>:<Table>
        <thead><tr><th>Xiisadda</th><th>Bilow</th><th>Dhammaad</th><th>Xaalad</th><th>Ficil</th></tr></thead>
        <tbody>{yearTerms.map(term=><tr key={term.id}><td className="font-semibold">{term.name}</td><td>{term.startDate}</td><td>{term.endDate}</td><td>{term.isCurrent?<Pill tone="success">Hadda socota</Pill>:<Pill>Caadi</Pill>}</td><td><div className="flex gap-1"><Button disabled={saving||isReadOnly} onClick={()=>editTerm(term)}><Pencil size={14}/>Wax ka beddel</Button><Button variant="danger" disabled={saving||isReadOnly} onClick={()=>deleteTerm(term)}><X size={17}/></Button></div></td></tr>)}</tbody>
      </Table>}
    </Card>

    <Card title="C. Maalmaha shaqada" subtitle="Sabti ilaa Khamiis waa maalmaha shaqada ee caadiga ah; Jimce waa fasax. Waad beddeli kartaa.">
      <div className="flex flex-wrap gap-2">{DAYS.map(([day,label])=>{
        const selected=data.schoolDays.find(x=>x.dayOfWeek===day)?.isWorking??(day!=='Friday');
        return <Chip key={day} selected={selected} onClick={()=>setData(current=>({...current,schoolDays:DAYS.map(([name])=>({id:current.schoolDays.find(x=>x.dayOfWeek===name)?.id||name,dayOfWeek:name,isWorking:name===day?!selected:(current.schoolDays.find(x=>x.dayOfWeek===name)?.isWorking??name!=='Friday')}))}))}>{label}</Chip>;
      })}</div>
      <div className="flex flex-wrap items-center justify-between gap-3"><Pill tone="primary">{workingDays} maalmood shaqo toddobaadkii</Pill><Button variant="primary" disabled={saving||isReadOnly} onClick={saveDays}><Save size={15}/>Kaydi maalmaha</Button></div>
    </Card>

    <Card title="D. Xiisadaha iyo nasashada maalinlaha ah" subtitle="Ku dar casharro ama nasasho; waqtiyadu isma dul saarmi karaan."
      actions={<Pill tone="primary">{lessonCount} xiisadood / maalin</Pill>}>
      <form onSubmit={savePeriod} className="flex flex-wrap items-end gap-3">
        <FormRow label="Lambarka"><input required type="number" min="1" max="20" value={periodForm.number} onChange={e=>setPeriodForm(v=>({...v,number:Number(e.target.value)}))}/></FormRow>
        <FormRow label="Nooca"><select value={periodForm.type} onChange={e=>setPeriodForm(v=>({...v,type:e.target.value as 'lesson'|'break'}))}><option value="lesson">Xiisad</option><option value="break">Nasasho</option></select></FormRow>
        <FormRow label="Waqtiga bilowga"><input required type="time" value={periodForm.startTime} onChange={e=>setPeriodForm(v=>({...v,startTime:e.target.value}))}/></FormRow>
        <FormRow label="Waqtiga dhammaadka"><input required type="time" value={periodForm.endTime} onChange={e=>setPeriodForm(v=>({...v,endTime:e.target.value}))}/></FormRow>
        <Button variant="primary" type="submit" disabled={saving||isReadOnly}><Plus size={15}/>{editingPeriodId?'Kaydi':'Ku dar'}</Button>
        {editingPeriodId&&<Button type="button" onClick={()=>{setEditingPeriodId('');setPeriodForm(emptyPeriod);}}>Jooji</Button>}
      </form>
      {data.periods.length===0?<EmptyState>Weli xiisado lama diiwaangelin. Ku dar lix xiisadood iyo hal nasasho.</EmptyState>:<Table>
        <thead><tr><th>#</th><th>Nooca</th><th>Bilow</th><th>Dhammaad</th><th>Ficil</th></tr></thead>
        <tbody>{[...data.periods].sort((a,b)=>a.number-b.number).map((period,index,all)=><tr key={period.id}>
          <td className="font-semibold">{period.number}</td><td><Pill tone={period.type==='break'?'muted':'primary'}>{period.type==='break'?'Nasasho':'Xiisad'}</Pill></td><td>{period.startTime}</td><td>{period.endTime}</td>
          <td><div className="flex gap-1"><Button disabled={saving||isReadOnly||index===0} aria-label="Kor u qaad" onClick={()=>movePeriod(period,-1)}><ChevronUp size={15}/></Button><Button disabled={saving||isReadOnly||index===all.length-1} aria-label="Hoos u dhig" onClick={()=>movePeriod(period,1)}><ChevronDown size={15}/></Button><Button disabled={saving||isReadOnly} onClick={()=>editPeriod(period)}><Pencil size={14}/></Button><Button variant="danger" disabled={saving||isReadOnly} onClick={()=>deletePeriod(period)}><X size={17}/></Button></div></td>
        </tr>)}</tbody>
      </Table>}
      <div className="flex flex-wrap gap-2"><Pill tone="success">{lessonCount} xiisad / maalin</Pill><Pill tone="primary">{lessonCount*workingDays} xiisad / toddobaad</Pill></div>
    </Card>

    <footer className="flex items-center justify-between gap-3 border-t border-[var(--as-border)] pt-4">
      <Button onClick={()=>onNavigate('sch_settings')}>Hore</Button>
      <Button variant="primary" onClick={()=>onNavigate('sch_classes')}>Xiga <Check size={15}/></Button>
    </footer>
  </main>;
};
