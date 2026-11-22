import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { SchoolClass, Teacher } from '../../types/index.ts';
import { AcademicSetupHeader } from './AcademicSetupHeader.tsx';
import './academic-setup.css';

type ShiftSettings = { shiftCount: 1 | 2 };
type Notice = { kind: 'ok' | 'error'; text: string };

const gradeBand = (grade: number) => grade <= 4 ? 'Grade 1–4' : grade <= 6 ? 'Grade 5–6' : 'Grade 7–8';
const classLabel = (row: SchoolClass) => `Grade ${row.gradeLevel} · ${row.section || '—'}`;
const activeClass = (row: SchoolClass) => row.isArchived !== true;

export const ClassesView: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { school, isReadOnly } = useAuth();
  const [rows, setRows] = useState<SchoolClass[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjectCounts, setSubjectCounts] = useState<Record<string, number>>({});
  const [shiftSettings, setShiftSettings] = useState<ShiftSettings>({ shiftCount: 1 });
  const [grade, setGrade] = useState(1);
  const [section, setSection] = useState('B');
  const [capacity, setCapacity] = useState(String(school?.defaultClassCapacity || 40));
  const [shift, setShift] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyClassId, setBusyClassId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    if (!school?.id) return;
    setLoading(true);
    try {
      const [classRows, teacherRows, settings] = await Promise.all([
        ApiClient.getClasses(),
        ApiClient.getTeachers({ page: 1, pageSize: 200 }),
        ApiClient.getTimetableSettings()
      ]);
      const safeClasses = (Array.isArray(classRows) ? classRows : []).filter(activeClass)
        .sort((a, b) => a.gradeLevel - b.gradeLevel || a.section.localeCompare(b.section));
      setRows(safeClasses);
      setTeachers((Array.isArray(teacherRows) ? teacherRows : []).filter(teacher => teacher.status === 'active'));
      setShiftSettings({ shiftCount: settings.shiftCount });
      const counts = await Promise.all(safeClasses.map(async row => {
        try {
          const detail = await ApiClient.getClassCurriculum(row.id);
          return [row.id, detail.curriculum.filter(item => item.isActive).length] as const;
        } catch {
          return [row.id, 0] as const;
        }
      }));
      setSubjectCounts(Object.fromEntries(counts));
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Fasallada lama soo qaadi karin.' });
    } finally {
      setLoading(false);
    }
  }, [school?.id]);

  useEffect(() => { void load(); }, [load]);

  const sortedRows = useMemo(() => [...rows].sort((a, b) => a.gradeLevel - b.gradeLevel || a.section.localeCompare(b.section)), [rows]);
  const usedTeacherIds = useMemo(() => new Set(rows.map(row => row.classTeacherId).filter(Boolean) as string[]), [rows]);
  const freeTeachersFor = (row: SchoolClass) => teachers.filter(teacher =>
    Boolean(teacher.userId) && (!usedTeacherIds.has(teacher.userId!) || teacher.userId === row.classTeacherId)
  );

  const createClass = async (gradeLevel: number, sectionName: string, classCapacity: number, classShift: 1 | 2) => {
    if (!school?.academicYear) throw new Error('School academic year is not configured.');
    return ApiClient.createClass({
      name: `Grade ${gradeLevel}`,
      gradeLevel,
      section: sectionName,
      academicYear: school.academicYear,
      capacity: classCapacity,
      shift: classShift,
      classTeacherId: null,
      roomNumber: ''
    });
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanSection = section.trim().toUpperCase();
    const classCapacity = Number(capacity);
    if (!cleanSection || cleanSection.length > 2) { setNotice({ kind: 'error', text: 'Section must be 1–2 characters.' }); return; }
    if (!Number.isInteger(classCapacity) || classCapacity < 1 || classCapacity > 200) { setNotice({ kind: 'error', text: 'Capacity must be between 1 and 200.' }); return; }
    if (!school?.academicYear) { setNotice({ kind: 'error', text: 'School academic year is not configured.' }); return; }
    if (rows.some(row => row.gradeLevel === grade && row.section.trim().toUpperCase() === cleanSection && (row.academicYear || school.academicYear) === school.academicYear)) {
      setNotice({ kind: 'error', text: `Grade ${grade} · ${cleanSection} already exists.` }); return;
    }
    setBusy(true); setNotice(null);
    try {
      const created = await createClass(grade, cleanSection, classCapacity, shift);
      setRows(current => [...current, created].sort((a, b) => a.gradeLevel - b.gradeLevel || a.section.localeCompare(b.section)));
      setSubjectCounts(current => ({ ...current, [created.id]: 0 }));
      setSection('B');
      setNotice({ kind: 'ok', text: `${classLabel(created)} waa lagu daray.` });
      await load();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Fasalka lama kaydin karin.' });
    } finally { setBusy(false); }
  };

  const addStandard = async () => {
    if (!school?.academicYear) { setNotice({ kind: 'error', text: 'School academic year is not configured.' }); return; }
    setBusy(true); setNotice(null);
    let created = 0;
    let skipped = 0;
    try {
      for (let level = 1; level <= 8; level += 1) {
        const exists = rows.some(row => row.gradeLevel === level && row.section.trim().toUpperCase() === 'A' && (row.academicYear || school.academicYear) === school.academicYear);
        if (exists) { skipped += 1; continue; }
        try {
          await createClass(level, 'A', Number(school.defaultClassCapacity || 40), 1);
          created += 1;
        } catch (error) {
          if (error instanceof Error && /already exists|horay/i.test(error.message)) { skipped += 1; continue; }
          throw error;
        }
      }
      await load();
      setNotice({ kind: 'ok', text: created ? `${created} fasal ayaa lagu daray; ${skipped} hore ayay u jireen.` : 'Grade 1–8 Section A oo dhan way jiraan.' });
    } catch (error) {
      await load();
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Standard classes could not be created.' });
    } finally { setBusy(false); }
  };

  const update = async (row: SchoolClass, updates: Partial<SchoolClass>) => {
    if (isReadOnly || busyClassId) return;
    setBusyClassId(row.id); setNotice(null);
    try {
      const saved = await ApiClient.updateClass(row.id, updates);
      setRows(current => current.map(item => item.id === row.id ? saved : item));
      setNotice({ kind: 'ok', text: 'Fasalka waa la cusboonaysiiyey.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Fasalka lama cusboonaysiin karin.' });
      await load();
    } finally { setBusyClassId(null); }
  };

  const remove = async (row: SchoolClass) => {
    if (!window.confirm(`Delete ${classLabel(row)}? Existing students, marks, attendance and fee records are protected.`)) return;
    setBusyClassId(row.id); setNotice(null);
    try {
      await ApiClient.deleteClass(row.id);
      setRows(current => current.filter(item => item.id !== row.id));
      setNotice({ kind: 'ok', text: `${classLabel(row)} waa la archive-gareeyey.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Fasalka lama archive-gareyn karin.' });
    } finally { setBusyClassId(null); }
  };

  return (
    <div className="academic-setup">
      <div className="wrap">
        <AcademicSetupHeader active="sch_classes" onNavigate={onNavigate} />
        <h2>Classes &amp; Sections</h2>
        <p className="lead">Fasal kasta waa Grade iyo Section (tusaale Grade 4 · A). Fasal kasta hal shift ayuu ku jiraa, hal Form Teacherna wuu leeyahay.</p>
        {notice && <div role={notice.kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`msg ${notice.kind === 'error' ? 'bad' : 'ok'}`}>{notice.text}</div>}
        {!isReadOnly && (
          <div className="card">
            <form className="bar" onSubmit={add}>
              <div className="f">
                <label htmlFor="ng">Grade</label>
                <select id="ng" value={grade} onChange={event => setGrade(Number(event.target.value))}>
                  {[1,2,3,4,5,6,7,8].map(level => <option key={level} value={level}>Grade {level}</option>)}
                </select>
              </div>
              <div className="f">
                <label htmlFor="ns">Section</label>
                <input id="ns" type="text" maxLength={2} value={section} onChange={event => setSection(event.target.value)} style={{ width: 80 }} />
              </div>
              <div className="f">
                <label htmlFor="nc">Capacity</label>
                <input id="nc" type="number" min={1} max={200} value={capacity} onChange={event => setCapacity(event.target.value)} style={{ width: 90 }} />
              </div>
              <div className="f">
                <label htmlFor="nsh">Shift</label>
                <select id="nsh" value={shift} onChange={event => setShift(Number(event.target.value) as 1 | 2)}>
                  <option value={1}>Morning</option>
                  {shiftSettings.shiftCount === 2 && <option value={2}>Afternoon</option>}
                </select>
              </div>
              <button className="primary" type="submit" disabled={busy || loading}>Add class</button>
              <span className="spacer" />
              <button type="button" onClick={() => void addStandard()} disabled={busy || loading}>Standard: Grade 1–8</button>
            </form>
            <div className="mut">Academic year: {school?.academicYear || '—'}</div>
          </div>
        )}
        <div className="bar" style={{ alignItems: 'center', marginTop: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Class list</h2>
          <span className="spacer" />
          <span className="pill">{sortedRows.length} classes</span>
        </div>
        {loading ? <div className="loading">Loading classes…</div> : !sortedRows.length ? (
          <div className="card empty">Wali fasal lama darin. Riix "Standard: Grade 1–8".</div>
        ) : (
          <div className="card">
            <div className="scroll">
              <table>
                <thead><tr><th>Class</th><th>Level</th><th>Shift</th><th className="n">Capacity</th><th>Form Teacher</th><th className="n">Subjects</th><th className="n"> </th></tr></thead>
                <tbody>
                  {sortedRows.map(row => {
                    const free = freeTeachersFor(row);
                    const selectedTeacher = teachers.find(teacher => teacher.userId === row.classTeacherId);
                    return (
                      <tr key={row.id}>
                        <td><b>{classLabel(row)}</b></td>
                        <td className="mut">{gradeBand(row.gradeLevel)}</td>
                        <td>
                          <select value={row.shift || 1} disabled={isReadOnly || busyClassId === row.id} aria-label={`Shift ${classLabel(row)}`} onChange={event => void update(row, { shift: Number(event.target.value) as 1 | 2 })}>
                            <option value={1}>Morning</option>
                            {(shiftSettings.shiftCount === 2 || row.shift === 2) && <option value={2}>Afternoon</option>}
                          </select>
                        </td>
                        <td className="n"><input type="number" min={1} max={200} value={row.capacity} disabled={isReadOnly || busyClassId === row.id} aria-label={`Capacity ${classLabel(row)}`} onChange={event => setRows(current => current.map(item => item.id === row.id ? { ...item, capacity: Number(event.target.value) } : item))} onBlur={event => { const next = Number(event.target.value); if (Number.isInteger(next) && next >= 1 && next <= 200 && next !== row.capacity) void update(row, { capacity: next }); }} /></td>
                        <td>
                          <select value={row.classTeacherId || ''} disabled={isReadOnly || busyClassId === row.id} aria-label={`Form teacher ${classLabel(row)}`} onChange={event => void update(row, { classTeacherId: event.target.value || null })}>
                            <option value="">—</option>
                            {free.map(teacher => <option key={teacher.id} value={teacher.userId}>{teacher.fullName}</option>)}
                            {selectedTeacher && !free.some(teacher => teacher.id === selectedTeacher.id) && <option value={selectedTeacher.userId}>{selectedTeacher.fullName}</option>}
                          </select>
                        </td>
                        <td className="n">{subjectCounts[row.id] ?? 0}</td>
                        <td className="n"><button type="button" className="ghost" disabled={isReadOnly || busyClassId === row.id} aria-label={`Delete ${classLabel(row)}`} onClick={() => void remove(row)}>Delete</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
