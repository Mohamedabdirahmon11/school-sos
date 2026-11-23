import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { useApi } from '../../hooks/useApi.ts';
import { ErrorState } from '../common/ErrorState.tsx';
import { Home, Users, CalendarDays, CalendarCheck, ChartNoAxesColumn, BookOpen, Bell, MessageCircle, UserRound, Menu, Send, Sun, Moon, ChevronRight, RefreshCw, CircleAlert, CheckCircle2 } from 'lucide-react';
import './parent-portal-design.css';

type View = 'home'|'kids'|'tt'|'att'|'marks'|'hw'|'news'|'msg'|'me';
const NAV: Array<{id:View;label:string;icon:React.ElementType}> = [
 {id:'home',label:'Hoyga',icon:Home},{id:'kids',label:'Caruurta',icon:Users},{id:'tt',label:'Jadwal',icon:CalendarDays},
 {id:'att',label:'Imaanshaha',icon:CalendarCheck},{id:'marks',label:'Natiijo',icon:ChartNoAxesColumn},
 {id:'hw',label:'Hawlo',icon:BookOpen},{id:'news',label:'Ogeysiis',icon:Bell},{id:'msg',label:'Fariimo',icon:MessageCircle},{id:'me',label:'Profile',icon:UserRound}
];
const todayLocal=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Addis_Ababa'}).format(new Date());
const dateLabel=(v:string)=>v?new Intl.DateTimeFormat('so',{day:'numeric',month:'short',year:'numeric'}).format(new Date(v.slice(0,10)+'T12:00:00')):'';
const unwrap=(v:any)=>v?.data?.children? v.data : v?.data?.items? v.data : v?.data??v;
function PortalError({error,retry}:{error:any;retry:()=>void}){
 const status=Number(error?.status||error?.statusCode||0);
 if(status===423)return <div className="pp-state pp-warning" role="alert"><CircleAlert/><div><b>Dejinta dugsiga weli ma dhammaystirna</b><p>{error?.message||'Maamulka dugsiga waa inuu dhammaystiraa Setup Wizard-ka ka hor inta aan Parent Portal la adeegsan.'}</p>{Array.isArray(error?.missing||error?.data?.missing)&&(error?.missing||error?.data?.missing).map((x:string,i:number)=><p key={i}>• {x}</p>)}</div><button onClick={retry}>Dib u tijaabi</button></div>;
 return <ErrorState error={error} onRetry={retry}/>;
}

export const ParentPortalView:React.FC=()=>{
 const {user,school}=useAuth();
 const [view,setView]=useState<View>('home');
 const [childId,setChildId]=useState('');
 const [moreOpen,setMoreOpen]=useState(false);
 const [theme,setTheme]=useState<'auto'|'light'|'dark'>('auto');
 const [noticePage,setNoticePage]=useState(1);
 const [messagePage,setMessagePage]=useState(1);
 const [contactId,setContactId]=useState('');
 const [messageDraft,setMessageDraft]=useState('');
 const [sending,setSending]=useState(false);
 const [feedback,setFeedback]=useState('');
 const [homeworkFilter,setHomeworkFilter]=useState<'pending'|'submitted'|'all'>('pending');

 const childrenState=useApi(()=>ApiClient.request<any>('/parent/children'),[school?.id,user?.id],Boolean(school&&user?.role==='parent'));
 const payload=unwrap(childrenState.data);
 const parent=payload?.parent;
 const children:any[]=Array.isArray(payload?.children)?payload.children:[];
 const child=children.find(x=>x.id===childId)||children[0];
 const active=Boolean(child?.id);
 useEffect(()=>{if(children.length&&!children.some(x=>x.id===childId))setChildId(children[0].id);},[children,childId]);

 const home=view==='home';
 const attendanceState=useApi(()=>child?ApiClient.getStudentAttendance(child.id):Promise.resolve([]),[school?.id,child?.id],active&&(home||view==='att'||view==='kids'));
 const marksState=useApi(()=>child?ApiClient.getStudentMarks(child.id):Promise.resolve([]),[school?.id,child?.id],active&&(home||view==='marks'||view==='kids'));
 const timetableState=useApi(()=>child?.classId?ApiClient.getTimetable({classId:child.classId}):Promise.resolve([]),[school?.id,child?.classId],active&&(home||view==='tt'));
 const homeworkState=useApi(()=>child?ApiClient.request<any[]>(`/assignments?studentId=${encodeURIComponent(child.id)}`):Promise.resolve([]),[school?.id,child?.id],active&&(home||view==='hw'));
 const noticesState=useApi(()=>ApiClient.request<any>(`/parent/notices?page=${noticePage}&pageSize=20`),[school?.id,user?.id,noticePage],Boolean(user&&['home','news'].includes(view)));
 const contactsState=useApi(()=>ApiClient.getMessageContacts(),[school?.id,user?.id],Boolean(user&&view==='msg'));
 const contacts=Array.isArray(contactsState.data)?contactsState.data:[];
 const contact=contacts.find((x:any)=>x.id===contactId);
 const messagesState=useApi(()=>contactId?ApiClient.getMessages({page:messagePage,pageSize:50,contactId}):Promise.resolve([]),[school?.id,user?.id,contactId,messagePage],Boolean(user&&view==='msg'&&contactId));
 useEffect(()=>{if(!contactId&&contacts.length)setContactId(contacts[0].id);else if(contactId&&!contacts.some((x:any)=>x.id===contactId))setContactId(contacts[0]?.id||'');},[contacts,contactId]);
 useEffect(()=>{setMessagePage(1);},[contactId]);
 useEffect(()=>{if(view==='msg'&&contactId)void ApiClient.markMessagesRead(contactId).catch(()=>undefined);},[view,contactId]);
 const refresh=()=>{childrenState.retry();attendanceState.retry();marksState.retry();timetableState.retry();homeworkState.retry();noticesState.retry();contactsState.retry();if(contactId)messagesState.retry();};
 useEffect(()=>{const onFocus=()=>{if(document.visibilityState==='visible')refresh();};window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);return()=>{window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};},[view,child?.id,contactId]);

 const attendance=Array.isArray(attendanceState.data)?attendanceState.data:[];
 const marks=Array.isArray(marksState.data)?marksState.data.filter((m:any)=>Boolean(m.publishedAt)):[];
 const timetable=Array.isArray(timetableState.data)?timetableState.data:[];
 const homework=Array.isArray(homeworkState.data)?homeworkState.data:[];
 const noticeData=unwrap(noticesState.data);
 const notices=Array.isArray(noticeData?.items)?noticeData.items:[];
 const noticePagination=noticeData?.pagination||{page:noticePage,totalPages:1};
 const messages=Array.isArray(messagesState.data)?messagesState.data:[];
 const today=todayLocal(),month=today.slice(0,7);
 const monthRows=attendance.filter((r:any)=>String(r.date||'').slice(0,7)===month);
 const counts=useMemo(()=>monthRows.reduce((a:any,r:any)=>{if(r.status==='present')a.present++;else if(r.status==='absent')a.absent++;else if(r.status==='late')a.late++;return a;},{present:0,absent:0,late:0}),[attendance,month]);
 const scoreTotal=marks.reduce((s:number,m:any)=>s+Number(m.totalMarks||0),0);
 const scoreMax=marks.reduce((s:number,m:any)=>s+(Array.isArray(m.schemeSnapshot)?m.schemeSnapshot.reduce((n:number,c:any)=>n+Number(c.maxMarks||0),0):0),0);
 const pending=homework.filter((h:any)=>!h.submission).length;
 const submitted=homework.length-pending;
 const todayDay=new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'Africa/Addis_Ababa'}).format(new Date());
 const todaySlots=timetable.filter((s:any)=>s.dayOfWeek===todayDay).sort((a:any,b:any)=>Number(a.periodNumber)-Number(b.periodNumber));
 const attendanceByDate=new Map(attendance.map((r:any)=>[String(r.date).slice(0,10),r.status]));
 const monthDays=new Date(Number(today.slice(0,4)),Number(today.slice(5,7)),0).getDate();
 const firstDay=new Date(month+'-01T12:00:00').getDay();
 const visibleHomework=homework.filter((h:any)=>homeworkFilter==='all'||(homeworkFilter==='submitted'?Boolean(h.submission):!h.submission)).sort((a:any,b:any)=>String(a.dueDate).localeCompare(String(b.dueDate)));
 const initials=(name:string)=>String(name||'W').trim().split(/\s+/).slice(0,2).map((x:string)=>x[0]).join('').toUpperCase();
 const go=(next:View)=>{setView(next);setMoreOpen(false);setFeedback('');if(next==='news')setNoticePage(1);};
 const markRead=async(id:string)=>{try{await ApiClient.markNoticeRead(id);noticesState.retry();}catch(e){setFeedback(e instanceof Error?e.message:'Ogeysiiska lama calaamadin karin.');}};
 const send=async()=>{const body=messageDraft.trim();if(!body||!contact)return;setSending(true);setFeedback('');try{await ApiClient.sendMessage(contact.id,contact.fullName,contact.role,body);setMessageDraft('');setMessagePage(1);messagesState.retry();}catch(e){setFeedback(e instanceof Error?e.message:'Fariinta lama diri karin.');}finally{setSending(false);}};
 const navButton=(item:typeof NAV[number],mobile=false)=>{const Icon=item.icon;const selected=view===item.id;const badge=item.id==='hw'?pending:item.id==='news'?notices.filter((n:any)=>!n.isRead).length:0;return <button key={item.id} type="button" className={'pp-nav-item '+(selected?'is-active ':'')+(mobile?'is-mobile':'')} onClick={()=>go(item.id)} aria-current={selected?'page':undefined}><Icon size={mobile?19:17}/><span>{item.label}</span>{badge>0&&<i className="pp-badge">{badge>99?'99+':badge}</i>}</button>;};
 const moreItems=NAV.filter(x=>['tt','att','hw','news','msg','me'].includes(x.id));
 const moreActive=moreItems.some(x=>x.id===view);
 const loading=childrenState.loading;
 const title=NAV.find(x=>x.id===view)?.label||'Hoyga';
 const gradeText=(m:any)=>{const raw=String(m.grade||'—');const letter=raw.match(/A\+?|B|C|D|F/)?.[0];const labels:Record<string,string>={'A+':'Aad u wanaagsan','A':'Wanaagsan','B':'Fiican','C':'Dhexdhexaad','D':'Hoose','F':'U baahan caawimaad'};return letter?letter+' · '+labels[letter]:raw;};

 return <div className={"parent-portal-shell "+(theme==='dark'?'pp-theme-dark':'')} data-theme={theme}>
  <aside className="pp-sidebar">
   <div className="pp-brand"><div className="pp-avatar">{initials(parent?.fullName||user?.fullName||'W')}</div><div><b>{parent?.fullName||user?.fullName||'Waalid'}</b><small>Waalid · {children.length} ilmood</small></div></div>
   {children.length>1&&<><div className="pp-kids-label">Caruurtayda</div><div className="pp-kids">{children.map((x:any)=><button key={x.id} className={'pp-child-item '+(x.id===child?.id?'is-active':'')} onClick={()=>setChildId(x.id)} aria-current={x.id===child?.id?'true':undefined}><span className="pp-child-avatar">{initials(x.fullName)}</span><span style={{minWidth:0,flex:1}}><b>{x.fullName}</b><small>{x.className}</small></span>{(x.homeworkPending||0)>0&&<i className="pp-badge">{x.homeworkPending}</i>}</button>)}</div></>}
   <nav aria-label="Qaybaha waalidka" className="pp-side-nav">{NAV.map(n=>navButton(n))}</nav>
   <div className="pp-sidebar-foot"><span>SchoolOS</span><small>{school?.name}</small></div>
  </aside>
  <div className="pp-content"><main className="pp-main">
   {children.length>1&&<div className="pp-child-strip">{children.map((x:any)=><button key={x.id} className={x.id===child?.id?'is-active':''} onClick={()=>setChildId(x.id)}>{x.firstName||x.fullName.split(' ')[0]}</button>)}</div>}
   <header className="pp-page-head"><div><span className="pp-eyebrow">PARENT PORTAL</span><h1>{view==='home'?'Soo dhawoow, '+(parent?.fullName||user?.fullName||'Waalid')+' 👋':title}</h1><p>{school?.name||''}{child?' · '+child.fullName+' · '+child.className:''}</p></div><div className="pp-head-actions"><button className="pp-icon-button" onClick={refresh} aria-label="Cusboonaysii"><RefreshCw size={17}/></button></div></header>
   {feedback&&<div className="pp-feedback" role="status">{feedback}</div>}
   {loading&&<div className="pp-card pp-empty">Xogta carruurta waa la soo dejinayaa…</div>}
   {childrenState.error&&<PortalError error={childrenState.error} retry={childrenState.retry}/>}
   {!loading&&!childrenState.error&&!children.length&&<div className="pp-state pp-warning"><CircleAlert/><div><b>Weli ilmo laguma xirin akoonkaaga</b><p>La xiriir maamulka dugsiga. Waalidka oo keliya ma xiriirin karo arday.</p></div></div>}

   {active&&view==='home'&&<>
    <section className="pp-stat-grid">
     <div className="pp-card"><span className="pp-muted">Imaanshaha bishan</span><strong>{attendanceState.loading?'—':counts.present+' / '+monthRows.length}</strong><small>{attendanceState.error?'Imaanshaha lama soo dejin karin':`Wuu yimid ${counts.present} maalmood oo ka mid ah ${monthRows.length} maalmood oo dugsigu furnaa`}</small></div>
     <div className="pp-card"><span className="pp-muted">Natiijooyinka la daabacay</span><strong>{marksState.loading?'—':scoreTotal+' / '+scoreMax}</strong><small>{marksState.error?'Natiijooyinka lama soo dejin karin':marks.length?marks.length+' diiwaan oo la daabacay':'Weli lama daabicin'}</small></div>
     <div className="pp-card"><span className="pp-muted">Hawlo harsan</span><strong>{homeworkState.loading?'—':pending}</strong><button className="pp-text-button" onClick={()=>go('hw')}>Fur hawlaha <ChevronRight size={14}/></button></div>
    </section>
    <section className="pp-card"><div className="pp-section-title"><h2>Jadwalka maanta</h2><button className="pp-text-button" onClick={()=>go('tt')}>Jadwalka oo dhan <ChevronRight size={14}/></button></div>{timetableState.loading?<div className="pp-empty">Jadwalka waa la soo dejinayaa…</div>:timetableState.error?<PortalError error={timetableState.error} retry={timetableState.retry}/>:todayDay==='Friday'?<div className="pp-empty">Jimce waa fasax.</div>:todaySlots.length?todaySlots.map((s:any)=><div className="pp-row" key={s.id}><span><b>{s.startTime} – {s.endTime} · {s.subjectName||s.subjectId}</b><small>{s.teacherName||'Macallin'}</small></span><em>Cashar {s.periodNumber}</em></div>):<div className="pp-empty">Casharro maanta lama qorin.</div>}</section>
    <section className="pp-card"><div className="pp-section-title"><h2>Ogeysiisyadii ugu dambeeyey</h2><button className="pp-text-button" onClick={()=>go('news')}>Dhammaan <ChevronRight size={14}/></button></div>{noticesState.loading?<div className="pp-empty">Ogeysiisyada waa la soo dejinayaa…</div>:noticesState.error?<PortalError error={noticesState.error} retry={noticesState.retry}/>:notices.length?notices.slice(0,2).map((n:any)=><div className="pp-row" key={n.id}><span><b>{n.title}</b><small>{dateLabel(n.publishDate)}</small></span>{!n.isRead&&<em className="pp-new">Cusub</em>}</div>):<div className="pp-empty">Ogeysiis cusub ma jiro.</div>}</section>
   </>}
   {active&&view==='kids'&&<><div className="pp-stat-grid"><div className="pp-card"><span className="pp-muted">Tirada carruurta</span><strong>{children.length}</strong></div><div className="pp-card"><span className="pp-muted">Hawlo harsan</span><strong>{children.reduce((s:number,x:any)=>s+Number(x.homeworkPending||0),0)}</strong></div></div>{children.map((x:any)=><section className="pp-kid-card" key={x.id}><div className="pp-row"><span><b>{x.fullName}</b><small>{x.className} · ID: {x.studentId}</small></span><span className="pp-child-avatar">{initials(x.fullName)}</span></div><div className="pp-row"><span>Form Teacher</span><b>{x.formTeacherName||'Lama qoondeyn'}</b></div><div className="pp-row"><span>Imaanshaha bishan</span><b>{x.attendanceSummary?.present??0} / {x.attendanceSummary?.total??0} maalmood</b></div><div className="pp-row"><span>Natiijooyinka</span><b>{x.marksSummary?.total??0} / {x.marksSummary?.max??0} dhibcood</b></div><div className="pp-row"><span>Hawlo harsan</span><b>{x.homeworkPending??0}</b></div><div className="pp-row"><span>Ogeysiis cusub</span><b>{x.unreadNotices??0}</b></div><div className="pp-kid-actions"><button onClick={()=>{setChildId(x.id);go('home');}}>Fur</button><button onClick={()=>{setChildId(x.id);go('att');}}>Imaanshaha</button><button onClick={()=>{setChildId(x.id);go('marks');}}>Natiijo</button></div></section>)}</>}
   {active&&view==='tt'&&<section className="pp-card"><div className="pp-section-title"><h2>Jadwalka fasalka</h2><span className="pp-muted">Sabti – Khamiis · Jimce fasax</span></div>{timetableState.loading?<div className="pp-empty">Jadwalka waa la soo dejinayaa…</div>:timetableState.error?<PortalError error={timetableState.error} retry={timetableState.retry}/>:!timetable.length?<div className="pp-empty">Jadwal lama diiwaangelin fasalka ilmaha.</div>:<div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>Cashar</th>{['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday'].map((d,i)=><th key={d}>{['Sabti','Axad','Isniin','Talaado','Arbaco','Khamiis'][i]}</th>)}</tr></thead><tbody>{Array.from({length:Math.max(1,...timetable.map((s:any)=>Number(s.periodNumber||1)))},(_,i)=>i+1).map(p=><tr key={p}><td>{p}</td>{['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday'].map(d=>{const s=timetable.find((x:any)=>x.dayOfWeek===d&&Number(x.periodNumber)===p);return <td key={d}>{s?<><b>{s.subjectName||s.subjectId}</b><small>{s.startTime}–{s.endTime}</small><small>{s.teacherName||''}</small></>:'—'}</td>;})}</tr>)}</tbody></table></div>}</section>}
   {active&&view==='att'&&<section className="pp-card"><div className="pp-section-title"><h2>Imaanshaha</h2><span className="pp-muted">{new Intl.DateTimeFormat('so',{month:'long',year:'numeric'}).format(new Date())}</span></div>{attendanceState.loading?<div className="pp-empty">Diiwaanka waa la soo dejinayaa…</div>:attendanceState.error?<PortalError error={attendanceState.error} retry={attendanceState.retry}/>:<><p>Wuu yimid <b>{counts.present}</b> maalmood oo ka mid ah <b>{monthRows.length}</b> maalmood oo dugsigu furnaa. Wuu maqnaa <b>{counts.absent}</b>, wuuna daahay <b>{counts.late}</b>.</p><div className="pp-stat-grid pp-att-stats"><div><small>Joogay</small><strong>{counts.present}</strong></div><div><small>Maqnaa</small><strong>{counts.absent}</strong></div><div><small>Daahay</small><strong>{counts.late}</strong></div></div><div className="pp-calendar">{['Ax','Is','Ta','Ar','Kh','Jim','Sab'].map(d=><b key={d}>{d}</b>)}{Array.from({length:firstDay},(_,i)=><i key={'blank'+i}/>)}{Array.from({length:monthDays},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0');const status=attendanceByDate.get(date);return <span key={date} className={'pp-day '+(status==='present'?'is-present':status==='absent'?'is-absent':status==='late'?'is-late':'')}>{i+1}</span>;})}</div><p className="pp-muted">Cagaar = joogay · Casaan = maqnaa · Huruud = daahay</p></>}</section>}
   {active&&view==='marks'&&<section className="pp-card"><div className="pp-section-title"><h2>Natiijooyinka</h2><span className="pp-muted">Published oo keliya</span></div>{marksState.loading?<div className="pp-empty">Natiijooyinka waa la soo dejinayaa…</div>:marksState.error?<PortalError error={marksState.error} retry={marksState.retry}/>:!marks.length?<div className="pp-empty">Weli lama daabicin natiijooyinka ilmaha.</div>:<><p>Wadarta dhibcaha: <b>{scoreTotal} / {scoreMax}</b></p><div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>Maaddo</th><th>Semester</th><th>Dhibcood</th><th>Darajo</th></tr></thead><tbody>{marks.map((m:any)=><tr key={m.id}><td><b>{m.subjectName||m.subjectId}</b></td><td>{m.semester}</td><td><b>{m.totalMarks} / {Array.isArray(m.schemeSnapshot)?m.schemeSnapshot.reduce((n:number,c:any)=>n+Number(c.maxMarks||0),0):0}</b></td><td>{gradeText(m)}</td></tr>)}</tbody></table></div></>}</section>}
   {active&&view==='hw'&&<><div className="pp-filter-tabs">{(['pending','submitted','all'] as const).map(f=><button key={f} className={homeworkFilter===f?'is-selected':''} onClick={()=>setHomeworkFilter(f)}>{f==='pending'?'Harsan ('+pending+')':f==='submitted'?'La gudbiyey ('+submitted+')':'Dhammaan'}</button>)}</div>{homeworkState.loading?<div className="pp-card pp-empty">Hawlaha waa la soo dejinayaa…</div>:homeworkState.error?<PortalError error={homeworkState.error} retry={homeworkState.retry}/>:!visibleHomework.length?<div className="pp-card pp-empty">Hawl halkan kuma jirto.</div>:visibleHomework.map((h:any)=><section className="pp-card" key={h.id}><div className="pp-section-title"><div><b>{h.subjectName||h.subjectId}</b><h3>{h.title}</h3></div><em className={!h.submission&&h.dueDate<today?'pp-overdue':h.submission?'pp-done':'pp-due'}>{!h.submission&&h.dueDate<today?'Dhaafay':h.submission?'La gudbiyey':'Harsan · '+dateLabel(h.dueDate)}</em></div><p>{h.description}</p><div className="pp-submission"><b>{h.submission?<><CheckCircle2 size={14}/> La gudbiyey</>:'Harsan'}</b>{h.submission?.submittedAt&&<small>{dateLabel(h.submission.submittedAt)}</small>}</div></section>)}</>}
   {active&&view==='news'&&<>{noticesState.loading?<div className="pp-card pp-empty">Ogeysiisyada waa la soo dejinayaa…</div>:noticesState.error?<PortalError error={noticesState.error} retry={noticesState.retry}/>:!notices.length?<div className="pp-card pp-empty">Ogeysiis cusub ma jiro.</div>:notices.map((n:any)=><section className="pp-card" key={n.id}><div className="pp-section-title"><b>{n.title}</b><small>{dateLabel(n.publishDate)}</small></div><span className="pp-muted">{n.audience==='class'?'Fasalka ilmaha': 'Dugsi oo dhan'}</span><p className="pp-notice-body">{n.content}</p>{!n.isRead&&<button className="pp-primary-button" onClick={()=>markRead(n.id)}>Calaamadi akhriyey</button>}</section>)}<div className="pp-pagination"><button disabled={noticePage<=1} onClick={()=>setNoticePage(p=>p-1)}>Hore</button><span>{noticePage} / {noticePagination.totalPages||1}</span><button disabled={noticePage>=(noticePagination.totalPages||1)} onClick={()=>setNoticePage(p=>p+1)}>Xiga</button></div></>}
   {active&&view==='msg'&&<section className="pp-card"><h2>Fariimaha macallimiinta ilmaha</h2>{contactsState.loading?<div className="pp-empty">Macallimiinta waa la soo dejinayaa…</div>:contactsState.error?<PortalError error={contactsState.error} retry={contactsState.retry}/>:!contacts.length?<div className="pp-empty">Macallin loo qoondeeyey ilmaha weli ma jiro.</div>:<div className="pp-message-layout"><div className="pp-contact-list">{contacts.map((c:any)=><button key={c.id} className={c.id===contactId?'is-selected':''} onClick={()=>setContactId(c.id)}>{c.fullName}<small>Macallin</small></button>)}</div><div className="pp-thread"><b>{contact?.fullName||'Macallin'}</b>{messagesState.loading?<div className="pp-empty">Fariimaha waa la soo dejinayaa…</div>:messagesState.error?<PortalError error={messagesState.error} retry={messagesState.retry}/>:<div className="pp-chat-log">{messages.length?messages.map((m:any)=><div key={m.id} className={'pp-chat-bubble '+(m.senderId===user?.id?'mine':'')}>{m.content}<small>{dateLabel(m.timestamp)}</small></div>):<div className="pp-empty">Wada-hadal hore ma jiro. Waxaad fariin u diri kartaa macallinka.</div>}</div>}<div className="pp-compose"><input value={messageDraft} onChange={e=>setMessageDraft(e.target.value)} maxLength={5000} placeholder="Qor fariin macallinka…"/><button disabled={sending||!messageDraft.trim()} onClick={send} aria-label="Dir fariinta"><Send size={17}/></button></div></div></div>}</section>}
   {active&&view==='me'&&<section className="pp-profile"><div className="pp-card"><h2>Xogta waalidka</h2><div className="pp-row"><span>Magaca</span><b>{parent?.fullName||user?.fullName}</b></div><div className="pp-row"><span>Telefoon</span><b>{parent?.phone||user?.phone||'—'}</b></div><div className="pp-row"><span>Tirada carruurta</span><b>{children.length}</b></div>{children.map((x:any)=><div className="pp-row" key={x.id}><span>{x.fullName}</span><b>{x.studentId} · {x.className}</b></div>)}</div><div className="pp-card"><h2>Muuqaalka</h2><div className="pp-theme-options">{(['auto','light','dark'] as const).map(v=><button key={v} className={theme===v?'is-selected':''} onClick={()=>setTheme(v)}>{v==='auto'?'Otomaatig':v==='light'?<><Sun size={15}/> Iftiin</>:<><Moon size={15}/> Mugdi</>}</button>)}</div></div></section>}
  </main></div>
  <nav className="pp-bottom-nav" aria-label="Menu hoose">{navButton(NAV[0],true)}{navButton(NAV[1],true)}{navButton(NAV[4],true)}<div className="pp-more-wrap"><button className={'pp-nav-item is-mobile '+(moreActive||moreOpen?'is-active':'')} onClick={()=>setMoreOpen(v=>!v)} aria-expanded={moreOpen}><Menu size={19}/><span>Dheeraad</span></button>{moreOpen&&<div className="pp-more-sheet">{moreItems.map(n=>navButton(n))}</div>}</div></nav>
 </div>;
};
