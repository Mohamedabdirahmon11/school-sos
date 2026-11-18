import React, { useEffect, useMemo, useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { AttendanceView } from './AttendanceView.tsx';
import { PageHeader, Card, Button, Pill, EmptyState, FormRow } from '../SchoolDesignSystem.tsx';
import { CalendarCheck, Users, LockKeyhole, UserCheck, RefreshCw } from 'lucide-react';

type Tab = 'students' | 'teachers' | 'register';
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa' }).format(new Date());

export const AttendanceAdminWorkspace: React.FC = () => {
  const [tab, setTab] = useState<Tab>('students');
  const [date, setDate] = useState(todayIso());
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [dashboard, setDashboard] = useState<any>(null);
  const [teacherData, setTeacherData] = useState<any>(null);
  const [teacherId, setTeacherId] = useState('');
  const [status, setStatus] = useState<'present'|'absent'|'late'|'on_leave'>('present');
  const [note, setNote] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [unlockReason, setUnlockReason] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadStudents = async () => { setBusy(true); setError(''); try { setDashboard(await ApiClient.getAttendanceDashboard(date)); } catch(e) { setError(e instanceof Error ? e.message : 'Xaadirinta ardayda lama soo dejin karin.'); } finally { setBusy(false); } };
  const loadTeachers = async () => { setBusy(true); setError(''); try { setTeacherData(await ApiClient.getTeacherAttendance(month)); } catch(e) { setError(e instanceof Error ? e.message : 'Xaadirinta macallimiinta lama soo dejin karin.'); } finally { setBusy(false); } };
  useEffect(() => { if (tab === 'students') void loadStudents(); if (tab === 'teachers') void loadTeachers(); }, [tab, date, month]);

  const teacherOptions = teacherData?.teachers || [];
  const selectedTeacher = teacherOptions.find((teacher: any) => teacher.id === teacherId) || teacherOptions[0];
  const sessionRows = dashboard?.sessions || [];
  const absentRows = dashboard?.absentStudents || [];
  const summary = useMemo(() => teacherData?.summary || [], [teacherData]);

  const markTeacher = async () => {
    if (!selectedTeacher || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await ApiClient.markTeacherAttendance({ teacherId: selectedTeacher.id, date, status, note, checkIn: checkIn || null, checkOut: checkOut || null });
      setMessage('Xaadirinta macallinka waa la kaydiyey.'); await loadTeachers();
    } catch(e) { setError(e instanceof Error ? e.message : 'Xaadirinta lama kaydin karin.'); }
    finally { setBusy(false); }
  };
  const unlock = async (sessionId: string) => {
    const reason = (unlockReason[sessionId] || '').trim();
    if (reason.length < 4) { setError('Geli sababta furitaanka (ugu yaraan 4 xaraf).'); return; }
    setBusy(true); setError(''); setMessage('');
    try { await ApiClient.unlockAttendanceSession(sessionId, reason); setMessage('Kulanka xaadirinta waa la furay.'); await loadStudents(); }
    catch(e) { setError(e instanceof Error ? e.message : 'Kulanka lama furi karin.'); }
    finally { setBusy(false); }
  };

  return <main className="mx-auto w-full max-w-7xl space-y-5 p-3 pb-24 md:p-8">
    <PageHeader title="Maamulka Xaadirinta" subtitle="Xaadirinta ardayda iyo imaanshaha macallimiinta ee dugsiga." />
    <nav className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
      {([{id:'students',label:'Xaadiris ardayda'},{id:'teachers',label:'Macallimiin imaanshaha'},{id:'register',label:'Diiwaanka'}] as const).map(item =>
        <button key={item.id} onClick={() => setTab(item.id)} className={'min-h-12 rounded-xl px-2 text-xs font-bold sm:text-sm '+(tab===item.id?'bg-teal-700 text-white':'text-slate-600 dark:text-slate-300')}>{item.label}</button>)}
    </nav>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">{error}</div>}
    {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{message}</div>}

    {tab === 'students' && <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><FormRow label="Taariikh"><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="min-h-11 rounded-xl border px-3 dark:border-slate-700 dark:bg-slate-900" /></FormRow><Button onClick={()=>void loadStudents()}><RefreshCw className="mr-2 h-4 w-4"/>Cusboonaysii</Button></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['Heerka xaadirinta', (dashboard?.attendanceRate ?? 0)+'%'],['Ardayda guud',dashboard?.totalStudents ?? 0],['La diiwaangeliyey',dashboard?.recorded ?? 0],['Maqan',dashboard?.absentCount ?? 0]].map(([label,value])=><Card key={String(label)} className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></Card>)}
      </div>
      <Card className="space-y-3 p-4"><h2 className="font-bold">Ardayda maqan</h2>{busy&&!dashboard?<p className="text-sm text-slate-500">Waa la soo dejinayaa…</p>:!absentRows.length?<EmptyState><CalendarCheck className="mx-auto h-7 w-7"/><p>Arday maqan lama diiwaangelin maanta.</p></EmptyState>:<div className="divide-y dark:divide-slate-700">{absentRows.map((row:any)=><div key={row.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-semibold">{row.student?.first_name} {row.student?.last_name}</p><p className="text-xs text-slate-500">{row.className} · {row.student?.student_id}</p></div><Pill>Maqan</Pill></div>)}</div>}</Card>
      <Card className="space-y-3 p-4"><h2 className="font-bold">Fasallada aan weli xaadirin gudbin</h2>{!dashboard?.classesNotSubmitted?.length?<p className="text-sm text-slate-500">Fasallada oo dhan waa la gudbiyey ama xog ma leh.</p>:dashboard.classesNotSubmitted.map((item:any)=><p key={item.id} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{item.name}</p>)}</Card>
      <Card className="space-y-3 p-4"><h2 className="font-bold">Kulamada xaadirinta iyo furitaanka</h2>{!sessionRows.length?<p className="text-sm text-slate-500">Kulamo la gudbiyey ma jiraan.</p>:sessionRows.map((session:any)=><div key={session.id} className="space-y-2 rounded-xl border p-3 dark:border-slate-700"><div className="flex items-center justify-between"><span className="font-semibold">{(dashboard?.classes||[]).find((x:any)=>x.id===session.class_id)?.name || session.class_id}</span><Pill>{session.is_locked?'Xiran':'Furan'}</Pill></div><p className="text-xs text-slate-500">{session.submitted_at ? new Date(session.submitted_at).toLocaleString() : 'Weli lama gudbin'}</p>{session.is_locked && <div className="flex flex-col gap-2 sm:flex-row"><input value={unlockReason[session.id]||''} onChange={e=>setUnlockReason(old=>({...old,[session.id]:e.target.value}))} placeholder="Sababta furitaanka" className="min-h-11 flex-1 rounded-xl border px-3 dark:border-slate-700 dark:bg-slate-900"/><Button disabled={busy} onClick={()=>void unlock(session.id)}><LockKeyhole className="mr-2 h-4 w-4"/>Fur kulanka</Button></div>}</div>)}</Card>
    </section>}

    {tab === 'teachers' && <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3"><FormRow label="Bisha"><input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="min-h-11 rounded-xl border px-3 dark:border-slate-700 dark:bg-slate-900"/></FormRow><Button onClick={()=>void loadTeachers()}><RefreshCw className="mr-2 h-4 w-4"/>Cusboonaysii</Button></div>
      <Card className="grid gap-3 p-4 md:grid-cols-2">
        <FormRow label="Macallin"><select value={selectedTeacher?.id||''} onChange={e=>setTeacherId(e.target.value)} className="min-h-12 w-full rounded-xl border px-3 dark:border-slate-700 dark:bg-slate-900">{teacherOptions.map((x:any)=><option key={x.id} value={x.id}>{x.full_name}</option>)}</select></FormRow>
        <FormRow label="Taariikh"><input type="date" max={todayIso()} value={date} onChange={e=>setDate(e.target.value)} className="min-h-12 w-full rounded-xl border px-3 dark:border-slate-700 dark:bg-slate-900"/></FormRow>
        <FormRow label="Xaalad"><select value={status} onChange={e=>setStatus(e.target.value as any)} className="min-h-12 w-full rounded-xl border px-3 dark:border-slate-700 dark:bg-slate-900"><option value="present">Jooga</option><option value="absent">Maqan</option><option value="late">Daahay</option><option value="on_leave">Fasax</option></select></FormRow>
        <FormRow label="Faallo"><input value={note} onChange={e=>setNote(e.target.value)} className="min-h-12 w-full rounded-xl border px-3 dark:border-slate-700 dark:bg-slate-900" placeholder="Ikhtiyaari"/></FormRow>
        <FormRow label="Waqtiga imaanshaha"><input type="time" value={checkIn} onChange={e=>setCheckIn(e.target.value)} className="min-h-12 w-full rounded-xl border px-3 dark:border-slate-700 dark:bg-slate-900"/></FormRow>
        <FormRow label="Waqtiga bixitaanka"><input type="time" value={checkOut} onChange={e=>setCheckOut(e.target.value)} className="min-h-12 w-full rounded-xl border px-3 dark:border-slate-700 dark:bg-slate-900"/></FormRow>
        <Button disabled={busy||!selectedTeacher} className="min-h-12 md:col-span-2" onClick={()=>void markTeacher()}><UserCheck className="mr-2 h-4 w-4"/>Kaydi imaanshaha macallinka</Button>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{summary.map((item:any)=><Card key={item.teacher.id} className="space-y-2 p-4"><h3 className="font-bold">{item.teacher.full_name}</h3><div className="grid grid-cols-2 gap-2 text-sm"><p>Jooga: <b>{item.present}</b></p><p>Maqan: <b>{item.absent}</b></p><p>Daahay: <b>{item.late}</b></p><p>Fasax: <b>{item.onLeave}</b></p></div></Card>)}</div>
    </section>}

    {tab === 'register' && <AttendanceView />}
  </main>;
};
