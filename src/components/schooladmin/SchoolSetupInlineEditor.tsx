import React, { useCallback, useEffect, useState } from 'react';
import { ApiClient } from '../../services/api.ts';

type Props = { step: 'classes' | 'subjects' | 'teachers' | 'assign' | 'students' | 'timetable'; onChanged: () => Promise<void> | void };
type Field = { name: string; label: string; type?: string; required?: boolean; options?: Array<{ value: string; label: string }> };

const fields: Record<Props['step'], Field[]> = {
  classes: [{ name: 'name', label: 'Magaca fasalka', required: true }, { name: 'gradeLevel', label: 'Grade / Heerka' }, { name: 'section', label: 'Section' }],
  subjects: [{ name: 'name', label: 'Magaca maaddada', required: true }, { name: 'code', label: 'Subject code' }, { name: 'classId', label: 'Fasalka', required: true }, { name: 'periodsPerWeek', label: 'Periods toddobaadkii', type: 'number', required: true }],
  teachers: [{ name: 'fullName', label: 'Magaca macallinka', required: true }, { name: 'staffId', label: 'Teacher ID', required: true }, { name: 'phone', label: 'Telefoonka' }],
  assign: [{ name: 'classId', label: 'Fasalka', required: true }, { name: 'subjectId', label: 'Maaddada', required: true }, { name: 'teacherId', label: 'Macallinka maaddada', required: true }],
  students: [{ name: 'firstName', label: 'Magaca koowaad', required: true }, { name: 'middleName', label: 'Magaca dhexe' }, { name: 'lastName', label: 'Magaca dambe' }, { name: 'classId', label: 'Fasalka', required: true }, { name: 'guardianPhone', label: 'Telefoonka waalidka' }],
  timetable: [{ name: 'classId', label: 'Fasalka', required: true }, { name: 'subjectId', label: 'Maaddada', required: true }, { name: 'teacherId', label: 'Macallinka', required: true }, { name: 'dayOfWeek', label: 'Maalinta', required: true, options: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(value => ({ value, label: value })) }, { name: 'periodNumber', label: 'Period', type: 'number', required: true }, { name: 'startTime', label: 'Bilow', type: 'time', required: true }, { name: 'endTime', label: 'Dhammaad', type: 'time', required: true }]
};

export const SchoolSetupInlineEditor: React.FC<Props> = ({ step, onChanged }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [assignmentData, setAssignmentData] = useState<any>(null);
  const [terms, setTerms] = useState<any[]>([]);
  const [formTeacher, setFormTeacher] = useState({ classId: '', teacherId: '' });
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [classRows, subjectRows, teacherRows] = await Promise.all([
        ApiClient.getClasses(), ApiClient.getSubjects(), ApiClient.getTeachers()
      ]);
      setClasses(classRows || []);
      setSubjects(subjectRows || []);
      setTeachers(teacherRows || []);
      if (step === 'classes') setRows(classRows || []);
      else if (step === 'subjects') setRows(subjectRows || []);
      else if (step === 'teachers') setRows(teacherRows || []);
      else if (step === 'students') setRows(await ApiClient.getStudents(undefined, undefined, 1, 50));
      else if (step === 'assign') {
        const data = await ApiClient.request<any>('/teacher-assignments');
        setAssignmentData(data);
        setRows(data.assignments || []);
        setFormTeacher(value => ({ ...value, classId: value.classId || data.classes?.[0]?.id || '' }));
      } else {
        const [slots, termRows] = await Promise.all([ApiClient.getTimetable({ scope: 'school' }), ApiClient.getTimetableTerms()]);
        setRows(slots || []);
        setTerms(termRows || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xogta lama soo qaadi karin.');
    } finally {
      setLoading(false);
    }
  }, [step]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (step === 'classes') {
        await ApiClient.createClass({ name: form.name, gradeLevel: form.gradeLevel || undefined, section: form.section || undefined });
      } else if (step === 'subjects') {
        const subject = await ApiClient.createSubject({ name: form.name, code: form.code || undefined });
        const curriculum = await ApiClient.getClassCurriculum(form.classId);
        const current = (curriculum.curriculum || []).filter((item: any) => item.isActive).map((item: any) => ({ subjectId: item.subjectId, periodsPerWeek: Number(item.periodsPerWeek || 1) }));
        await ApiClient.saveClassCurriculum(form.classId, [...current, { subjectId: subject.id, periodsPerWeek: Math.max(1, Number(form.periodsPerWeek || 1)) }]);
      } else if (step === 'teachers') {
        await ApiClient.createTeacher({ fullName: form.fullName, staffId: form.staffId, phone: form.phone || undefined });
      } else if (step === 'assign') {
        await ApiClient.request('/teacher-assignments', { method: 'POST', body: JSON.stringify({
          academicYearId: assignmentData?.selectedAcademicYearId, termId: assignmentData?.selectedTermId || undefined,
          classId: form.classId, subjectId: form.subjectId, teacherId: form.teacherId,
          clearDependentEntries: false
        }) });
      } else if (step === 'students') {
        await ApiClient.createStudent({ firstName: form.firstName, middleName: form.middleName || undefined, lastName: form.lastName || undefined, classId: form.classId, guardianPhone: form.guardianPhone || undefined });
      } else {
        await ApiClient.setTimetableSlot({ classId: form.classId, subjectId: form.subjectId, teacherId: form.teacherId, dayOfWeek: form.dayOfWeek, periodNumber: Number(form.periodNumber), startTime: form.startTime, endTime: form.endTime, termId: terms.find(term => term.isCurrent)?.id });
      }
      setForm({});
      await load();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xogta lama kaydin karin.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: any) => {
    if (!window.confirm('Ma hubtaa inaad tirtirayso xogtan?')) return;
    setSaving(true);
    setError('');
    try {
      if (step === 'classes') await ApiClient.deleteClass(row.id);
      else if (step === 'subjects') await ApiClient.deleteSubject(row.id);
      else if (step === 'teachers') await ApiClient.deleteTeacher(row.id);
      else if (step === 'students') await ApiClient.deleteStudent(row.id);
      else if (step === 'assign') await ApiClient.request(`/teacher-assignments/${encodeURIComponent(row.id)}?clearDependentEntries=false`, { method: 'DELETE' });
      else throw new Error('Timetable slot-kan si gaar ah looma tirtiri karo; isticmaal maamulka jadwalka fasalka.');
      await load();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xogta lama tirtiri karin.');
    } finally {
      setSaving(false);
    }
  };

  const saveFormTeacher = async () => { setSaving(true); setError(''); try { await ApiClient.updateClass(formTeacher.classId, { classTeacherId: formTeacher.teacherId } as any); await load(); await onChanged(); } catch (e) { setError(e instanceof Error ? e.message : 'Form Teacher lama kaydin karin.'); } finally { setSaving(false); } };
  const title = ({ classes: 'Classes & Sections', subjects: 'Subjects & Class Curriculum', teachers: 'Teachers', assign: 'Teacher Assignment', students: 'Students', timetable: 'Timetable' } as const)[step];
  const nameOf = (row: any) => row.fullName || row.name || [row.firstName, row.middleName, row.lastName].filter(Boolean).join(' ') || row.subjectName || row.title || 'Record';
  const selectOptions = (field: Field) => field.name === 'classId' ? classes.map(row => ({ value: row.id, label: row.name })) : field.name === 'subjectId' ? subjects.map(row => ({ value: row.id, label: row.name })) : field.name === 'teacherId' ? teachers.map(row => ({ value: row.id, label: row.fullName })) : field.options || [];

  return <section className="sw-card" aria-label={title}>
    <div className="flex items-center justify-between gap-3 mb-3"><h3 className="text-lg font-semibold">{title}</h3><button type="button" className="sw-btn secondary" onClick={() => void load()} disabled={loading || saving}>Cusboonaysii</button></div>
    <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
      {fields[step].map(field => <label key={field.name} className="block space-y-1 text-sm font-semibold">
        <span>{field.label}</span>
        {['classId','subjectId','teacherId'].includes(field.name) || field.options
          ? <select required={field.required} value={form[field.name] || ''} onChange={event => setForm(value => ({ ...value, [field.name]: event.target.value }))} className="w-full rounded-lg border px-3 py-2 bg-transparent">
              <option value="">Dooro…</option>{selectOptions(field).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          : <input required={field.required} type={field.type || 'text'} min={field.type === 'number' ? 1 : undefined} value={form[field.name] || ''} onChange={event => setForm(value => ({ ...value, [field.name]: event.target.value }))} className="w-full rounded-lg border px-3 py-2 bg-transparent" />}
      </label>)}
      <div className="sm:col-span-2"><button className="sw-btn" type="submit" disabled={saving || loading}>{saving ? 'Kaydinaya…' : 'Ku dar'}</button></div>
    </form>
    {error && <p role="alert" className="sw-miss">{error}</p>}
    {step === 'assign' && <div className="rounded-lg border p-3 mb-4" style={{borderColor:'var(--sw-line)'}}>
      <h4 className="font-semibold mb-2">Form Teacher — hal macallin fasal kasta</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select value={formTeacher.classId} onChange={e => setFormTeacher(value => ({...value,classId:e.target.value}))} className="rounded-lg border px-3 py-2 bg-transparent"><option value="">Fasal</option>{classes.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>
        <select value={formTeacher.teacherId} onChange={e => setFormTeacher(value => ({...value,teacherId:e.target.value}))} className="rounded-lg border px-3 py-2 bg-transparent"><option value="">Form Teacher</option>{teachers.map(row=><option key={row.id} value={row.id}>{row.fullName}</option>)}</select>
        <button type="button" className="sw-btn" disabled={saving || !formTeacher.classId || !formTeacher.teacherId} onClick={() => void saveFormTeacher()}>Kaydi Form Teacher</button>
      </div>
    </div>}
    {step === 'assign' && assignmentData?.unassigned?.length > 0 && <p className="sw-sub">{assignmentData.unassigned.length} class-subject assignment ayaa wali maqan. Culayska macallin kasta kama badnaan karo 30 periods.</p>}
    {loading ? <p className="sw-sub">Xogta waa la soo qaadaya…</p> : rows.length === 0
      ? <div className="rounded-lg border border-dashed p-5 text-center text-sm" style={{borderColor:'var(--sw-line)',color:'var(--sw-muted)'}}>Weli xog lama diiwaangelin. Isticmaal foomka kore si aad u bilowdo.</div>
      : <ul className="divide-y" style={{borderColor:'var(--sw-line)'}}>{rows.map((row,index) => <li key={row.id || index} className="flex items-center justify-between gap-3 py-2 text-sm"><div className="min-w-0"><strong>{nameOf(row)}</strong><p style={{color:'var(--sw-muted)'}}>{row.code || row.staffId || row.studentId || row.className || row.subjectId || ''}</p></div><button type="button" className="sw-btn secondary" disabled={saving} onClick={() => void remove(row)} aria-label={`Tirtir ${nameOf(row)}`}>Tirtir</button></li>)}</ul>}
  </section>;
};
