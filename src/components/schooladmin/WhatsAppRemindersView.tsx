import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, MessageCircle, RefreshCw, Search, Send, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import type { SchoolClass, Student } from '../../types/index.ts';

type ReminderStudent = Student & { feeStatus?: 'paid' | 'partial' | 'unpaid' };

const normalizePhone = (value?: string) => String(value || '').replace(/[^0-9]/g, '');

const currentMonthLabel = (timezone?: string) => {
  try {
    return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: timezone || 'Africa/Addis_Ababa' }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date());
  }
};

export const WhatsAppRemindersView: React.FC = () => {
  const { school, user } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<ReminderStudent[]>([]);
  const [classFilter, setClassFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openedIds, setOpenedIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const month = currentMonthLabel(school?.timezone);

  const loadStudents = async (status: 'unpaid' | 'partial'): Promise<ReminderStudent[]> => {
    const first = await ApiClient.getStudents(undefined, undefined, 1, 100, undefined, status) as ReminderStudent[] & { pagination?: { totalPages?: number } };
    const rows = [...first];
    const pages = Math.max(1, Number(first.pagination?.totalPages) || 1);
    for (let page = 2; page <= pages; page += 1) {
      const next = await ApiClient.getStudents(undefined, undefined, page, 100, undefined, status);
      rows.push(...next as ReminderStudent[]);
    }
    return rows;
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [classRows, unpaidRows, partialRows] = await Promise.all([
        ApiClient.getClasses(),
        loadStudents('unpaid'),
        loadStudents('partial')
      ]);
      setClasses(classRows);
      const unique = new Map<string, ReminderStudent>();
      [...unpaidRows, ...partialRows].forEach(student => unique.set(student.id, student));
      setStudents([...unique.values()]);
      setSelectedIds([]);
      setOpenedIds([]);
    } catch (err: any) {
      setError(err?.message || 'Could not load students and classes for WhatsApp reminders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (school && user?.role === 'school_admin') void loadData(); }, [school?.id, user?.id]);

  const classById = useMemo(() => new Map(classes.map(item => [item.id, item])), [classes]);
  const visibleStudents = useMemo(() => students.filter(student => {
    const matchesClass = classFilter === 'all' || student.classId === classFilter;
    const fullName = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !search.trim() || [fullName, student.studentId, student.fatherPhone, student.motherPhone]
      .some(value => String(value || '').toLowerCase().includes(search.trim().toLowerCase()));
    return matchesClass && matchesSearch;
  }), [students, classFilter, search]);

  const toggleStudent = (id: string) => setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const toggleVisible = () => {
    const visibleIds = visibleStudents.map(student => student.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
    setSelectedIds(current => allSelected ? current.filter(id => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
  };

  const buildMessage = (student: ReminderStudent) => {
    const className = classById.get(student.classId)?.name || 'your child’s class';
    const amount = Number(classById.get(student.classId)?.monthlyFee || 0);
    const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: school?.currency || 'ETB', maximumFractionDigits: 0 }).format(amount);
    const name = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ');
    return message
      .replaceAll('{parentName}', student.fatherPhone ? 'Parent' : 'Guardian')
      .replaceAll('{studentName}', name)
      .replaceAll('{className}', className)
      .replaceAll('{amount}', formattedAmount)
      .replaceAll('{month}', month)
      .replaceAll('{schoolName}', school?.name || 'the school');
  };

  const nextStudent = students.find(student => selectedIds.includes(student.id) && !openedIds.includes(student.id));
  const openNextWhatsApp = () => {
    if (!nextStudent) return;
    const phone = normalizePhone(nextStudent.fatherPhone || nextStudent.motherPhone);
    if (!phone) {
      setError(`No parent phone number is saved for ${nextStudent.firstName} ${nextStudent.lastName}. Update the student's parent contact first.`);
      return;
    }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(buildMessage(nextStudent))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpenedIds(current => [...current, nextStudent.id]);
  };

  if (user?.role !== 'school_admin') {
    return <div className="m-6 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">This WhatsApp sending workspace is available to School Admins only.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-teal-700"><MessageCircle size={19}/><span className="text-xs font-bold uppercase tracking-wider">School Admin · Communication</span></div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">WhatsApp parent reminders</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Prepare fee reminders for students with unpaid or partially paid fees, then open each parent chat in the school’s WhatsApp account.</p>
        </div>
        <button type="button" onClick={() => void loadData()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={15}/> Refresh list</button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">Students needing a reminder</p><p className="mt-1 text-2xl font-bold text-slate-900">{students.length}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">Selected parents</p><p className="mt-1 text-2xl font-bold text-slate-900">{selectedIds.length}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">Chats opened this session</p><p className="mt-1 text-2xl font-bold text-slate-900">{openedIds.length}</p></div>
      </div>

      {school?.whatsappPhone ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 size={18} className="mt-0.5 shrink-0"/><div><p className="font-semibold">School WhatsApp contact: {school.whatsappPhone}</p><p className="mt-0.5 text-xs text-emerald-800">Before sending, make sure WhatsApp Web or the WhatsApp app is signed in with this school number.</p></div></div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle size={18} className="mt-0.5 shrink-0"/><div><p className="font-semibold">School WhatsApp number is not configured.</p><p className="mt-0.5 text-xs">Add the school WhatsApp number in School Settings before using this workspace.</p></div></div>
      )}

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">Choose parents</h2><p className="text-xs text-slate-500">Only unpaid and partially paid students are listed.</p></div><Users size={19} className="text-slate-400"/></div>
          <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr]">
            <label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search student or parent phone" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-500"/></label>
            <select value={classFilter} onChange={event => setClassFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500"><option value="all">All classes</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          </div>
          {loading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={17} className="animate-spin"/> Loading students…</div> : visibleStudents.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">No unpaid or partially paid students found for this filter.</div> : <>
            <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2"><label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={visibleStudents.every(student => selectedIds.includes(student.id))} onChange={toggleVisible} className="rounded border-slate-300"/> Select visible ({visibleStudents.length})</label><span className="text-[11px] text-slate-400">{selectedIds.length} selected</span></div>
            <div className="max-h-[440px] space-y-1 overflow-y-auto pr-1">{visibleStudents.map(student => {
              const classItem = classById.get(student.classId);
              const parentPhone = student.fatherPhone || student.motherPhone;
              return <label key={student.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-3 hover:bg-slate-50">
                <input type="checkbox" checked={selectedIds.includes(student.id)} onChange={() => toggleStudent(student.id)} className="rounded border-slate-300"/>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{student.firstName} {student.middleName} {student.lastName}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{classItem?.name || 'Class not found'} · {student.studentId} · {parentPhone || 'No parent phone'}</span></span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${student.feeStatus === 'partial' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{student.feeStatus === 'partial' ? 'PARTIAL' : 'UNPAID'}</span>
                {openedIds.includes(student.id) && <CheckCircle2 size={16} className="shrink-0 text-emerald-600"/>}
              </label>;
            })}</div>
          </>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <h2 className="font-bold text-slate-900">Message template</h2>
          <p className="mt-1 text-xs text-slate-500">Edit the text before opening each parent chat. Placeholders are filled for each student.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">{['{parentName}','{studentName}','{className}','{amount}','{month}','{schoolName}'].map(token => <button key={token} type="button" onClick={() => setMessage(current => current + token)} className="rounded-lg bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-100">{token}</button>)}</div>
          <textarea value={message} onChange={event => setMessage(event.target.value)} rows={9} placeholder={`Dear {parentName}, this is a reminder that the monthly class fee for {studentName} ({className}) for {month} is {amount}. Please contact {schoolName} to confirm the remaining balance. If you have already paid, kindly ignore this message. Thank you.`} className="mt-3 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm leading-6 outline-none focus:border-teal-500"/>
          <div className="mt-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">The amount shown is the class’s monthly fee, not a verified remaining balance. Partially paid accounts may have a different balance; the Accountant continues to manage and verify all financial records.</div>
          <button type="button" onClick={openNextWhatsApp} disabled={!nextStudent || !message.trim() || loading} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#128C7E] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#0e796d] disabled:cursor-not-allowed disabled:opacity-40"><Send size={16}/>{nextStudent ? `Open WhatsApp for ${nextStudent.firstName}` : 'All selected chats opened' }<ExternalLink size={14}/></button>
          <p className="mt-2 text-center text-[11px] text-slate-400">Each click opens one WhatsApp chat. You must press Send in WhatsApp; SchoolOS cannot confirm delivery.</p>
          {openedIds.length > 0 && <button type="button" onClick={() => setOpenedIds([])} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Reset opened-chat markers</button>}
        </section>
      </div>
    </div>
  );
};
