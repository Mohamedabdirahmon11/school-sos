import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, ChevronDown, Copy, FileText, Plus, Printer, RotateCcw, Save, Trash2 } from 'lucide-react';
import { ApiClient } from '../../services/api.ts';
import type { FeePayment, SchoolClass, Student, StudentMark, TimetableSlot } from '../../types/index.ts';
import { sanitizeDocumentHtml } from '../../lib/documents/sanitize-html.ts';
import {
  renderAttendanceSheet, renderCertificate, renderClassList, renderClassTimetable,
  renderExamResultList, renderFeeReceipt, renderIndividualReportCard, renderOfficialLetter,
  renderStudentIdCards
} from '../../lib/documents/structured-renderers.ts';
import type { AttendanceEntry, TemplateConfig, TemplateKind, TemplateSubject } from '../../lib/documents/template-engine.ts';

const TEMPLATE_OPTIONS: Array<{ kind:TemplateKind; label:string }> = [
  { kind:'exam_result_list', label:'Go’aanka imtixaanka' },
  { kind:'individual_report_card', label:'Warqadda natiijada ardayga' },
  { kind:'attendance_sheet', label:'Xaadirinta ardayda' },
  { kind:'certificate', label:'Shahaado' },
  { kind:'student_id_cards', label:'Kaarka aqoonsiga ardayga' },
  { kind:'official_letter', label:'Warqad rasmi ah' },
  { kind:'fee_receipt', label:'Rasiidka lacag-bixinta' },
  { kind:'class_timetable', label:'Jadwalka fasalka' },
  { kind:'class_list', label:'Liiska ardayda fasalka' }
];

const DAYS = ['Isniin','Talaado','Arbaco','Khamiis','Jimce','Sabti'];
const DEFAULT_SUBJECTS: TemplateSubject[] = [{ id:'subject-1', name:'Maaddada 1', maxMark:100 }];

function defaultConfig(kind:TemplateKind, accentColor:string):TemplateConfig {
  return {
    version:1, kind, title:TEMPLATE_OPTIONS.find(item=>item.kind===kind)?.label || 'Template',
    direction:'rtl', accentColor:/^#[0-9a-fA-F]{6}$/.test(accentColor)?accentColor:'#176b5b',
    rowsPerPage:20, subjects:DEFAULT_SUBJECTS, passRule:{mode:'percent',percent:40},
    showLogo:true, showQr:true, showSummary:true, showFooter:true, zebra:true, fontSize:11, rowHeight:28
  };
}

function studentName(student:Student):string {
  return [student.firstName,student.middleName,student.lastName].filter(Boolean).join(' ').trim();
}

function documentType(kind:TemplateKind):string {
  if (kind==='certificate') return 'certificate';
  if (kind==='official_letter') return 'parent_letter';
  if (kind==='individual_report_card' || kind==='exam_result_list') return 'report_summary';
  return 'other';
}

function approved(mark:StudentMark):boolean {
  return Boolean(mark.approvedAt || mark.publishedAt);
}

export interface StructuredTemplatesPanelProps {
  schoolName:string;
  accentColor:string;
  onCreated:(document:unknown)=>void;
  onClose:()=>void;
}

export function StructuredTemplatesPanel({schoolName,accentColor,onCreated,onClose}:StructuredTemplatesPanelProps) {
  const [kind,setKind]=useState<TemplateKind>('exam_result_list');
  const [name,setName]=useState('Go’aanka imtixaanka');
  const [config,setConfig]=useState<TemplateConfig>(()=>defaultConfig('exam_result_list',accentColor));
  const [savedTemplates,setSavedTemplates]=useState<any[]>([]);
  const [classes,setClasses]=useState<SchoolClass[]>([]);
  const [classId,setClassId]=useState('');
  const [students,setStudents]=useState<Student[]>([]);
  const [studentId,setStudentId]=useState('');
  const [subjects,setSubjects]=useState<TemplateSubject[]>(DEFAULT_SUBJECTS);
  const [term1Marks,setTerm1Marks]=useState<StudentMark[]>([]);
  const [term2Marks,setTerm2Marks]=useState<StudentMark[]>([]);
  const [attendance,setAttendance]=useState<AttendanceEntry[]>([]);
  const [timetable,setTimetable]=useState<TimetableSlot[]>([]);
  const [payments,setPayments]=useState<FeePayment[]>([]);
  const [month,setMonth]=useState(new Date().getMonth()+1);
  const [year,setYear]=useState(new Date().getFullYear());
  const [examTitle,setExamTitle]=useState('Imtixaanka dhammaadka xilli-dugsiyeedka');
  const [recipient,setRecipient]=useState('Cidda ay khusayso');
  const [letterSubject,setLetterSubject]=useState('');
  const [letterBody,setLetterBody]=useState('');
  const [certificateBody,setCertificateBody]=useState('Waxaa lagu maamuusayaa dadaal, akhlaaq iyo guul waxbarasho.');
  const [certificateDate,setCertificateDate]=useState(new Date().toISOString().slice(0,10));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [preview,setPreview]=useState('');

  const selectedStudent=useMemo(()=>students.find(student=>student.id===studentId)||students[0],[students,studentId]);
  const selectedClass=useMemo(()=>classes.find(item=>item.id===classId),[classes,classId]);

  const loadSavedTemplates=useCallback(async()=>{
    try { setSavedTemplates(await ApiClient.getStructuredDocumentTemplates()); }
    catch(error) { setMessage(error instanceof Error?error.message:'Template-yada lama soo dejin karin.'); }
  },[]);

  useEffect(()=>{
    void ApiClient.getClasses().then(result=>{setClasses(result);if(result[0])setClassId(result[0].id);}).catch(()=>setClasses([]));
    void loadSavedTemplates();
  },[loadSavedTemplates]);

  useEffect(()=>{
    if(!classId)return;
    let active=true;
    setBusy(true);
    Promise.all([
      ApiClient.getAllStudents(classId,undefined,100),
      ApiClient.getClassDetails(classId,{page:1,pageSize:100}),
      ApiClient.getMarks(classId,undefined,'Semester 1'),
      ApiClient.getMarks(classId,undefined,'Semester 2'),
      ApiClient.getAttendanceMonth(classId,year,month),
      ApiClient.getTimetable(classId)
    ]).then(([roster,details,firstMarks,secondMarks,monthAttendance,slots])=>{
      if(!active)return;
      setStudents(roster);
      setStudentId(current=>roster.some(student=>student.id===current)?current:roster[0]?.id||'');
      const classSubjects=details.subjects.map(item=>item.subject).filter(Boolean).map(subject=>({id:subject!.id,name:subject!.name,maxMark:100}));
      setSubjects(classSubjects.length?classSubjects:DEFAULT_SUBJECTS);
      setConfig(current=>({...current,subjects:classSubjects.length?classSubjects:DEFAULT_SUBJECTS}));
      setTerm1Marks(firstMarks.filter(approved));
      setTerm2Marks(secondMarks.filter(approved));
      setAttendance(monthAttendance);
      setTimetable(slots);
    }).catch(error=>{if(active)setMessage(error instanceof Error?error.message:'Xogta fasalka lama soo dejin karin.');})
      .finally(()=>{if(active)setBusy(false);});
    return ()=>{active=false;};
  },[classId,month,year]);

  useEffect(()=>{
    if(!selectedStudent){setPayments([]);return;}
    let active=true;
    ApiClient.getFeePayments(selectedStudent.id,{page:1,pageSize:100}).then(result=>{if(active)setPayments(result);}).catch(()=>{if(active)setPayments([]);});
    return ()=>{active=false;};
  },[selectedStudent?.id]);

  useEffect(()=>{setConfig(current=>({...current,kind,title:TEMPLATE_OPTIONS.find(item=>item.kind===kind)?.label||current.title}));setName(TEMPLATE_OPTIONS.find(item=>item.kind===kind)?.label||'Template');setPreview('');},[kind]);

  const updateConfig=(patch:Partial<TemplateConfig>)=>setConfig(current=>({...current,...patch}));

  const buildHtml=useCallback(()=>{
    const student=selectedStudent;
    const nameOf=student?studentName(student):'';
    const first=student?term1Marks.filter(mark=>mark.studentId===student.id):[];
    const second=student?term2Marks.filter(mark=>mark.studentId===student.id):[];
    const subjectsWithMarks=subjects.map(subject=>{
      const m1=first.find(mark=>mark.subjectId===subject.id);
      const m2=second.find(mark=>mark.subjectId===subject.id);
      const final=m1&&m2?(Number(m1.totalMarks)+Number(m2.totalMarks))/2:null;
      return {name:subject.name,term1:m1?.totalMarks??null,term2:m2?.totalMarks??null,final,grade:''};
    });
    const slotsByDay:Record<string,Record<string,string>>={};
    for(const slot of timetable){
      const day=String(slot.dayOfWeek).toLowerCase();
      const dayLabel=day.includes('mon')||day==='1'?'Isniin':day.includes('tue')||day==='2'?'Talaado':day.includes('wed')||day==='3'?'Arbaco':day.includes('thu')||day==='4'?'Khamiis':day.includes('fri')||day==='5'?'Jimce':'Sabti';
      (slotsByDay[dayLabel] ||= {})[String(slot.periodNumber)]=slot.subjectName||slot.subjectId;
    }
    switch(kind){
      case 'exam_result_list':{
        const examStudents=students.map(item=>{
          const rowMarks:Record<string,number>={};
          for(const subject of subjects){
            const mark=term1Marks.find(entry=>entry.studentId===item.id&&entry.subjectId===subject.id);
            if(mark)rowMarks[subject.id]=Number(mark.totalMarks);
          }
          const total=subjects.reduce((sum,subject)=>sum+(rowMarks[subject.id]||0),0);
          const threshold=subjects.reduce((sum,subject)=>sum+subject.maxMark,0)*(Number(config.passRule.percent??40)/100);
          return {id:item.studentId,name:studentName(item),marks:rowMarks,outcome:total>=threshold?'Gudub':'Aan Gudbin' as const};
        });
        return renderExamResultList({schoolName,examTitle,academicYear:selectedClass?.academicYear||String(year),subjects,students:examStudents,passRule:config.passRule,rowsPerPage:config.rowsPerPage});
      }
      case 'individual_report_card':
        return student?renderIndividualReportCard({schoolName,student:{id:student.studentId,name:nameOf,className:selectedClass?.name||'',academicYear:selectedClass?.academicYear||String(year)},subjects:subjectsWithMarks,total:subjectsWithMarks.reduce((sum,item)=>sum+(item.final||0),0),average:subjectsWithMarks.length?subjectsWithMarks.reduce((sum,item)=>sum+(item.final||0),0)/subjectsWithMarks.length:0,outcome:'Aan Gudbin'}):'';
      case 'attendance_sheet':
        return renderAttendanceSheet({schoolName,className:selectedClass?.name||'',month,year,students:students.map(item=>({id:item.id,name:studentName(item)})),entries:attendance,rowsPerPage:config.rowsPerPage})[0];
      case 'certificate':
        return renderCertificate({schoolName,title:name,studentName:nameOf,body:certificateBody,rankOrTotal:'',date:certificateDate});
      case 'student_id_cards':
        return renderStudentIdCards({schoolName,year:String(year),accentColor:config.accentColor,cards:students.slice(0,8).map(item=>({id:item.studentId,name:studentName(item),className:selectedClass?.name||''}))});
      case 'official_letter':
        return renderOfficialLetter({schoolName,date:certificateDate,recipient,subject:letterSubject,paragraphs:letterBody.split(/\n+/).filter(Boolean),signatory:'Maamulka dugsiga'});
      case 'fee_receipt':{
        const latest=payments[0];
        return latest?renderFeeReceipt({schoolName,receiptNumber:latest.receiptNumber,date:latest.date,student:{id:student?.studentId||'',name:nameOf,className:selectedClass?.name||'',parentName:student?.fatherName||''},items:payments.map(payment=>({description:payment.feeType,amount:payment.amountPaid})),currency:'ETB',receivedBy:latest.recordedBy||''}):'';
      }
      case 'class_timetable':{
        const periods=[...new Set(timetable.map(slot=>slot.periodNumber))].sort((a,b)=>a-b).map(period=>{const slot=timetable.find(item=>item.periodNumber===period);return {label:String(period),start:slot?.startTime||'',end:slot?.endTime||''};});
        return renderClassTimetable({schoolName,className:selectedClass?.name||'',days:DAYS,periods,cells:slotsByDay});
      }
      case 'class_list':
        return renderClassList({schoolName,className:selectedClass?.name||'',students:students.map(item=>({id:item.studentId,name:studentName(item),gender:item.gender==='male'?'Lab':'Dhedig',parentPhone:item.fatherPhone})),rowsPerPage:config.rowsPerPage})[0];
      default:return '';
    }
  },[kind,selectedStudent,students,subjects,term1Marks,term2Marks,attendance,timetable,payments,selectedClass,schoolName,examTitle,year,month,config,certificateBody,certificateDate,recipient,letterSubject,letterBody,name]);

  const createDocument=async()=>{
    const html=buildHtml();
    if(!html){setMessage(kind==='fee_receipt'?'Ardaygan weli ma laha rasiid lacag-bixin.':'Xog ku filan lagama helin fasalka ama ardayga la doortay.');return;}
    setBusy(true);
    try{
      const created=await ApiClient.createDocument({title:name||TEMPLATE_OPTIONS.find(item=>item.kind===kind)?.label||'Dukumenti',documentType:documentType(kind),contentHtml:html,status:'draft',pageSize:kind==='student_id_cards'?'A4':'A4',direction:config.direction,pageMargins:10});
      onCreated(created);
    }catch(error){setMessage(error instanceof Error?error.message:'Dukumentiga lama abuuri karin.');}
    finally{setBusy(false);}
  };

  const saveAsMyTemplate=async()=>{
    setBusy(true);
    try{
      await ApiClient.createStructuredDocumentTemplate({type:kind,name:name.trim()||config.title,config:{...config,title:name.trim()||config.title}});
      await loadSavedTemplates();
      setMessage('Template-kaaga waa la kaydiyey.');
    }catch(error){setMessage(error instanceof Error?error.message:'Template-ka lama kaydin karin.');}
    finally{setBusy(false);}
  };

  const loadTemplate=(template:any)=>{
    if(!template?.config)return;
    setKind(template.type);
    setName(template.name);
    setConfig(template.config as TemplateConfig);
    setMessage('Template-ka waa la furay.');
  };

  const reset=()=>{const next=defaultConfig(kind,accentColor);setConfig(next);setName(next.title);setMessage('Dejintii caadiga ahayd waa la soo celiyey.');};
  const removeSaved=async(id:string)=>{
    try{await ApiClient.deleteStructuredDocumentTemplate(id);await loadSavedTemplates();}
    catch(error){setMessage(error instanceof Error?error.message:'Template-ka lama tirtiri karin.');}
  };

  const previewHtml=()=>{
    const html=buildHtml();
    setPreview(html);
    if(!html)setMessage('Xogta template-kan weli kuma filna horudhac.');
  };

  const addSubject=()=>updateConfig({subjects:[...config.subjects,{id:`subject-${Date.now()}`,name:`Maaddo ${config.subjects.length+1}`,maxMark:100}].slice(0,12)});
  const updateSubject=(id:string,patch:Partial<TemplateSubject>)=>updateConfig({subjects:config.subjects.map(subject=>subject.id===id?{...subject,...patch}:subject)});
  const deleteSubject=(id:string)=>updateConfig({subjects:config.subjects.filter(subject=>subject.id!==id).length?config.subjects.filter(subject=>subject.id!==id):DEFAULT_SUBJECTS});

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" dir="rtl">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><BookOpen size={20}/> Qaababka dukumentiyada A4</h2><p className="mt-1 text-xs text-slate-500">Sagaalka template waxay ka akhristaan xogta fasalka, natiijooyinka, xaadirinta, jadwalka iyo lacag-bixinta.</p></div>
      <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Xir</button>
    </div>
    {message&&<div role="status" className="mb-3 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">{message}</div>}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-slate-600">Nooca template-ka
          <select value={kind} onChange={event=>setKind(event.target.value as TemplateKind)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">{TEMPLATE_OPTIONS.map(item=><option key={item.kind} value={item.kind}>{item.label}</option>)}</select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">Magaca template-ka
          <input value={name} onChange={event=>setName(event.target.value)} maxLength={160} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"/>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-slate-600">Fasal
            <select value={classId} onChange={event=>setClassId(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"><option value="">Dooro fasal</option>{classes.map(item=><option key={item.id} value={item.id}>{item.name} {item.section||''}</option>)}</select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Arday
            <select value={studentId} onChange={event=>setStudentId(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"><option value="">Ardayga koowaad</option>{students.map(item=><option key={item.id} value={item.id}>{studentName(item)}</option>)}</select>
          </label>
        </div>
        {(kind==='attendance_sheet')&&<div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-600">Bil<input type="number" min={1} max={12} value={month} onChange={event=>setMonth(Number(event.target.value))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2"/></label><label className="text-xs font-semibold text-slate-600">Sanad<input type="number" min={2000} max={2100} value={year} onChange={event=>setYear(Number(event.target.value))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2"/></label></div>}
        {kind==='exam_result_list'&&<label className="block text-xs font-semibold text-slate-600">Cinwaanka imtixaanka<input value={examTitle} onChange={event=>setExamTitle(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3"/></label>}
        {kind==='certificate'&&<><label className="block text-xs font-semibold text-slate-600">Qoraalka shahaadada<textarea rows={3} value={certificateBody} onChange={event=>setCertificateBody(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2"/></label><label className="block text-xs font-semibold text-slate-600">Taariikh<input type="date" value={certificateDate} onChange={event=>setCertificateDate(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2"/></label></>}
        {kind==='official_letter'&&<><label className="block text-xs font-semibold text-slate-600">Ku<input value={recipient} onChange={event=>setRecipient(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3"/></label><label className="block text-xs font-semibold text-slate-600">Ujeeddo<input value={letterSubject} onChange={event=>setLetterSubject(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3"/></label><label className="block text-xs font-semibold text-slate-600">Qoraalka<textarea rows={4} value={letterBody} onChange={event=>setLetterBody(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2"/></label></>}
        <details className="rounded-xl border border-slate-200 p-3">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700"><ChevronDown size={16}/> Dejinta naqshadda</summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs">Midabka<input type="color" value={config.accentColor} onChange={event=>updateConfig({accentColor:event.target.value})} className="mt-1 h-9 w-full rounded border"/></label>
            <label className="text-xs">Safafka bogga<input type="number" min={5} max={25} value={config.rowsPerPage} onChange={event=>updateConfig({rowsPerPage:Math.max(5,Math.min(25,Number(event.target.value)||20))})} className="mt-1 min-h-9 w-full rounded border px-2"/></label>
            <label className="text-xs">Xadka gudbidda (%)<input type="number" min={0} max={100} value={config.passRule.percent??40} onChange={event=>updateConfig({passRule:{mode:'percent',percent:Math.max(0,Math.min(100,Number(event.target.value)||0))}})} className="mt-1 min-h-9 w-full rounded border px-2"/></label>
            <label className="text-xs">Cabbirka farta<input type="number" min={8} max={24} value={config.fontSize} onChange={event=>updateConfig({fontSize:Math.max(8,Math.min(24,Number(event.target.value)||11))})} className="mt-1 min-h-9 w-full rounded border px-2"/></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">{(['showLogo','showQr','showSummary','showFooter','zebra'] as const).map(key=><label key={key} className="flex items-center gap-1"><input type="checkbox" checked={config[key]} onChange={event=>updateConfig({[key]:event.target.checked} as Partial<TemplateConfig>)}/>{({showLogo:'Logo',showQr:'QR',showSummary:'Soo koobid',showFooter:'Footer',zebra:'Safaf kala midab'})[key]}</label>)}</div>
          {(kind==='exam_result_list'||kind==='individual_report_card')&&<div className="mt-3 space-y-2"><div className="flex items-center justify-between"><strong className="text-xs">Maaddooyinka</strong><button type="button" onClick={addSubject} disabled={config.subjects.length>=12} className="rounded border px-2 py-1 text-xs disabled:opacity-40"><Plus size={12} className="inline"/> Ku dar</button></div>{config.subjects.map(subject=><div key={subject.id} className="flex gap-2"><input value={subject.name} onChange={event=>updateSubject(subject.id,{name:event.target.value})} className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"/><input type="number" min={1} max={100} value={subject.maxMark} onChange={event=>updateSubject(subject.id,{maxMark:Math.max(1,Math.min(100,Number(event.target.value)||100))})} className="w-16 rounded border px-2 py-1 text-xs"/><button type="button" onClick={()=>deleteSubject(subject.id)} aria-label="Tirtir maaddada" className="rounded p-1 text-rose-600"><Trash2 size={14}/></button></div>)}</div>}
        </details>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={previewHtml} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Horudhac</button>
          <button type="button" disabled={busy} onClick={()=>void saveAsMyTemplate()} className="inline-flex items-center gap-2 rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-50"><Save size={15}/> Kaydi template-kayga</button>
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RotateCcw size={15}/> Dib u celi</button>
          <button type="button" disabled={busy} onClick={()=>void createDocument()} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><FileText size={15}/> Samee dukumenti</button>
        </div>
        {savedTemplates.length>0&&<div className="rounded-xl border border-slate-200 p-3"><h3 className="mb-2 text-xs font-bold">Template-yadayda</h3>{savedTemplates.map(template=><div key={template.id} className="flex items-center gap-2 border-t py-2 text-xs"><button type="button" onClick={()=>loadTemplate(template)} className="min-w-0 flex-1 truncate text-left">{template.name}</button><button type="button" onClick={()=>void removeSaved(template.id)} aria-label="Tirtir template" className="text-rose-600"><Trash2 size={14}/></button></div>)}</div>}
        {busy&&<p className="text-xs text-slate-500">Waa la shaqaynayaa…</p>}
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">Warqadda A4</h3><span className="text-xs text-slate-500">{students.length} arday · {subjects.length} maaddo</span></div>
        {preview?<div className="max-h-[75vh] overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-3"><div className="mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white p-4 shadow" dangerouslySetInnerHTML={{__html:sanitizeDocumentHtml(preview)}}/></div>:<div className="flex min-h-[480px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500"><div><Printer size={28} className="mx-auto mb-2"/><p>Riix Horudhac si aad u aragto qaabka la buuxiyey.</p><p className="mt-1 text-xs">{busy?'Xogta fasalka ayaa la soo dejinayaa…':'Xogta la doortay ayaa halkan ka muuqan doonta.'}</p></div></div>}
      </div>
    </div>
  </section>;
}
