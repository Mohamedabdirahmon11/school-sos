import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, FileText, Plus, Printer, RotateCcw, Save, Trash2 } from 'lucide-react';
import { ApiClient } from '../../services/api.ts';
import type { FeePayment, GradingBand, SchoolClass, SchoolSetupData, Student, StudentMark, TimetableSlot } from '../../types/index.ts';
import { sanitizeDocumentHtml } from '../../lib/documents/sanitize-html.ts';
import {
  renderAttendanceSheet, renderCertificate, renderClassList, renderClassTimetable,
  renderExamResultList, renderFeeReceipt, renderIndividualReportCard, renderOfficialLetter,
  renderStudentIdCards
} from '../../lib/documents/structured-renderers.ts';
import { escapePlainText, monthDays, passThreshold, type AttendanceEntry, type TemplateConfig, type TemplateKind, type TemplateSubject } from '../../lib/documents/template-engine.ts';

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

function weekdayIndex(value:string):number|null {
  const key=value.trim().toLowerCase();
  const days:Record<string,number>={sunday:0,sun:0,axad:0,monday:1,mon:1,isniin:1,tuesday:2,tue:2,talaado:2,wednesday:3,wed:3,arbaco:3,thursday:4,thu:4,khamiis:4,friday:5,fri:5,jimce:5,saturday:6,sat:6,sabti:6};
  return Object.prototype.hasOwnProperty.call(days,key)?days[key]:null;
}

function schoolWeekendDays(calendar?:SchoolSetupData['calendar']):number[] {
  if(calendar?.workingDays?.length){
    const working=new Set(calendar.workingDays.map(weekdayIndex).filter((day):day is number=>day!==null));
    return [0,1,2,3,4,5,6].filter(day=>!working.has(day));
  }
  if(calendar?.weeklyHolidays?.length){
    return calendar.weeklyHolidays.map(weekdayIndex).filter((day):day is number=>day!==null);
  }
  return [0];
}

function schoolHolidayDates(calendar:SchoolSetupData['calendar']|undefined,year:number,month:number):string[] {
  const monthPrefix=`${year}-${String(month).padStart(2,'0')}-`;
  const dates=new Set<string>();
  for(const holiday of calendar?.nationalHolidays||[]){
    if(holiday.calendar==='gregorian'&&holiday.date.startsWith(monthPrefix))dates.add(holiday.date);
  }
  for(const holiday of calendar?.schoolHolidays||[]){
    const start=new Date(`${holiday.startDate.slice(0,10)}T00:00:00.000Z`);
    const end=new Date(`${holiday.endDate.slice(0,10)}T00:00:00.000Z`);
    if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))continue;
    for(let current=start;current<=end;current=new Date(current.getTime()+86400000)){
      const date=current.toISOString().slice(0,10);
      if(date.startsWith(monthPrefix))dates.add(date);
    }
  }
  return [...dates];
}

function gradeForMark(value:number,maxMark:number,scale:GradingBand[]):string {
  if(!scale.length||maxMark<=0)return '';
  const percentage=value/maxMark*100;
  return [...scale].sort((a,b)=>b.minPercentage-a.minPercentage).find(band=>percentage>=band.minPercentage)?.label||'';
}

function applyTemplatePresentation(html:string,config:TemplateConfig,logoUrl?:string):string {
  let output=html;
  if(!config.showFooter)output=output.replace(/<p style="border-top:1px solid #94a3b8;margin-top:20px;padding-top:6px;text-align:center;font-size:8pt;color:#64748b">SchoolOS<\/p>/g,'');
  if(!config.showSummary)output=output.replace(/<p style="font-weight:700">Wadar Arday:.*?<\/p>/g,'');
  if(!config.zebra)output=output.replaceAll('background-color:#f5f8f7','background-color:#fff');
  if(/^#[0-9a-fA-F]{6}$/.test(config.accentColor))output=output.replaceAll('#176b5b',config.accentColor);
  output=output.replaceAll('font-size:11pt','font-size:' + Math.max(8,Math.min(24,config.fontSize)) + 'pt');
  output=output.replaceAll('padding:5px','padding:' + Math.max(2,Math.min(12,Math.round(config.rowHeight/6))) + 'px');
  output=output.replaceAll('direction:rtl','direction:' + config.direction);
  let safeLogo='';
  if(logoUrl?.startsWith('/api/documents/images?path=')&&/^[A-Za-z0-9%._/-]+$/.test(logoUrl.split('path=')[1]||''))safeLogo=logoUrl;
  if(logoUrl?.startsWith('https://')){
    try{
      const parsed=new URL(logoUrl);
      if(/^[a-z0-9]{20}\.supabase\.co$/i.test(parsed.hostname)&&/^\/storage\/v1\/object\/public\/school-logos\/[A-Za-z0-9._/-]+$/i.test(parsed.pathname)&&!parsed.search&&!parsed.hash)safeLogo=logoUrl;
    }catch{}
  }
  if(config.showLogo&&safeLogo){
    output=output.replace('<div style="font-size:19pt;font-weight:700;','<img src="' + escapePlainText(safeLogo) + '" alt="" style="width:24mm;height:18mm"/> <div style="font-size:19pt;font-weight:700;');
  }
  return output;
}

export interface StructuredTemplatesPanelProps {
  schoolName:string;
  accentColor:string;
  logoUrl?:string;
  gradingScale?:GradingBand[];
  calendar?:SchoolSetupData['calendar'];
  userRole?:string;
  userId?:string;
  canManageTemplates?:boolean;
  onCreated:(document:unknown)=>void;
  onClose:()=>void;
}

export function StructuredTemplatesPanel({schoolName,accentColor,logoUrl,gradingScale=[],calendar,userRole='school_admin',userId='',canManageTemplates=true,onCreated,onClose}:StructuredTemplatesPanelProps) {
  const [kind,setKind]=useState<TemplateKind>(userRole==='teacher'?'attendance_sheet':'exam_result_list');
  const [name,setName]=useState('Go’aanka imtixaanka');
  const [config,setConfig]=useState<TemplateConfig>(()=>defaultConfig(userRole==='teacher'?'attendance_sheet':'exam_result_list',accentColor));
  const [savedTemplates,setSavedTemplates]=useState<any[]>([]);
  const [editingTemplateId,setEditingTemplateId]=useState<string|null>(null);
  const [classes,setClasses]=useState<SchoolClass[]>([]);
  const [classId,setClassId]=useState('');
  const [students,setStudents]=useState<Student[]>([]);
  const [studentId,setStudentId]=useState('');
  const [subjects,setSubjects]=useState<TemplateSubject[]>(DEFAULT_SUBJECTS);
  const [term1Marks,setTerm1Marks]=useState<StudentMark[]>([]);
  const [term2Marks,setTerm2Marks]=useState<StudentMark[]>([]);
  const [attendance,setAttendance]=useState<AttendanceEntry[]>([]);
  const [attendanceDirtyDates,setAttendanceDirtyDates]=useState<string[]>([]);
  const [timetable,setTimetable]=useState<TimetableSlot[]>([]);
  const [payments,setPayments]=useState<FeePayment[]>([]);
  const [month,setMonth]=useState(new Date().getMonth()+1);
  const [year,setYear]=useState(new Date().getFullYear());
  const [examTitle,setExamTitle]=useState('Imtixaanka dhammaadka xilli-dugsiyeedka');
  const [examSemester,setExamSemester]=useState<'Semester 1'|'Semester 2'>('Semester 1');
  const [recipient,setRecipient]=useState('Cidda ay khusayso');
  const [letterSubject,setLetterSubject]=useState('');
  const [letterBody,setLetterBody]=useState('');
  const [certificateBody,setCertificateBody]=useState('Waxaa lagu maamuusayaa dadaal, akhlaaq iyo guul waxbarasho.');
  const [certificateRankOrTotal,setCertificateRankOrTotal]=useState('');
  const [certificateSignatories,setCertificateSignatories]=useState(['Maamulaha','Macallinka']);
  const [reportSignatories,setReportSignatories]=useState(['Macallinka','Maamulaha','Waalidka']);
  const [receiptReceivedBy,setReceiptReceivedBy]=useState('Qasnajiga');
  const [reportComment,setReportComment]=useState('');
  const [feeItems,setFeeItems]=useState<Array<{description:string;amount:number}>>([]);
  const [certificateDate,setCertificateDate]=useState(new Date().toISOString().slice(0,10));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [preview,setPreview]=useState('');

  const selectedStudent=useMemo(()=>students.find(student=>student.id===studentId)||students[0],[students,studentId]);
  const selectedClass=useMemo(()=>classes.find(item=>item.id===classId),[classes,classId]);
  const attendanceDays=useMemo(()=>monthDays(year,month,schoolWeekendDays(calendar),schoolHolidayDates(calendar,year,month)),[year,month,calendar]);
  const canSaveAttendance=userRole==='teacher'&&Boolean(selectedClass&&selectedClass.classTeacherId===userId);

  const loadSavedTemplates=useCallback(async()=>{
    if(!canManageTemplates)return;
    try { setSavedTemplates(await ApiClient.getStructuredDocumentTemplates()); }
    catch(error) { setMessage(error instanceof Error?error.message:'Template-yada lama soo dejin karin.'); }
  },[canManageTemplates]);

  useEffect(()=>{
    const classesRequest=userRole==='teacher'?ApiClient.getMyFormTeacherClasses():ApiClient.getClasses();
    void classesRequest.then(result=>{setClasses(result);if(result[0])setClassId(result[0].id);}).catch(()=>setClasses([]));
    if(canManageTemplates)void loadSavedTemplates();
  },[loadSavedTemplates,userRole,canManageTemplates]);

  useEffect(()=>{
    if(!classId)return;
    let active=true;
    setBusy(true);
    setStudents([]);
    setAttendance([]);
    setTerm1Marks([]);
    setTerm2Marks([]);
    setTimetable([]);
    if(userRole==='teacher'){
      ApiClient.getAllStudents(classId,undefined,100).then(roster=>{
        if(!active)return;
        setStudents(roster);
        setStudentId(current=>roster.some(student=>student.id===current)?current:roster[0]?.id||'');
      }).catch(error=>{if(active)setMessage(error instanceof Error?error.message:'Liiska ardayda fasalka lama soo dejin karin.');})
        .finally(()=>{if(active)setBusy(false);});
      return ()=>{active=false;};
    }
    Promise.all([
      ApiClient.getAllStudents(classId,undefined,100),
      ApiClient.getClassDetails(classId,{page:1,pageSize:100}),
      ApiClient.getMarks(classId,undefined,'Semester 1'),
      ApiClient.getMarks(classId,undefined,'Semester 2'),
      ApiClient.getTimetable(classId)
    ]).then(([roster,details,firstMarks,secondMarks,slots])=>{
      if(!active)return;
      setStudents(roster);
      setStudentId(current=>roster.some(student=>student.id===current)?current:roster[0]?.id||'');
      const classSubjects=details.subjects.map(item=>item.subject).filter(Boolean).map(subject=>({id:subject!.id,name:subject!.name,maxMark:100}));
      setSubjects(classSubjects.length?classSubjects:DEFAULT_SUBJECTS);
      setConfig(current=>({...current,subjects:classSubjects.length?classSubjects:DEFAULT_SUBJECTS}));
      setTerm1Marks(firstMarks.filter(approved));
      setTerm2Marks(secondMarks.filter(approved));
      setTimetable(slots);
    }).catch(error=>{if(active)setMessage(error instanceof Error?error.message:'Xogta fasalka lama soo dejin karin.');})
      .finally(()=>{if(active)setBusy(false);});
    return ()=>{active=false;};
  },[classId,userRole]);

  useEffect(()=>{
    if(!classId)return;
    let active=true;
    setAttendanceDirtyDates([]);
    setAttendance([]);
    ApiClient.getAttendanceMonth(classId,year,month).then(result=>{if(active)setAttendance(result);})
      .catch(error=>{if(active)setMessage(error instanceof Error?error.message:'Xogta xaadirinta lama soo dejin karin.');});
    return ()=>{active=false;};
  },[classId,month,year]);

  useEffect(()=>{
    if(!selectedStudent){setPayments([]);return;}
    let active=true;
    ApiClient.getFeePayments(selectedStudent.id,{page:1,pageSize:100}).then(result=>{if(active)setPayments(result);}).catch(()=>{if(active)setPayments([]);});
    return ()=>{active=false;};
  },[selectedStudent?.id]);

  const changeKind=(nextKind:TemplateKind)=>{if(!canManageTemplates&&nextKind!=='attendance_sheet')return;const next=defaultConfig(nextKind,accentColor);setKind(nextKind);setName(next.title);setConfig(next);setEditingTemplateId(null);setPreview('');};

  const updateConfig=(patch:Partial<TemplateConfig>)=>setConfig(current=>({...current,...patch}));

  const buildHtml=useCallback(()=>{
    const student=selectedStudent;
    const activeSubjects=config.subjects;
    const examMarks=examSemester==='Semester 1'?term1Marks:term2Marks;
    const nameOf=student?studentName(student):'';
    const first=student?term1Marks.filter(mark=>mark.studentId===student.id):[];
    const second=student?term2Marks.filter(mark=>mark.studentId===student.id):[];
    const subjectsWithMarks=activeSubjects.map(subject=>{
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
          for(const subject of activeSubjects){
            const mark=examMarks.find(entry=>entry.studentId===item.id&&entry.subjectId===subject.id);
            if(mark)rowMarks[subject.id]=Number(mark.totalMarks);
          }
          const total=activeSubjects.reduce((sum,subject)=>sum+(rowMarks[subject.id]||0),0);
          const hasAnyMark=Object.keys(rowMarks).length>0;
          const threshold=passThreshold(activeSubjects,config.passRule);
          return {id:item.studentId,name:studentName(item),marks:rowMarks,outcome:!hasAnyMark?'Maqan' as const:total>=threshold?'Gudub' as const:'Aan Gudbin' as const};
        });
        return renderExamResultList({schoolName,examTitle,academicYear:selectedClass?.academicYear||String(year),subjects:activeSubjects,students:examStudents,passRule:config.passRule,rowsPerPage:config.rowsPerPage});
      }
      case 'individual_report_card':{
        const finalValues=subjectsWithMarks.filter(item=>item.final!==null).map(item=>Number(item.final));
        const finalTotal=finalValues.reduce((sum,value)=>sum+value,0);
        const finalAverage=finalValues.length?finalTotal/finalValues.length:0;
        const finalOutcome=finalTotal>=passThreshold(activeSubjects,config.passRule)?'Gudub':'Aan Gudbin';
        const ranked=students.map(item=>{
          const values=activeSubjects.map(subject=>{
            const firstMark=term1Marks.find(mark=>mark.studentId===item.id&&mark.subjectId===subject.id);
            const secondMark=term2Marks.find(mark=>mark.studentId===item.id&&mark.subjectId===subject.id);
            if(firstMark&&secondMark)return (Number(firstMark.totalMarks)+Number(secondMark.totalMarks))/2;
            if(firstMark)return Number(firstMark.totalMarks);
            if(secondMark)return Number(secondMark.totalMarks);
            return null;
          }).filter((value):value is number=>value!==null);
          return {studentId:item.id,average:values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0};
        }).sort((a,b)=>b.average-a.average);
        const rank=ranked.findIndex(item=>item.studentId===student?.id)+1;
        const gradedSubjects=subjectsWithMarks.map(item=>({...item,grade:item.final==null?'':gradeForMark(item.final,100,gradingScale)}));
        return student?renderIndividualReportCard({schoolName,student:{id:student.studentId,name:nameOf,className:selectedClass?.name||'',academicYear:selectedClass?.academicYear||String(year)},subjects:gradedSubjects,total:finalTotal,average:finalAverage,grade:gradeForMark(finalAverage,100,gradingScale),rank:rank>0?rank:'—',outcome:finalOutcome,comment:reportComment,signatories:reportSignatories}):'';
      }
      case 'attendance_sheet':
        return renderAttendanceSheet({schoolName,className:selectedClass?.name||'',month,year,students:students.map(item=>({id:item.id,name:studentName(item)})),entries:attendance,weekendDays:schoolWeekendDays(calendar),holidays:schoolHolidayDates(calendar,year,month),rowsPerPage:config.rowsPerPage}).join('<div style="break-after:page;page-break-after:always"></div>');
      case 'certificate':
        return renderCertificate({schoolName,title:name,studentName:nameOf,body:certificateBody,rankOrTotal:certificateRankOrTotal,date:certificateDate,signatories:certificateSignatories});
      case 'student_id_cards':
        return renderStudentIdCards({schoolName,year:String(year),accentColor:config.accentColor,cards:students.map(item=>({id:item.studentId,name:studentName(item),className:selectedClass?.name||'',photoUrl:item.documents?.find(document=>/\.(?:png|jpe?g|webp)$/i.test(document.name)&&document.url.startsWith('/api/documents/images?path='))?.url}))});
      case 'official_letter':
        return renderOfficialLetter({schoolName,date:certificateDate,recipient,subject:letterSubject,paragraphs:letterBody.split(/\n+/).filter(Boolean),signatory:'Maamulka dugsiga'});
      case 'fee_receipt':{
        const latest=payments.find(payment=>!payment.voidedAt);
        return latest?renderFeeReceipt({schoolName,receiptNumber:latest.receiptNumber,date:latest.date,student:{id:student?.studentId||'',name:nameOf,className:selectedClass?.name||'',parentName:student?.fatherName||''},items:feeItems,currency:'ETB',receivedBy:receiptReceivedBy}):'';
      }
      case 'class_timetable':{
        const periods=[...new Set(timetable.map(slot=>slot.periodNumber))].sort((a,b)=>a-b).map(period=>{const slot=timetable.find(item=>item.periodNumber===period);return {label:String(period),start:slot?.startTime||'',end:slot?.endTime||''};});
        return renderClassTimetable({schoolName,className:selectedClass?.name||'',days:DAYS,periods,cells:slotsByDay});
      }
      case 'class_list':
        return renderClassList({schoolName,className:selectedClass?.name||'',students:students.map(item=>({id:item.studentId,name:studentName(item),gender:item.gender==='male'?'Lab':'Dhedig',parentPhone:item.fatherPhone})),rowsPerPage:config.rowsPerPage}).join('<div style="break-after:page;page-break-after:always"></div>');
      default:return '';
    }
  },[kind,selectedStudent,students,subjects,term1Marks,term2Marks,examSemester,attendance,timetable,payments,selectedClass,schoolName,examTitle,year,month,config,certificateBody,certificateDate,recipient,letterSubject,letterBody,name,gradingScale,calendar,reportComment,certificateRankOrTotal,certificateSignatories,reportSignatories,receiptReceivedBy,feeItems]);

  const cycleAttendance=(studentId:string,date:string)=>{
    setAttendance(current=>{
      const existing=current.find(item=>item.studentId===studentId&&item.date===date);
      const nextStatus:AttendanceEntry['status']=!existing||existing.status===''?'J':existing.status==='J'?'M':'';
      if(existing?.status&&nextStatus==='')setMessage('Unmarking wuxuu ka dhigaa unmarked gudaha xaashidan; API-ga hadda jira ma tirtirayo diiwaankii hore.');
      const next=current.filter(item=>!(item.studentId===studentId&&item.date===date));
      return [...next,{studentId,date,status:nextStatus}];
    });
    setAttendanceDirtyDates(current=>current.includes(date)?current:[...current,date]);
  };

  const saveAttendance=async()=>{
    if(!canSaveAttendance||!classId){setMessage('Kaliya Form Teacher-ka fasalka ayaa kaydin kara xaadirinta.');return;}
    const changed=attendanceDirtyDates;
    if(!changed.length){setMessage('Ma jiraan isbeddello xaadirin ah oo la kaydinayo.');return;}
    const ready=changed.filter(date=>students.length>0&&students.every(student=>['J','M'].includes(attendance.find(item=>item.studentId===student.id&&item.date===date)?.status||'')));
    if(!ready.length){setMessage('Maalin kasta oo la kaydinayo waa in arday kasta loo calaamadeeyaa J ama M. Unmarked dates lama gudbinayo.');return;}
    setBusy(true);
    try{
      for(const date of ready){
        const records=students.map(student=>({studentId:student.id,status:attendance.find(item=>item.studentId===student.id&&item.date===date)?.status==='J'?'present':'absent'}));
        await ApiClient.recordDailyAttendance(classId,date,records);
      }
      const refreshed=await ApiClient.getAttendanceMonth(classId,year,month);
      setAttendance(refreshed);
      setAttendanceDirtyDates(current=>current.filter(date=>!ready.includes(date)));
      setMessage(ready.length===changed.length?'Xaadirinta waa la kaydiyey.':`Waxaa la kaydiyey ${ready.length} maalmood; ${changed.length-ready.length} maalmood wali xog buuxda ma laha.`);
    }catch(error){setMessage(error instanceof Error?error.message:'Kaydinta xaadirinta way fashilantay.');}
    finally{setBusy(false);}
  };

  const createDocument=async()=>{
    if(!canManageTemplates){setMessage('Macallinku wuxuu daabici karaa xaadirinta, balse ma abuuri karo dukumenti rasmi ah.');return;}
    const html=applyTemplatePresentation(buildHtml(),config,logoUrl)+(config.showQr?'':'<!--SCHOOLOS_HIDE_QR-->');
    if(!html){setMessage(kind==='fee_receipt'?'Ardaygan weli ma laha rasiid lacag-bixin.':'Xog ku filan lagama helin fasalka ama ardayga la doortay.');return;}
    setBusy(true);
    try{
      const created=await ApiClient.createDocument({title:name||TEMPLATE_OPTIONS.find(item=>item.kind===kind)?.label||'Dukumenti',documentType:documentType(kind),contentHtml:html,status:'draft',pageSize:kind==='student_id_cards'?'A4':'A4',direction:config.direction,pageMargins:10});
      onCreated(created);
    }catch(error){setMessage(error instanceof Error?error.message:'Dukumentiga lama abuuri karin.');}
    finally{setBusy(false);}
  };

  const saveAsMyTemplate=async()=>{
    if(!canManageTemplates)return;
    setBusy(true);
    try{
      const payload={type:kind,name:name.trim()||config.title,config:{...config,title:name.trim()||config.title}};
      if(editingTemplateId)await ApiClient.updateStructuredDocumentTemplate(editingTemplateId,payload);
      else await ApiClient.createStructuredDocumentTemplate(payload);
      setEditingTemplateId(null);
      await loadSavedTemplates();
      setMessage('Template-kaaga waa la kaydiyey.');
    }catch(error){setMessage(error instanceof Error?error.message:'Template-ka lama kaydin karin.');}
    finally{setBusy(false);}
  };

  const loadTemplate=(template:any)=>{
    if(!template?.config)return;
    setKind(template.type);
    setEditingTemplateId(template.id);
    setName(template.name);
    setConfig(template.config as TemplateConfig);
    setSubjects((template.config as TemplateConfig).subjects);
    setMessage('Template-ka waa la furay.');
  };

  const reset=()=>{const next=defaultConfig(kind,accentColor);setConfig(next);setName(next.title);setEditingTemplateId(null);setMessage('Dejintii caadiga ahayd waa la soo celiyey.');};
  const removeSaved=async(id:string)=>{
    if(!canManageTemplates)return;
    try{await ApiClient.deleteStructuredDocumentTemplate(id);await loadSavedTemplates();}
    catch(error){setMessage(error instanceof Error?error.message:'Template-ka lama tirtiri karin.');}
  };

  const previewHtml=()=>{
    const html=applyTemplatePresentation(buildHtml(),config,logoUrl);
    setPreview(html);
    if(!html)setMessage('Xogta template-kan weli kuma filna horudhac.');
  };

  const addSubject=()=>{const next=[...config.subjects,{id:`subject-${Date.now()}`,name:`Maaddo ${config.subjects.length+1}`,maxMark:100}].slice(0,12);updateConfig({subjects:next});setSubjects(next);};
  const updateSubject=(id:string,patch:Partial<TemplateSubject>)=>{const next=config.subjects.map(subject=>subject.id===id?{...subject,...patch}:subject);updateConfig({subjects:next});setSubjects(next);};
  const deleteSubject=(id:string)=>{const next=config.subjects.filter(subject=>subject.id!==id);const safe=next.length?next:DEFAULT_SUBJECTS;updateConfig({subjects:safe});setSubjects(safe);setTerm1Marks(current=>current.filter(mark=>mark.subjectId!==id));setTerm2Marks(current=>current.filter(mark=>mark.subjectId!==id));};
  const moveSubject=(id:string,offset:-1|1)=>{
    const next=[...config.subjects];
    const index=next.findIndex(subject=>subject.id===id);
    const target=index+offset;
    if(index<0||target<0||target>=next.length)return;
    [next[index],next[target]]=[next[target],next[index]];
    updateConfig({subjects:next});setSubjects(next);
  };


  return <section className="structured-template-panel rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" dir="rtl">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><BookOpen size={20}/> Qaababka dukumentiyada A4</h2><p className="mt-1 text-xs text-slate-500">Sagaalka template waxay ka akhristaan xogta fasalka, natiijooyinka, xaadirinta, jadwalka iyo lacag-bixinta.</p></div>
      <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Xir</button>
    </div>
    {message&&<div role="status" className="mb-3 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">{message}</div>}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-slate-600">Nooca template-ka
          <select value={kind} disabled={!canManageTemplates} onChange={event=>changeKind(event.target.value as TemplateKind)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">{TEMPLATE_OPTIONS.map(item=><option key={item.kind} value={item.kind}>{item.label}</option>)}</select>
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
        {kind==='exam_result_list'&&<><label className="block text-xs font-semibold text-slate-600">Xilli-dugsiyeedka<select value={examSemester} onChange={event=>setExamSemester(event.target.value as 'Semester 1'|'Semester 2')} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="Semester 1">Semester 1</option><option value="Semester 2">Semester 2</option></select></label><label className="block text-xs font-semibold text-slate-600">Cinwaanka imtixaanka<input value={examTitle} onChange={event=>setExamTitle(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3"/></label></>}
        {kind==='certificate'&&<><label className="block text-xs font-semibold text-slate-600">Qoraalka shahaadada<textarea rows={3} value={certificateBody} onChange={event=>setCertificateBody(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2"/></label><label className="block text-xs font-semibold text-slate-600">Darajo / Wadar<input value={certificateRankOrTotal} onChange={event=>setCertificateRankOrTotal(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2"/></label><label className="block text-xs font-semibold text-slate-600">Saxiixayaasha{certificateSignatories.map((value,index)=><input key={index} value={value} onChange={event=>setCertificateSignatories(items=>items.map((item,i)=>i===index?event.target.value:item))} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2"/>)}<button type="button" onClick={()=>setCertificateSignatories(items=>[...items,'Saxiixaha'])} className="mt-1 rounded border px-2 py-1 text-xs">+ Saxiixe</button></label><label className="block text-xs font-semibold text-slate-600">Taariikh<input type="date" value={certificateDate} onChange={event=>setCertificateDate(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2"/></label></>}
        {kind==='individual_report_card'&&<><label className="block text-xs font-semibold text-slate-600">Faallada macallinka<textarea rows={2} value={reportComment} onChange={event=>setReportComment(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2"/></label>{reportSignatories.map((value,index)=><label key={index} className="block text-xs font-semibold text-slate-600">Saxiixe {index+1}<input value={value} onChange={event=>setReportSignatories(items=>items.map((item,i)=>i===index?event.target.value:item))} className="mt-1 min-h-9 w-full rounded border px-2"/></label>)}</>}
         {kind==='fee_receipt'&&<div className="space-y-2 rounded-lg border p-2"><div className="flex items-center justify-between"><strong className="text-xs">Qaybaha rasiidka</strong><button type="button" onClick={()=>setFeeItems(items=>[...items,{description:'Lacag-bixin',amount:0}])} className="rounded border px-2 py-1 text-xs">+ Ku dar</button></div>{feeItems.map((item,index)=><div key={index} className="flex gap-2"><input value={item.description} onChange={event=>setFeeItems(items=>items.map((value,i)=>i===index?{...value,description:event.target.value}:value))} className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"/><input type="number" min={0} value={item.amount} onChange={event=>setFeeItems(items=>items.map((value,i)=>i===index?{...value,amount:Math.max(0,Number(event.target.value)||0)}:value))} className="w-24 rounded border px-2 py-1 text-xs"/><button type="button" onClick={()=>setFeeItems(items=>items.filter((_,i)=>i!==index))} aria-label="Ka saar qaybta" className="text-rose-600">×</button></div>)}<label className="block text-xs">Qofka lacagta qabtay<input value={receiptReceivedBy} onChange={event=>setReceiptReceivedBy(event.target.value)} className="mt-1 min-h-9 w-full rounded border px-2"/></label><p className="text-[11px] text-slate-500">Isbeddelladani waxay saameeyaan dukumentiga oo keliya; ma beddelaan diiwaanka lacag-bixinta.</p></div>}
         {kind==='official_letter'&&<><label className="block text-xs font-semibold text-slate-600">Ku<input value={recipient} onChange={event=>setRecipient(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3"/></label><label className="block text-xs font-semibold text-slate-600">Ujeeddo<input value={letterSubject} onChange={event=>setLetterSubject(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3"/></label><label className="block text-xs font-semibold text-slate-600">Qoraalka<textarea rows={4} value={letterBody} onChange={event=>setLetterBody(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2"/></label></>}
        <details className="rounded-xl border border-slate-200 p-3">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700"><ChevronDown size={16}/> Dejinta naqshadda</summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs">Jihada<select value={config.direction} onChange={event=>updateConfig({direction:event.target.value as 'ltr'|'rtl'})} className="mt-1 h-9 w-full rounded border px-2"><option value="rtl">Midig ilaa bidix</option><option value="ltr">Bidix ilaa midig</option></select></label>
            <label className="text-xs">Midabka<input type="color" value={config.accentColor} onChange={event=>updateConfig({accentColor:event.target.value})} className="mt-1 h-9 w-full rounded border"/></label>
            <label className="text-xs">Safafka bogga<input type="number" min={5} max={25} value={config.rowsPerPage} onChange={event=>updateConfig({rowsPerPage:Math.max(5,Math.min(25,Number(event.target.value)||20))})} className="mt-1 min-h-9 w-full rounded border px-2"/></label>
            <label className="text-xs">Habka gudbidda<select value={config.passRule.mode} onChange={event=>updateConfig({passRule:event.target.value==='fixed'?{mode:'fixed',fixedTotal:config.passRule.fixedTotal??280}:event.target.value==='average'?{mode:'average',average:config.passRule.average??40}:{mode:'percent',percent:config.passRule.percent??40}})} className="mt-1 min-h-9 w-full rounded border px-2"><option value="percent">Boqolley (%)</option><option value="average">Celcelis (%)</option><option value="fixed">Wadar go’an</option></select></label>
            {config.passRule.mode==='fixed'?<label className="text-xs">Wadarta go’an<input type="number" min={0} value={config.passRule.fixedTotal??280} onChange={event=>updateConfig({passRule:{mode:'fixed',fixedTotal:Math.max(0,Number(event.target.value)||0)}})} className="mt-1 min-h-9 w-full rounded border px-2"/></label>:<label className="text-xs">{config.passRule.mode==='average'?'Celceliska gudbidda (%)':'Xadka gudbidda (%)'}<input type="number" min={0} max={100} value={config.passRule.mode==='average'?config.passRule.average??40:config.passRule.percent??40} onChange={event=>updateConfig({passRule:config.passRule.mode==='average'?{mode:'average',average:Math.max(0,Math.min(100,Number(event.target.value)||0))}:{mode:'percent',percent:Math.max(0,Math.min(100,Number(event.target.value)||0))}})} className="mt-1 min-h-9 w-full rounded border px-2"/></label>}
            <label className="text-xs">Cabbirka farta<input type="number" min={8} max={24} value={config.fontSize} onChange={event=>updateConfig({fontSize:Math.max(8,Math.min(24,Number(event.target.value)||11))})} className="mt-1 min-h-9 w-full rounded border px-2"/></label>
            <label className="text-xs">Dhererka safka<input type="number" min={18} max={64} value={config.rowHeight} onChange={event=>updateConfig({rowHeight:Math.max(18,Math.min(64,Number(event.target.value)||28))})} className="mt-1 min-h-9 w-full rounded border px-2"/></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">{(['showLogo','showQr','showSummary','showFooter','zebra'] as const).map(key=><label key={key} className="flex items-center gap-1"><input type="checkbox" checked={config[key]} onChange={event=>updateConfig({[key]:event.target.checked} as Partial<TemplateConfig>)}/>{({showLogo:'Logo',showQr:'QR',showSummary:'Soo koobid',showFooter:'Footer',zebra:'Safaf kala midab'})[key]}</label>)}</div>
          {(kind==='exam_result_list'||kind==='individual_report_card')&&<div className="mt-3 space-y-2"><div className="flex items-center justify-between"><strong className="text-xs">Maaddooyinka</strong><button type="button" onClick={addSubject} disabled={config.subjects.length>=12} className="rounded border px-2 py-1 text-xs disabled:opacity-40"><Plus size={12} className="inline"/> Ku dar</button></div>{config.subjects.map(subject=><div key={subject.id} className="flex gap-2"><input value={subject.name} onChange={event=>updateSubject(subject.id,{name:event.target.value})} className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"/><input type="number" min={1} max={100} value={subject.maxMark} onChange={event=>updateSubject(subject.id,{maxMark:Math.max(1,Math.min(100,Number(event.target.value)||100))})} className="w-16 rounded border px-2 py-1 text-xs"/><button type="button" onClick={()=>moveSubject(subject.id,-1)} aria-label="Kor u qaad maaddada" className="rounded px-1 text-slate-500">↑</button><button type="button" onClick={()=>moveSubject(subject.id,1)} aria-label="Hoos u dhig maaddada" className="rounded px-1 text-slate-500">↓</button><button type="button" onClick={()=>deleteSubject(subject.id)} aria-label="Tirtir maaddada" className="rounded p-1 text-rose-600"><Trash2 size={14}/></button></div>)}</div>}
        </details>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={()=>void previewHtml()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Horudhac</button>
          {canManageTemplates&&<button type="button" disabled={busy} onClick={()=>void saveAsMyTemplate()} className="inline-flex items-center gap-2 rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-50"><Save size={15}/> {editingTemplateId?'Cusboonaysii template':'Kaydi template-kayga'}</button>}
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RotateCcw size={15}/> Dib u celi</button>
          {canManageTemplates&&<button type="button" disabled={busy} onClick={()=>void createDocument()} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><FileText size={15}/> Samee dukumenti</button>}
        </div>
        {canManageTemplates&&savedTemplates.length>0&&<div className="rounded-xl border border-slate-200 p-3"><h3 className="mb-2 text-xs font-bold">Template-yadayda</h3>{savedTemplates.map(template=><div key={template.id} className="flex items-center gap-2 border-t py-2 text-xs"><button type="button" onClick={()=>loadTemplate(template)} className="min-w-0 flex-1 truncate text-left">{template.name}</button><button type="button" onClick={()=>void removeSaved(template.id)} aria-label="Tirtir template" className="text-rose-600"><Trash2 size={14}/></button></div>)}</div>}
        {kind==='attendance_sheet'&&canSaveAttendance&&<button type="button" disabled={busy||!attendanceDirtyDates.length} onClick={()=>void saveAttendance()} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Kaydi xaadirinta ({attendanceDirtyDates.length})</button>}
        {kind==='attendance_sheet'&&!canManageTemplates&&!canSaveAttendance&&<p className="text-xs text-amber-700">Fasalkan kuma tihid Form Teacher; xaadirinta waad daabici kartaa balse ma kaydin kartid.</p>}
        {userRole==='teacher'&&!classes.length&&!busy&&<p className="text-xs text-amber-700">Akoonkan looma qoondeyn fasal Form Teacher ah.</p>}
        {busy&&<p className="text-xs text-slate-500">Waa la shaqaynayaa…</p>}
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">Warqadda A4</h3><span className="text-xs text-slate-500">{students.length} arday · {subjects.length} maaddo</span>{preview&&<button type="button" onClick={()=>window.print()} className="rounded border px-2 py-1 text-xs"><Printer size={13} className="inline"/> Daabac</button>}</div>
        {kind==='attendance_sheet'&&<div className="mb-3 overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-max border-collapse text-xs"><thead><tr><th className="sticky right-0 bg-slate-100 p-2">Ardayga</th>{attendanceDays.map(day=><th key={day.date} className={`min-w-8 border p-1 ${day.isWeekend||day.isHoliday?'bg-slate-200 text-slate-500':'bg-slate-100'}`} title={day.isHoliday?'Fasax':day.isWeekend?'Maalin fasax':''}>{day.day}</th>)}</tr></thead><tbody>{students.map(student=><tr key={student.id}><th className="sticky right-0 max-w-44 truncate border bg-white p-2 text-right">{studentName(student)}</th>{attendanceDays.map(day=>{const status=attendance.find(item=>item.studentId===student.id&&item.date===day.date)?.status||'';const disabled=day.isWeekend||day.isHoliday;return <td key={day.date} className="border p-0 text-center"><button type="button" disabled={disabled} onClick={()=>cycleAttendance(student.id,day.date)} aria-label={`${studentName(student)} ${day.date}: ${status||'madhan'}`} className={`h-8 w-8 font-bold ${disabled?'bg-slate-100 text-slate-400':status==='J'?'bg-emerald-50 text-emerald-700':status==='M'?'bg-rose-50 text-rose-700':'bg-white text-slate-400'}`}>{disabled?'—':status||'·'}</button></td>})}</tr>)}</tbody></table></div>}
        {preview?<div className="structured-template-print max-h-[75vh] overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-3"><div className="mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white p-4 shadow" dangerouslySetInnerHTML={{__html:sanitizeDocumentHtml(preview)}}/></div>:<div className="flex min-h-[480px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500"><div><Printer size={28} className="mx-auto mb-2"/><p>Riix Horudhac si aad u aragto qaabka la buuxiyey.</p><p className="mt-1 text-xs">{busy?'Xogta fasalka ayaa la soo dejinayaa…':'Xogta la doortay ayaa halkan ka muuqan doonta.'}</p></div></div>}
      </div>
    </div>
  </section>;
}
