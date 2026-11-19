import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ApiClient} from '../../services/api.ts';
import {SchoolClass,Student,Subject} from '../../types/index.ts';

type Term={id:string;name:string;academic_year_id:string;status:'open'|'closed'};
type ComponentRow={id:string;kind:string;name:string;max_marks:number;seq:number};
type AssignmentRow={classId:string;subjectId:string;class?:SchoolClass;subject?:Subject;sectionId?:string|null};

export const TermMarksTeacherWorkspace:React.FC<{
  classes:SchoolClass[];
  students:Student[];
  selectedClassId:string;
  onClassChange:(id:string)=>void;
}> = ({classes,students,selectedClassId,onClassChange})=>{
  const [terms,setTerms]=useState<Term[]>([]);
  const [assignments,setAssignments]=useState<AssignmentRow[]>([]);
  const [assignmentLoading,setAssignmentLoading]=useState(false);
  const [termId,setTermId]=useState('');
  const [subjectId,setSubjectId]=useState('');
  const [componentId,setComponentId]=useState('');
  const [components,setComponents]=useState<ComponentRow[]>([]);
  const [allowedIds,setAllowedIds]=useState<string[]>([]);
  const [values,setValues]=useState<Record<string,string>>({});
  const [statuses,setStatuses]=useState<Record<string,'present'|'absent'|'excused'>>({});
  const [maxMarks,setMaxMarks]=useState(0);
  const [savedCount,setSavedCount]=useState(0);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const refs=useRef<Array<HTMLInputElement|null>>([]);
  const currentTerm=terms.find(t=>t.id===termId);
  const assignedClassIds=useMemo(()=>new Set(assignments.map(a=>a.classId)),[assignments]);
  const availableClasses=[...new Map([
    ...classes.filter(klass=>assignedClassIds.has(klass.id)).map(klass=>[klass.id,klass] as [string,SchoolClass]),
    ...assignments.filter(row=>row.class).map(row=>[row.classId,row.class!] as [string,SchoolClass])
  ]).values()];
  const subjects=useMemo(()=>[...new Map(assignments.filter(a=>a.classId===selectedClassId&&a.subject).map(a=>[a.subjectId,a.subject!])).values()], [assignments,selectedClassId]);
  const visibleStudents=students.filter(s=>allowedIds.includes(s.id));
  const enteredCount=visibleStudents.filter(s=>statuses[s.id]==='absent'||statuses[s.id]==='excused'||(values[s.id]!==undefined&&values[s.id]!=='' )).length;

  const loadTerms=async()=>{
    try{const rows=await ApiClient.request<Term[]>('/term-marks/terms');setTerms(rows);if(!termId&&rows.length)setTermId(rows.find(t=>t.status==='open')?.id||rows[0].id);}
    catch(e:any){setError(e.message||'Term-yada lama soo gelin.');}
  };
  const loadAssignments=async()=>{
    if(!termId)return;
    setAssignmentLoading(true);
    try{
      const rows=await ApiClient.request<AssignmentRow[]>(`/term-marks/assignments?termId=${encodeURIComponent(termId)}`);
      setAssignments(rows);
      if(rows.length&&!rows.some(row=>row.classId===selectedClassId))onClassChange(rows[0].classId);
      if(!rows.length){setAllowedIds([]);setComponents([]);setComponentId('');setError('Term-kan wali laguma siin qoondeyn Step 6 ah.');}
      else setError('');
    }catch(e:any){setAssignments([]);setError(e.message||'Qoondeynta macallinka lama soo gelin.');}
    finally{setAssignmentLoading(false);}
  };
  const loadComponents=async()=>{
    if(!termId||!selectedClassId||assignmentLoading||!assignments.some(a=>a.classId===selectedClassId))return;
    try{
      const rows=await ApiClient.request<any[]>(`/term-marks/structures?termId=${encodeURIComponent(termId)}&classId=${encodeURIComponent(selectedClassId)}`);
      const structure=rows.find(r=>r.class_id===selectedClassId)||rows.find(r=>r.class_id===null);
      setComponents(structure?.components||[]);
      setComponentId(old=>(structure?.components||[]).some((c:ComponentRow)=>c.id===old)?old:(structure?.components?.[0]?.id||''));
    }catch(e:any){setError(e.message||'Qaybaha dhibcaha lama soo gelin.');}
  };
  const loadEntry=async()=>{
    if(!termId||!selectedClassId||!subjectId||!componentId)return;
    setBusy(true);setError('');setMessage('');
    try{
      const data=await ApiClient.request<any>(`/term-marks/entry?termId=${encodeURIComponent(termId)}&classId=${encodeURIComponent(selectedClassId)}&subjectId=${encodeURIComponent(subjectId)}&componentId=${encodeURIComponent(componentId)}`);
      setAllowedIds(data.allowedStudentIds||[]);setMaxMarks(Number(data.maxMarks||0));
      const nextValues:Record<string,string>={};const nextStatuses:Record<string,'present'|'absent'|'excused'>={};
      for(const row of data.marks||[]){nextValues[row.student_id]=row.marks===null?'':String(row.marks);nextStatuses[row.student_id]=row.status;}
      setValues(nextValues);setStatuses(nextStatuses);setSavedCount((data.marks||[]).length);
    }catch(e:any){setError(e.message||'Dhibcaha ardayda lama soo gelin.');}
    finally{setBusy(false);}
  };
  useEffect(()=>{void loadTerms();},[]);
  useEffect(()=>{void loadAssignments();},[termId]);
  useEffect(()=>{void loadComponents();},[termId,selectedClassId,assignments,assignmentLoading]);
  useEffect(()=>{if(!subjects.some(s=>s.id===subjectId))setSubjectId(subjects[0]?.id||'');},[subjects,subjectId]);
  useEffect(()=>{if(availableClasses.length&&!availableClasses.some(c=>c.id===selectedClassId))onClassChange(availableClasses[0].id);},[availableClasses,selectedClassId,onClassChange]);
  useEffect(()=>{void loadEntry();},[termId,selectedClassId,subjectId,componentId]);

  const save=async()=>{
    if(!componentId||!subjectId||!selectedClassId||currentTerm?.status==='closed')return;
    const payload=visibleStudents.map(student=>{
      const status=statuses[student.id]||'present';
      const raw=values[student.id];
      return {studentId:student.id,status,marks:status==='present'?(raw===''||raw===undefined?null:Number(raw)):null};
    });
    if(payload.some(row=>row.status==='present'&&row.marks!==null&&(!Number.isFinite(row.marks)||row.marks<0||row.marks>maxMarks))){
      setError(`Dhibcaha geli inta u dhexeysa 0 iyo ${maxMarks}.`);return;
    }
    setBusy(true);setError('');setMessage('');
    try{
      const result=await ApiClient.request<any>('/term-marks/entry',{method:'POST',body:JSON.stringify({componentId,classId:selectedClassId,subjectId,marks:payload})});
      setSavedCount(result.saved_count||payload.length);setMessage(`Waa la kaydiyey ${result.saved_count||payload.length} arday.`);
    }catch(e:any){setError(e.message||'Dhibcaha lama kaydin.');}
    finally{setBusy(false);}
  };

  return <section className="mb-5 space-y-3 rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
    <div><h2 className="text-lg font-bold text-slate-900">Dhibco — Term 1 / Term 2</h2><p className="text-xs text-slate-500">Geli dhibcaha qaybta aad dhigto. Riix Enter si aad ugu gudubto ardayga xiga.</p></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-semibold text-slate-600">Term<select value={termId} onChange={e=>setTermId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm">{terms.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Fasal<select value={selectedClassId} onChange={e=>onClassChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm">{availableClasses.map(c=><option key={c.id} value={c.id}>{c.name} {c.section}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Maaddo<select value={subjectId} onChange={e=>setSubjectId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm">{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Qaybta<select value={componentId} onChange={e=>setComponentId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm">{components.map(c=><option key={c.id} value={c.id}>{c.name} / {c.max_marks}</option>)}</select></label>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="font-semibold text-slate-600">{savedCount} / {visibleStudents.length} la kaydiyey · {enteredCount} / {visibleStudents.length} la geliyey</span>
      <span className={currentTerm?.status==='closed'?'font-semibold text-rose-700':'font-semibold text-emerald-700'}>{currentTerm?.status==='closed'?'Term-ku wuu xiran yahay':'Term-ku wuu furan yahay'}</span>
    </div>
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[540px] text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-2">#</th><th className="p-2">Arday</th><th className="p-2">Xaalad</th><th className="p-2">Dhibco / {maxMarks}</th></tr></thead>
        <tbody>{visibleStudents.map((student,index)=><tr key={student.id} className="border-t border-slate-100"><td className="p-2 text-slate-400">{index+1}</td><td className="p-2 font-medium">{[student.firstName,student.middleName,student.lastName].filter(Boolean).join(' ')}</td><td className="p-2"><select disabled={currentTerm?.status==='closed'||busy} value={statuses[student.id]||'present'} onChange={e=>setStatuses(old=>({...old,[student.id]:e.target.value as any}))} className="rounded-lg border border-slate-300 bg-white p-2 text-xs"><option value="present">Joogay</option><option value="absent">Maqan</option><option value="excused">Fasax</option></select></td><td className="p-2"><input ref={el=>{refs.current[index]=el;}} disabled={currentTerm?.status==='closed'||busy||(statuses[student.id]||'present')!=='present'} type="number" min="0" max={maxMarks} step="0.5" inputMode="decimal" value={values[student.id]??''} onChange={e=>setValues(old=>({...old,[student.id]:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();refs.current[index+1]?.focus();}}} className="w-28 rounded-lg border border-slate-300 p-2 text-sm tabular-nums" placeholder="—"/></td></tr>)}</tbody>
      </table>
    </div>
    {!visibleStudents.length&&<p className="text-sm text-slate-500">{assignmentLoading?'Qoondeynta macallinka ayaa la soo gelinayaa…':'Ardayda loo qoondeeyey maaddadan lama helin. Hubi fasalka iyo Step 6 Teacher Assignments.'}</p>}
    <div className="flex flex-wrap items-center gap-3"><button disabled={busy||assignmentLoading||!visibleStudents.length||currentTerm?.status==='closed'||!componentId} onClick={()=>void save()} className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy?'Kaydinaya…':'Kaydi dhibcaha'}</button><button disabled={busy} onClick={()=>void loadEntry()} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold">Dib u soo rar</button></div>
    {message&&<p role="status" className="text-sm text-emerald-700">{message}</p>}{error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
  </section>;
};
