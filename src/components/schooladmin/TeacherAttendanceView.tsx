import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2, Clock3, RefreshCw, Users } from 'lucide-react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { PageHeader, Card, Button, Pill, EmptyState, FormRow } from '../SchoolDesignSystem.tsx';

type TeacherStatus = 'present' | 'absent' | 'late' | 'on_leave';
const statusLabel: Record<TeacherStatus, string> = { present: 'Jooga', absent: 'Maqan', late: 'Daahay', on_leave: 'Fasax' };
const localToday = (timezone?: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'Africa/Addis_Ababa' }).format(new Date());

export const TeacherAttendanceView: React.FC = () => {
  const { school, isReadOnly } = useAuth();
  const today = localToday(school?.timezone);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [date, setDate] = useState(today);
  const [data, setData] = useState<any>(null);
  const [drafts, setDrafts] = useState<Record<string, { status: TeacherStatus; note: string; checkIn: string; checkOut: string }>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await ApiClient.getTeacherAttendance(month);
      setData(result);
      const dayRows = (result.records || []).filter((row: any) => row.date === date);
      const byTeacher = new Map(dayRows.map((row: any) => [row.teacher_id, row]));
      setDrafts(Object.fromEntries((result.teachers || []).map((teacher: any) => {
        const row: any = byTeacher.get(teacher.id);
        return [teacher.id, { status: row?.status || 'present', note: row?.note || '', checkIn: row?.check_in ? new Date(row.check_in).toTimeString().slice(0,5) : '', checkOut: row?.check_out ? new Date(row.check_out).toTimeString().slice(0,5) : '' }];
      })));
    } catch (e) { setError(e instanceof Error ? e.message : 'Xaadirinta macallimiinta lama soo dejin karin.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [school?.id, month]);
  useEffect(() => {
    if (!data?.teachers) return;
    const dayRows = (data.records || []).filter((row: any) => row.date === date);
    const byTeacher = new Map(dayRows.map((row: any) => [row.teacher_id, row]));
    setDrafts(Object.fromEntries(data.teachers.map((teacher: any) => {
      const row: any = byTeacher.get(teacher.id);
      return [teacher.id, { status: row?.status || 'present', note: row?.note || '', checkIn: row?.check_in ? new Date(row.check_in).toTimeString().slice(0,5) : '', checkOut: row?.check_out ? new Date(row.check_out).toTimeString().slice(0,5) : '' }];
    })));
  }, [date, data]);

  const update = (teacherId: string, patch: Partial<{ status: TeacherStatus; note: string; checkIn: string; checkOut: string }>) =>
    setDrafts(old => ({ ...old, [teacherId]: { ...(old[teacherId] || { status: 'present', note: '', checkIn: '', checkOut: '' }), ...patch } }));

  const save = async (teacherId: string) => {
    if (isReadOnly || savingId) return;
    const draft = drafts[teacherId] || { status: 'present' as TeacherStatus, note: '', checkIn: '', checkOut: '' };
    setSavingId(teacherId); setError(''); setNotice('');
    try {
      const result = await ApiClient.saveTeacherAttendance({
        teacherId, date, status: draft.status, note: draft.note,
        checkIn: draft.checkIn ? date + 'T' + draft.checkIn + ':00' : null,
        checkOut: draft.checkOut ? date + 'T' + draft.checkOut + ':00' : null
      });
      setData((old: any) => ({ ...old, records: [...(old.records || []).filter((row: any) => !(row.teacher_id === teacherId && row.date === date)), result.attendance] }));
      setNotice('Xaadirinta macallinka waa la kaydiyey.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Xaadirinta macallinka lama kaydin karin.'); }
    finally { setSavingId(''); }
  };

  const summary = useMemo(() => data?.summary || [], [data]);
  const total = summary.reduce((acc: number, row: any) => acc + row.present + row.absent + row.late + row.onLeave, 0);

  return <main className="mx-auto min-w-0 w-full max-w-6xl space-y-5 p-4 md:p-8">
    <PageHeader title="Macallimiin Imaanshaha" subtitle="Diiwaangeli oo dib u eeg xaadirinta macallimiinta ee dugsigan." />
    <div className="grid gap-3 sm:grid-cols-2">
      <FormRow label="Taariikhda xaadirinta"><input type="date" max={today} value={date} onChange={e => setDate(e.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900" /></FormRow>
      <FormRow label="Bisha warbixinta"><input type="month" value={month} onChange={e => { setMonth(e.target.value); if (date.slice(0,7) !== e.target.value) setDate(e.target.value + '-01'); }} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900" /></FormRow>
    </div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        ['Jooga', summary.reduce((n: number, row: any) => n + row.present, 0)],
        ['Maqan', summary.reduce((n: number, row: any) => n + row.absent, 0)],
        ['Daahay', summary.reduce((n: number, row: any) => n + row.late, 0)],
        ['Fasax', summary.reduce((n: number, row: any) => n + row.onLeave, 0)]
      ].map(([label, value]) => <Card key={String(label)} className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></Card>)}
    </div>
    <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Diiwaanka maanta</h2><Button onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Cusboonaysii</Button></div>
    {loading ? <Card><p className="p-8 text-center text-sm text-slate-500">Xogta waa la soo dejinayaa…</p></Card> : !data?.teachers?.length ? <Card><EmptyState><Users className="mx-auto h-8 w-8" /><p>Macallimiin lama diiwaangelin.</p></EmptyState></Card> :
      <div className="space-y-3">{data.teachers.map((teacher: any) => {
        const draft = drafts[teacher.id] || { status: 'present' as TeacherStatus, note: '', checkIn: '', checkOut: '' };
        const saved = (data.records || []).some((row: any) => row.teacher_id === teacher.id && row.date === date);
        return <Card key={teacher.id} className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2"><div><h3 className="font-bold">{teacher.full_name}</h3><p className="text-xs text-slate-500">{teacher.staff_id || teacher.phone || '—'}</p></div><Pill>{saved ? 'La kaydiyey' : 'Sugaya'}</Pill></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(['present','absent','late','on_leave'] as TeacherStatus[]).map(status => <button key={status} type="button" disabled={isReadOnly || savingId === teacher.id} aria-pressed={draft.status === status} onClick={() => update(teacher.id, { status })} className={'min-h-11 rounded-xl border px-2 text-sm font-bold ' + (draft.status === status ? status === 'present' ? 'border-emerald-600 bg-emerald-600 text-white' : status === 'absent' ? 'border-rose-600 bg-rose-600 text-white' : status === 'late' ? 'border-amber-500 bg-amber-500 text-white' : 'border-sky-700 bg-sky-700 text-white' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}>{statusLabel[status]}</button>)}</div>
          <div className="grid grid-cols-2 gap-2"><FormRow label="Soo galay"><input type="time" value={draft.checkIn} onChange={e => update(teacher.id, { checkIn: e.target.value })} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900" /></FormRow><FormRow label="Baxay"><input type="time" value={draft.checkOut} onChange={e => update(teacher.id, { checkOut: e.target.value })} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900" /></FormRow></div>
          <input value={draft.note} onChange={e => update(teacher.id, { note: e.target.value })} placeholder="Faallo ikhtiyaari ah…" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
          <Button variant="primary" className="min-h-11 w-full" disabled={isReadOnly || savingId === teacher.id} onClick={() => void save(teacher.id)}>{savingId === teacher.id ? 'Waa la kaydinayaa…' : 'Kaydi xaadirinta'}</Button>
        </Card>;
      })}</div>}
    <Card className="p-4"><div className="flex items-center justify-between"><h2 className="font-bold">Soo koobidda bisha {month}</h2><Pill>{total} diiwaan</Pill></div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="py-2">Macallin</th><th>Jooga</th><th>Maqan</th><th>Daahay</th><th>Fasax</th></tr></thead><tbody>{summary.map((row: any) => <tr key={row.teacher.id} className="border-b border-slate-100 dark:border-slate-800"><td className="py-3 font-semibold">{row.teacher.full_name}</td><td>{row.present}</td><td>{row.absent}</td><td>{row.late}</td><td>{row.onLeave}</td></tr>)}</tbody></table></div></Card>
  </main>;
};
