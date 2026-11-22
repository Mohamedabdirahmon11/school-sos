import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { ExamTimetablePrint, printExamTimetable } from '../common/ExamTimetablePrint.tsx';
import { Home, CalendarDays, CalendarCheck, ChartNoAxesColumn, BookOpen, Bell, MessageCircle, UserRound, Menu, Sun, Moon, Send, CheckCircle2, CircleAlert, ChevronRight, RefreshCw } from 'lucide-react';
import './student-portal-design.css';

type StudentView = 'home' | 'tt' | 'att' | 'marks' | 'hw' | 'news' | 'msg' | 'me';
const NAV: Array<{id:StudentView;label:string;icon:React.ElementType}> = [
 {id:'home',label:'Hoyga',icon:Home},{id:'tt',label:'Jadwal',icon:CalendarDays},{id:'att',label:'Imaanshaha',icon:CalendarCheck},{id:'marks',label:'Natiijo',icon:ChartNoAxesColumn},
 {id:'hw',label:'Hawlo',icon:BookOpen},{id:'news',label:'Ogeysiis',icon:Bell},{id:'msg',label:'Fariimo',icon:MessageCircle},{id:'me',label:'Profile',icon:UserRound}
];
const todayLocal = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Addis_Ababa'}).format(new Date());
const dateLabel = (v:string) => v ? new Intl.DateTimeFormat('so',{day:'numeric',month:'short',year:'numeric'}).format(new Date(v.slice(0,10)+'T12:00:00')) : '';
const percentage = (v:number) => Math.round(v)+'%';

function PortalError({error,retry}:{error:any;retry:()=>void}) {
 const status=Number(error?.status||error?.statusCode||0);
 if(status===423) return <div className="sp-state sp-warning" role="alert"><CircleAlert/><div><b>Dejinta dugsiga weli ma dhammaystirna</b><p>{error?.message||'Maamulka dugsiga waa inuu dhammaystiraa dejinta ka hor inta aan xogtan la heli karin.'}</p>{Array.isArray(error?.missing||error?.data?.missing)&&(error?.missing||error?.data?.missing).length>0&&<ul>{(error?.missing||error?.data?.missing).map((item:string,index:number)=><li key={index}>{item}</li>)}</ul>}</div><button onClick={retry}>Dib u tijaabi</button></div>;
 return <ErrorState error={error} onRetry={retry}/>;
}

export const StudentPortalView:React.FC=()=>{
 const {user,school,t}=useAuth();
 const [view,setView]=useState<StudentView>('home');
 const [moreOpen,setMoreOpen]=useState(false);
 const [theme,setTheme]=useState<'auto'|'light'|'dark'>('auto');
 const [homeworkFilter,setHomeworkFilter]=useState<'pending'|'submitted'|'all'>('pending');
 const [noticePage,setNoticePage]=useState(1);
 const [messagePage,setMessagePage]=useState(1);
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const [submittingId,setSubmittingId]=useState<string|null>(null);
 const [feedback,setFeedback]=useState('');
 const [contactId,setContactId]=useState('');
 const [messageDraft,setMessageDraft]=useState('');
 const [sending,setSending]=useState(false);

 const profileState=useApi(()=>ApiClient.getStudentProfile(),[school?.id,user?.id],Boolean(school&&user?.role==='student'));
 const profile:any=profileState.data;
 const student=profile?.student;
 const studentRecord=student&&profile?{...student,classId:profile.classId}:undefined;
 const active=Boolean(student?.id);
 const home=view==='home';
 const timetableState=useApi(()=>ApiClient.getTimetable(profile?.classId?{classId:profile.classId}:undefined),[school?.id,user?.id,profile?.classId],active&&(home||view==='tt'));
 const examSchedulesState=useApi(()=>studentRecord?.classId?ApiClient.getPublishedExamSchedules(studentRecord.classId):Promise.resolve([]),[studentRecord?.classId,school?.id],active&&Boolean(studentRecord?.classId)&&(home||view==='tt'));
 const attendanceState=useApi(()=>ApiClient.getStudentAttendance(student.id),[school?.id,student?.id],active&&(home||view==='att'));
 const marksState=useApi(()=>ApiClient.getStudentMarks(student.id),[school?.id,student?.id],active&&(home||view==='marks'));
 const homeworkState=useApi(()=>ApiClient.getAssignments(),[school?.id,user?.id],active&&(home||view==='hw'));
 const noticesState=useApi(()=>ApiClient.getStudentNotices({page:noticePage,pageSize:20}),[school?.id,user?.id,noticePage],active&&(home||view==='news'));
 const unreadState=useApi(()=>ApiClient.getNoticeUnreadCount(),[school?.id,user?.id],active);
 const contactsState=useApi(()=>ApiClient.getMessageContacts(),[school?.id,user?.id],active&&view==='msg');
 const contacts=Array.isArray(contactsState.data)?contactsState.data:[];
 const contact=contacts.find((item:any)=>item.id===contactId);
 const messagesState=useApi(()=>contactId?ApiClient.getMessages({page:messagePage,pageSize:50,contactId}):Promise.resolve([]),[school?.id,user?.id,contactId,messagePage],active&&view==='msg'&&Boolean(contactId));

 useEffect(()=>{if(!contactId&&contacts.length)setContactId(contacts[0].id);else if(contactId&&!contacts.some((item:any)=>item.id===contactId))setContactId(contacts[0]?.id||'');},[contacts,contactId]);
 useEffect(()=>{setMessagePage(1);},[contactId]);
 useEffect(()=>{if(view==='msg'&&contactId)void ApiClient.markMessagesRead(contactId).catch(()=>undefined);},[view,contactId]);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState!=='visible')return;if(view==='home'){timetableState.retry();attendanceState.retry();marksState.retry();homeworkState.retry();noticesState.retry();unreadState.retry();}else if(view==='tt')timetableState.retry();else if(view==='att')attendanceState.retry();else if(view==='marks')marksState.retry();else if(view==='hw')homeworkState.retry();else if(view==='news'){noticesState.retry();unreadState.retry();}else if(view==='msg')contactsState.retry();else profileState.retry();};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[view,student?.id,profile?.classId]);

 const timetable=Array.isArray(timetableState.data)?timetableState.data:[];
 const publishedExamSchedules=Array.isArray(examSchedulesState.data)?examSchedulesState.data:[];
 const attendance=Array.isArray(attendanceState.data)?attendanceState.data:[];
 const marks=Array.isArray(marksState.data)?marksState.data.filter((m:any)=>Boolean(m.publishedAt)):[];
 const homework=Array.isArray(homeworkState.data)?homeworkState.data:[];
 const notices=Array.isArray(noticesState.data)?noticesState.data:Array.isArray((noticesState.data as any)?.items)?(noticesState.data as any).items:[];
 const noticePagination=(noticesState.data as any)?.pagination||{page:noticePage,totalPages:1};
 const messageRows=Array.isArray(messagesState.data)?messagesState.data:[];
 const messagePagination=(messagesState.data as any)?.pagination||{page:messagePage,totalPages:1};
 const unread=Number(unreadState.data?.count||0);
 const pending=homework.filter((h:any)=>!h.submission).length;
 const submitted=homework.filter((h:any)=>Boolean(h.submission)).length;
 const today=todayLocal();
 const month=today.slice(0,7);
 const monthRows=attendance.filter((r:any)=>String(r.date).startsWith(month));
 const counts=useMemo(()=>monthRows.reduce((a:any,r:any)=>{if(r.status in a)a[r.status]++;return a;},{present:0,absent:0,late:0,excused:0}),[attendance,month]);
 const avg=marks.length?marks.reduce((s:number,m:any)=>s+Number(m.percentage||0),0)/marks.length:0;
 const monthPresent=monthRows.filter((r:any)=>r.status==='present').length;
 const todayDay=new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'Africa/Addis_Ababa'}).format(new Date());
 const todaySlots=timetable.filter((s:any)=>s.dayOfWeek===todayDay).sort((a:any,b:any)=>a.periodNumber-b.periodNumber);
 const monthDays=new Date(Number(today.slice(0,4)),Number(today.slice(5,7)),0).getDate();
 const firstDay=new Date(month+'-01T12:00:00').getDay();
 const attendanceByDate=new Map(attendance.map((r:any)=>[String(r.date).slice(0,10),r.status]));
 const visibleHomework=homework.filter((h:any)=>homeworkFilter==='all'||(homeworkFilter==='submitted'?Boolean(h.submission):!h.submission)).sort((a:any,b:any)=>String(a.dueDate).localeCompare(String(b.dueDate)));

 const submitHomework=async(id:string)=>{const content=(drafts[id]||'').trim();if(!content){setFeedback('Fadlan qor jawaabta ka hor gudbinta.');return;}setSubmittingId(id);setFeedback('');try{await ApiClient.submitAssignment(id,content);setFeedback('Hawsha si guul leh ayaa loo gudbiyey.');homeworkState.retry();}catch(e){setFeedback(e instanceof Error?e.message:'Hawsha lama gudbin karin.');}finally{setSubmittingId(null);}};
 const sendMessage=async()=>{const content=messageDraft.trim();if(!content||!contact)return;setSending(true);try{await ApiClient.sendMessage(contact.id,contact.fullName,contact.role,content);setMessageDraft('');setMessagePage(1);messagesState.retry();}catch(e){setFeedback(e instanceof Error?e.message:'Fariinta lama diri karin.');}finally{setSending(false);}};
 const markRead=async(id:string)=>{try{await ApiClient.markNoticeRead(id);noticesState.retry();unreadState.retry();}catch(e){setFeedback(e instanceof Error?e.message:'Ogeysiiska lama calaamadin karin.');}};
 const navButton=(item:typeof NAV[number],mobile=false)=>{const Icon=item.icon;const selected=view===item.id;const badge=item.id==='hw'?pending:item.id==='news'?unread:0;return <button key={item.id} type="button" className={'sp-nav-item '+(selected?'is-active ':'')+(mobile?'is-mobile':'')} onClick={()=>{setView(item.id);setMoreOpen(false);setFeedback('');if(item.id==='home'){timetableState.retry();attendanceState.retry();marksState.retry();homeworkState.retry();noticesState.retry();unreadState.retry();}else if(item.id==='tt')timetableState.retry();else if(item.id==='att')attendanceState.retry();else if(item.id==='marks')marksState.retry();else if(item.id==='hw')homeworkState.retry();else if(item.id==='news'){setNoticePage(1);noticesState.retry();unreadState.retry();}else if(item.id==='msg')contactsState.retry();else if(item.id==='me')profileState.retry();}} aria-current={selected?'page':undefined}><Icon size={18}/><span>{item.label}</span>{badge>0&&<i className="sp-badge">{badge>99?'99+':badge}</i>}</button>;};
 const title=NAV.find(n=>n.id===view)?.label||'Hoyga';
 if(school&&school.studentAccessEnabled===false)return <div className="sp-disabled"><CircleAlert size={42}/><h2>Student Portal waa xiran yahay</h2><p>{t('student_access_disabled')}</p></div>;

 return <div className={'student-portal-shell '+(theme==='auto'?'':'sp-theme-'+theme)} data-theme={theme}>
  <aside className="sp-sidebar">
   <div className="sp-brand"><div className="sp-avatar">{String(user?.fullName||'A').trim().slice(0,1).toUpperCase()}</div><div><b>{user?.fullName}</b><small>{profile?.className||'Fasalka lama qoondeyn'}</small><small>ID: {student?.studentId||user?.studentId||'—'}</small></div></div>
   <nav aria-label="Qaybaha ardayga" className="sp-side-nav">{NAV.map(n=>navButton(n))}</nav>
   <div className="sp-sidebar-foot"><span>SchoolOS</span><small>{school?.name}</small></div>
  </aside>
  <div className="sp-content"><main className="sp-main">
   <header className="sp-page-head"><div><span className="sp-eyebrow">STUDENT PORTAL</span><h1>{view==='home'?'Soo dhawoow, '+(user?.fullName||'Arday')+' 👋':title}</h1><p>{view==='home'?new Intl.DateTimeFormat('so',{weekday:'long',day:'numeric',month:'long'}).format(new Date())+' · '+(school?.name||''):((profile?.className||'')+' · '+(profile?.academicYear||school?.academicYear||''))}</p></div><div className="sp-head-actions"><span className="sp-school-mark">{school?.name}</span><button type="button" className="sp-icon-button" onClick={()=>{profileState.retry();timetableState.retry();attendanceState.retry();marksState.retry();homeworkState.retry();noticesState.retry();unreadState.retry();contactsState.retry();}} aria-label="Cusboonaysii"><RefreshCw size={17}/></button></div></header>
   {feedback&&<div className="sp-feedback" role="status">{feedback}</div>}
   {profileState.loading&&<div className="sp-card sp-empty">Xogta ardayga waa la soo dejinayaa…</div>}
   {profileState.error&&<PortalError error={profileState.error} retry={profileState.retry}/>}
   {!profileState.loading&&!profileState.error&&!student&&<div className="sp-state sp-warning"><CircleAlert/><div><b>Koontada ardayga lama xirin</b><p>La xiriir maamulka dugsiga si user-ka loogu xiro diiwaanka ardayga.</p></div></div>}

   {active&&view==='home'&&<>
    <section className="sp-stat-grid">
     <div className="sp-card"><span className="sp-muted">Imaanshaha bishan</span><strong>{attendanceState.loading||attendanceState.error?'—':percentage(monthRows.length?monthPresent/monthRows.length*100:0)}</strong><div className="sp-progress"><i style={{width:(monthRows.length?monthPresent/monthRows.length*100:0)+'%'}}/></div></div>
     <div className="sp-card"><span className="sp-muted">Celceliska natiijooyinka</span><strong>{marksState.loading?'—':marks.length?percentage(avg):'—'}</strong><small>{marksState.error?'Natiijooyinka lama soo dejin karin':marks.length?marks.length+' maaddo oo Published ah':'Weli lama daabicin'}</small></div>
     <div className="sp-card"><span className="sp-muted">Hawlo harsan</span><strong>{homeworkState.loading||homeworkState.error?'—':pending}</strong><button className="sp-text-button" onClick={()=>{setView('hw');homeworkState.retry();}}>Fur hawlaha <ChevronRight size={14}/></button></div>
    </section>
    <section className="sp-card"><div className="sp-section-title"><h2>Jadwalka maanta</h2><button className="sp-text-button" onClick={()=>{setView('tt');timetableState.retry();}}>Jadwalka oo dhan <ChevronRight size={14}/></button></div>{timetableState.loading?<div className="sp-empty">Jadwalka waa la soo dejinayaa…</div>:timetableState.error?<PortalError error={timetableState.error} retry={timetableState.retry}/>:todayDay==='Friday'?<div className="sp-empty">Maanta waa Jimce; dugsigu waa fasax.</div>:!todaySlots.length?<div className="sp-empty">Casharro maanta lama qorin.</div>:todaySlots.map((s:any)=><div className="sp-row" key={s.id}><span><b>{s.startTime} – {s.endTime} · {s.subjectName||s.subjectId}</b><small>{s.teacherName||'Macallin'}</small></span><em>Period {s.periodNumber}</em></div>)}</section>
    <section className="sp-card"><div className="sp-section-title"><h2>Ogeysiisyadii ugu dambeeyey</h2><button className="sp-text-button" onClick={()=>{setView('news');setNoticePage(1);noticesState.retry();unreadState.retry();}}>Dhammaan <ChevronRight size={14}/></button></div>{noticesState.loading?<div className="sp-empty">Ogeysiisyada waa la soo dejinayaa…</div>:noticesState.error?<PortalError error={noticesState.error} retry={noticesState.retry}/>:notices.length?notices.slice(0,2).map((n:any)=><div className="sp-row" key={n.id}><span><b>{n.title}</b><small>{dateLabel(n.publishDate)}</small></span>{!n.isRead&&<em className="sp-new">Cusub</em>}</div>):<div className="sp-empty">Ogeysiis cusub ma jiro.</div>}</section>
   </>}

   {active&&view==='tt'&&<section className="sp-card"><div className="sp-section-title"><h2>Jadwalka fasalka</h2><span className="sp-muted">Sabti – Khamiis · Jimce fasax</span></div>{timetableState.loading?<div className="sp-empty">Jadwalka waa la soo dejinayaa…</div>:timetableState.error?<PortalError error={timetableState.error} retry={timetableState.retry}/>:!timetable.length?<div className="sp-empty">Jadwal lama diiwaangelin fasalkaaga.</div>:<div className="sp-table-wrap"><table className="sp-table"><thead><tr><th>Waqti</th>{['Sabti','Axad','Isniin','Talaado','Arbaco','Khamiis'].map(d=><th key={d}>{d}</th>)}</tr></thead><tbody>{Array.from({length:Math.max(1,...timetable.map((s:any)=>Number(s.periodNumber||1)))},(_,i)=>i+1).map(p=><tr key={p}><td>Period {p}</td>{['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday'].map(d=>{const s=timetable.find((x:any)=>x.dayOfWeek===d&&Number(x.periodNumber)===p);return <td key={d}>{s?<><b>{s.subjectName||s.subjectId}</b><small>{s.startTime}–{s.endTime}</small><small>{s.teacherName||''}</small></>:'—'}</td>;})}</tr>)}</tbody></table></div>}</section>}
   {active&&view==='tt'&&<section className="sp-card"><div className="sp-section-title"><h2>Published Exam Schedule · Jadwalka imtixaanka</h2>{publishedExamSchedules.length>0&&<button className="sp-text-button" onClick={()=>printExamTimetable()}>Daabac jadwalka</button>}</div>{examSchedulesState.loading?<div className="sp-empty">Jadwalka imtixaanka waa la soo dejinayaa…</div>:examSchedulesState.error?<PortalError error={examSchedulesState.error} retry={examSchedulesState.retry}/>:publishedExamSchedules.length>0?<ExamTimetablePrint schedules={publishedExamSchedules} school={school}/>:<div className="sp-empty">Weli lama daabicin jadwalka imtixaanka.</div>}</section>}

   {active&&view==='att'&&<section className="sp-card"><div className="sp-section-title"><h2>Imaanshaha ardayga</h2><span className="sp-muted">{new Intl.DateTimeFormat('so',{month:'long',year:'numeric'}).format(new Date())}</span></div>{attendanceState.loading?<div className="sp-empty">Diiwaanka imaanshaha waa la soo dejinayaa…</div>:attendanceState.error?<PortalError error={attendanceState.error} retry={attendanceState.retry}/>:<><div className="sp-stat-grid sp-att-stats"><div><small>Joogay</small><b>{counts.present}</b></div><div><small>Maqnaa</small><b>{counts.absent}</b></div><div><small>Daahay</small><b>{counts.late}</b></div><div><small>Boqolkiiba</small><b>{percentage(attendance.length?counts.present/attendance.length*100:0)}</b></div></div><div className="sp-calendar">{['Ax','Is','Ta','Ar','Kh','Jim','Sab'].map(d=><b key={d}>{d}</b>)}{Array.from({length:firstDay},(_,i)=><i key={'blank'+i}/>)}{Array.from({length:monthDays},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0');const status=attendanceByDate.get(date);return <span key={date} className={'sp-day '+(status==='present'?'is-present':status==='absent'?'is-absent':status==='late'?'is-late':status==='excused'?'is-excused':'')}>{i+1}</span>;})}</div><p className="sp-muted">Cagaar = joogay · Casaan = maqnaa · Huruud = daahay · Buluug = fasax la oggolaaday</p></>}</section>}

   {active&&view==='marks'&&<section className="sp-card"><div className="sp-section-title"><h2>Natiijooyinka la daabacay</h2><span className="sp-muted">Published oo keliya</span></div>{marksState.loading?<div className="sp-empty">Natiijooyinka waa la soo dejinayaa…</div>:marksState.error?<PortalError error={marksState.error} retry={marksState.retry}/>:!marks.length?<div className="sp-empty">Weli lama daabicin natiijooyinkaaga.</div>:<div className="sp-table-wrap"><table className="sp-table"><thead><tr><th>Maaddo</th><th>Semester</th><th>Wadar</th><th>Boqolkiiba</th><th>Darajo</th></tr></thead><tbody>{marks.map((m:any)=><tr key={m.id}><td><b>{m.subjectName||m.subjectId}</b></td><td>{m.semester}</td><td>{m.totalMarks}</td><td>{percentage(Number(m.percentage||0))}</td><td>{m.grade||m.gradeLabel||'—'}</td></tr>)}</tbody></table></div>}</section>}

   {active&&view==='hw'&&<div className="sp-homework"><div className="sp-filter-tabs">{(['pending','submitted','all'] as const).map(f=><button key={f} className={homeworkFilter===f?'is-selected':''} onClick={()=>setHomeworkFilter(f)}>{f==='pending'?'Harsan ('+pending+')':f==='submitted'?'La gudbiyey ('+submitted+')':'Dhammaan'}</button>)}</div>{homeworkState.loading?<div className="sp-card sp-empty">Hawlaha waa la soo dejinayaa…</div>:homeworkState.error?<PortalError error={homeworkState.error} retry={homeworkState.retry}/>:!visibleHomework.length?<div className="sp-card sp-empty">Hawl halkan kuma jirto.</div>:visibleHomework.map((h:any)=>{const sub=h.submission;const late=!sub&&h.dueDate<today;const draft=drafts[h.id]??sub?.content??'';return <section className="sp-card sp-homework-card" key={h.id}><div className="sp-section-title"><div><b>{h.subjectName||h.subjectId}</b><h3>{h.title}</h3></div><em className={late?'sp-overdue':sub?'sp-done':'sp-due'}>{late?'Dhaafay':sub?'La gudbiyey':'Dhammaad '+dateLabel(h.dueDate)}</em></div><p>{h.description}</p>{sub?<div className="sp-submission"><b><CheckCircle2 size={15}/> {sub.status==='graded'?'La qiimeeyey':'La gudbiyey'}</b><p>{sub.content}</p>{sub.grade!==undefined&&<small>Darajo: {sub.grade}/{h.maxPoints}</small>}{sub.feedback&&<small>{sub.feedback}</small>}</div>:<><textarea value={draft} onChange={e=>setDrafts(s=>({...s,[h.id]:e.target.value}))} rows={3} maxLength={5000} placeholder="Qor jawaabtaada…"/><button className="sp-primary-button" disabled={submittingId===h.id||!draft.trim()} onClick={()=>submitHomework(h.id)}>{submittingId===h.id?'Waa la dirayaa…':'Gudbi hawsha'}</button></>}</section>;})}</div>}

   {active&&view==='news'&&<div className="sp-news-list">{noticesState.loading?<div className="sp-card sp-empty">Ogeysiisyada waa la soo dejinayaa…</div>:noticesState.error?<PortalError error={noticesState.error} retry={noticesState.retry}/>:!notices.length?<div className="sp-card sp-empty">Ogeysiis cusub ma jiro.</div>:<>{notices.map((n:any)=><section className="sp-card" key={n.id}><div className="sp-section-title"><h3>{n.title}</h3><span className="sp-muted">{dateLabel(n.publishDate)}</span></div><p className="sp-notice-body">{n.content}</p><div className="sp-row"><small>{n.authorName||'Maamulka dugsiga'}</small>{n.isRead?<em className="sp-done">La akhriyey</em>:<button className="sp-text-button" onClick={()=>markRead(n.id)}>Calaamadi akhriyey</button>}</div></section>)}{noticePagination.totalPages>1&&<div className="sp-pagination"><button disabled={noticePage<=1} onClick={()=>setNoticePage(page=>Math.max(1,page-1))}>Hore</button><span>{noticePagination.page||noticePage} / {noticePagination.totalPages}</span><button disabled={noticePage>=noticePagination.totalPages} onClick={()=>setNoticePage(page=>Math.min(noticePagination.totalPages,page+1))}>Xiga</button></div>}</>}</div>}

   {active&&view==='msg'&&<section className="sp-card sp-messages"><div className="sp-section-title"><h2>Macallimiinta fasalkaaga</h2><span className="sp-muted">Kuwa laguu qoondeeyey oo keliya</span></div>{contactsState.loading?<div className="sp-empty">Macallimiinta waa la soo dejinayaa…</div>:contactsState.error?<PortalError error={contactsState.error} retry={contactsState.retry}/>:!contacts.length?<div className="sp-empty">Weli macallin laguma xirin fasalkaaga.</div>:<div className="sp-message-layout"><nav className="sp-contact-list" aria-label="Macallimiinta">{contacts.map((c:any)=><button key={c.id} className={contactId===c.id?'is-selected':''} onClick={()=>setContactId(c.id)}>{c.fullName}<small>Macallin</small></button>)}</nav><div className="sp-thread"><b>{contact?.fullName||'Macallin'}</b>{messagesState.loading?<div className="sp-empty">Fariimaha waa la soo dejinayaa…</div>:messagesState.error?<PortalError error={messagesState.error} retry={messagesState.retry}/>:<><div className="sp-chat-log">{messageRows.length?messageRows.map((m:any)=><div key={m.id} className={'sp-chat-bubble '+(m.senderId===user?.id?'mine':'')}>{m.content}<small>{dateLabel(String(m.timestamp||'').slice(0,10))}</small></div>):<div className="sp-empty">Wada-hadal ma jiro. Fariintaada koowaad dir.</div>}</div>{messagePagination.totalPages>1&&<div className="sp-pagination"><button disabled={messagePage<=1} onClick={()=>setMessagePage(page=>Math.max(1,page-1))}>Hore</button><span>{messagePagination.page||messagePage} / {messagePagination.totalPages}</span><button disabled={messagePage>=messagePagination.totalPages} onClick={()=>setMessagePage(page=>Math.min(messagePagination.totalPages,page+1))}>Xiga</button></div>}</>}<div className="sp-compose"><input value={messageDraft} onChange={e=>setMessageDraft(e.target.value)} maxLength={5000} placeholder="Qor fariin…"/><button aria-label="Dir fariinta" disabled={!messageDraft.trim()||sending||!contact} onClick={sendMessage}><Send size={17}/></button></div></div></div>}</section>}

   {active&&view==='me'&&<div className="sp-profile"><section className="sp-card">{[['Magac',user?.fullName],['Aqoonsiga ardayga',student?.studentId],['Fasal',profile?.className],['Form Teacher',profile?.formTeacherName||'Lama qoondeyn'],['Sanad dugsiyeed',profile?.academicYear||school?.academicYear],['Dugsiga',school?.name]].map(([label,value])=><div className="sp-row" key={String(label)}><span className="sp-muted">{label}</span><b>{value||'—'}</b></div>)}</section><section className="sp-card"><h2>Muuqaalka</h2><div className="sp-theme-options">{(['auto','light','dark'] as const).map(v=><button key={v} className={theme===v?'is-selected':''} onClick={()=>setTheme(v)}>{v==='auto'?'Otomaatig':v==='light'?<><Sun size={16}/> Iftiin</>:<><Moon size={16}/> Mugdi</>}</button>)}</div><p className="sp-muted">Doorashada muuqaalka waxay shaqaynaysaa inta portal-ku furan yahay.</p></section></div>}
  </main></div>
  <nav className="sp-bottom-nav" aria-label="Menu hoose">{(['home','hw','marks'] as StudentView[]).map(id=>navButton(NAV.find(n=>n.id===id)!,true))}<div className="sp-more-wrap"><button type="button" className={'sp-nav-item is-mobile '+(moreOpen||(['tt','att','news','msg','me'] as StudentView[]).includes(view)?'is-active':'')} onClick={()=>setMoreOpen(v=>!v)} aria-expanded={moreOpen}><Menu size={19}/><span>Dheeraad</span>{unread>0&&<i className="sp-badge">{unread}</i>}</button>{moreOpen&&<div className="sp-more-sheet">{(['tt','att','news','msg','me'] as StudentView[]).map(id=>navButton(NAV.find(n=>n.id===id)!,true))}</div>}</div></nav>
 </div>;
};
