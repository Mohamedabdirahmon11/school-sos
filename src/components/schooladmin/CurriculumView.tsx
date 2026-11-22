import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { SchoolClass, Subject } from '../../types/index.ts';
import { AcademicSetupHeader } from './AcademicSetupHeader.tsx';
import './academic-setup.css';

type BandKey = '1-4' | '5-6' | '7-8';
type CurriculumRow = { subjectId: string; periodsPerWeek: number };
type Capacity = { workingDays: number; lessonPeriodsPerDay: number; weeklyCapacity: number };
type Templates = Record<BandKey, string[]>;
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
const gradeBand = (grade: number): BandKey | null => grade >= 1 && grade <= 4 ? '1-4' : grade <= 6 && grade >= 5 ? '5-6' : grade >= 7 && grade <= 8 ? '7-8' : null;
const classLabel = (row: SchoolClass) => `Grade ${row.gradeLevel} · ${row.section || '—'}`;

async function fetchAllClasses(): Promise<SchoolClass[]> {
  const all: SchoolClass[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const batch = await ApiClient.request<SchoolClass[]>(`/classes?page=${page}&pageSize=100`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all.filter(row => row.isArchived !== true);
}

export const CurriculumView: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { school, isReadOnly } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [templates, setTemplates] = useState<Templates | null>(null);
  const [periodDefaults, setPeriodDefaults] = useState<Record<string, number>>({});
  const [selectedClassId, setSelectedClassId] = useState('');
  const [curriculum, setCurriculum] = useState<CurriculumRow[]>([]);
  const [capacity, setCapacity] = useState<Capacity>({ workingDays: 5, lessonPeriodsPerDay: 6, weeklyCapacity: 30 });
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const loadDetail = useCallback(async (classId: string) => {
    setDetailLoading(true);
    try {
      const detail = await ApiClient.getClassCurriculum(classId);
      setCapacity(detail.capacity);
      setCurriculum(detail.curriculum.filter(item => item.isActive).map(item => ({
        subjectId: item.subjectId, periodsPerWeek: item.periodsPerWeek
      })));
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Manhajka fasalka lama soo qaadi karin.' });
    } finally { setDetailLoading(false); }
  }, []);

  const loadBase = useCallback(async () => {
    if (!school?.id) return;
    setLoading(true);
    try {
      const [classRows, subjectRows, templateRows, periods] = await Promise.all([
        fetchAllClasses(),
        ApiClient.getSubjects(),
        ApiClient.getPrimarySubjectTemplates(),
        ApiClient.getPrimarySubjectTemplatePeriods()
      ]);
      const sorted = classRows.sort((a, b) => a.gradeLevel - b.gradeLevel || a.section.localeCompare(b.section));
      setClasses(sorted);
      setSubjects(subjectRows);
      setTemplates(templateRows);
      setPeriodDefaults(periods);
      setSelectedClassId(current => sorted.some(row => row.id === current) ? current : sorted[0]?.id || '');
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Xogta manhajka lama soo qaadi karin.' });
    } finally { setLoading(false); }
  }, [school?.id]);

  useEffect(() => { void loadBase(); }, [loadBase]);
  useEffect(() => { if (selectedClassId) void loadDetail(selectedClassId); else setCurriculum([]); }, [selectedClassId, loadDetail]);

  const selectedClass = classes.find(row => row.id === selectedClassId) || null;
  const band = selectedClass ? gradeBand(Number(selectedClass.gradeLevel)) : null;
  const availableSubjects = useMemo(() => {
    if (!band || !templates) return subjects;
    const names = templates[band];
    return names.map(name => subjects.find(subject => sameName(subject.name, name))).filter(Boolean) as Subject[];
  }, [band, templates, subjects]);
  const selectedById = useMemo(() => new Map(curriculum.map(row => [row.subjectId, row])), [curriculum]);
  const totalPeriods = curriculum.reduce((sum, row) => sum + row.periodsPerWeek, 0);
  const targets = selectedClass ? classes.filter(row =>
    row.id !== selectedClass.id &&
    Number(row.gradeLevel) === Number(selectedClass.gradeLevel) &&
    String(row.academicYear || '') === String(selectedClass.academicYear || '')
  ) : [];

  const toggleSubject = (subject: Subject, checked: boolean) => {
    setCurriculum(current => {
      if (checked) {
        if (current.some(row => row.subjectId === subject.id)) return current;
        return [...current, { subjectId: subject.id, periodsPerWeek: Number(periodDefaults[subject.name] || 2) }];
      }
      return current.filter(row => row.subjectId !== subject.id);
    });
  };

  const save = async (): Promise<boolean> => {
    if (!selectedClassId || isReadOnly) return false;
    if (totalPeriods > capacity.weeklyCapacity) {
      setNotice({ kind: 'error', text: `Wadarta waa ${totalPeriods}/${capacity.weeklyCapacity}. Yaree xiisadaha ka hor kaydinta.` });
      return false;
    }
    setBusy(true); setNotice(null);
    try {
      await ApiClient.saveClassCurriculum(selectedClassId, curriculum);
      await loadDetail(selectedClassId);
      setNotice({ kind: 'ok', text: `Manhajka ${selectedClass ? classLabel(selectedClass) : ''} waa la kaydiyey.` });
      return true;
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Manhajka lama kaydin karin.' });
      return false;
    } finally { setBusy(false); }
  };

  const reset = async () => {
    if (!selectedClass || isReadOnly) return;
    if (!window.confirm(`Reset ${classLabel(selectedClass)} to the Ethiopia grade standard? Historical marks will be preserved.`)) return;
    setBusy(true); setNotice(null);
    try {
      const result = await ApiClient.applyPrimarySubjectTemplate(selectedClass.id);
      await loadDetail(selectedClass.id);
      setNotice({ kind: 'ok', text: `Standard-ka ${result.gradeBand} waa la dabaqay; ${result.added} maaddo ayaa lagu daray.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Standard curriculum lama dabaqi karin.' });
    } finally { setBusy(false); }
  };

  const copyToSameGrade = async () => {
    if (!selectedClass || !targets.length || isReadOnly) return;
    if (!window.confirm(`Copy this curriculum to all ${targets.length} other sections of Grade ${selectedClass.gradeLevel} in the same academic year?`)) return;
    const saved = await save();
    if (!saved) return;
    setBusy(true); setNotice(null);
    try {
      const result = await ApiClient.copyClassCurriculum(selectedClass.id, targets.map(row => row.id));
      setNotice({ kind: 'ok', text: `Manhajka waxaa loo koobiyeeyey ${result.copiedClasses} section.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Manhajka lama koobiyeeyn karin.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="academic-setup">
      <div className="wrap">
        <AcademicSetupHeader active="sch_curriculum" onNavigate={onNavigate} />
        <h2>Class Curriculum</h2>
        <p className="lead">Dooro maaddooyinka fasalka iyo xiisadaha toddobaadkii. Wadarta xiisaduhu ma dhaafi karto awoodda dugsiga (5 maalmood × 6 xiisadood = 30).</p>
        {notice && <div role={notice.kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`msg ${notice.kind === 'error' ? 'bad' : 'ok'}`}>{notice.text}</div>}
        <section className="card">
          <div className="bar">
            <div className="f">
              <label htmlFor="curriculum-class">Class</label>
              <select id="curriculum-class" value={selectedClassId} disabled={loading || !classes.length} onChange={event => setSelectedClassId(event.target.value)}>
                {classes.map(row => <option key={row.id} value={row.id}>{classLabel(row)} · {row.academicYear || '—'}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => void reset()} disabled={busy || detailLoading || !selectedClass || isReadOnly}>Reset to grade standard</button>
            <button type="button" onClick={() => void copyToSameGrade()} disabled={busy || detailLoading || !selectedClass || !targets.length || isReadOnly}>Copy to all Grade {selectedClass?.gradeLevel ?? ''} sections</button>
            <span className="spacer" />
            <span className={`pill ${totalPeriods > capacity.weeklyCapacity ? 'bad' : ''}`}>{totalPeriods}/{capacity.weeklyCapacity} periods</span>
          </div>
          {loading ? <div className="loading">Loading classes…</div> : !classes.length ? (
            <div className="mut">Marka hore ku dar fasallada qaybta Classes &amp; Sections.</div>
          ) : detailLoading ? <div className="loading">Loading curriculum…</div> : (
            <div className="scroll">
              <table>
                <thead><tr><th>Subject</th><th className="n">Periods / week</th></tr></thead>
                <tbody>
                  {availableSubjects.map(subject => {
                    const current = selectedById.get(subject.id);
                    return (
                      <tr key={subject.id}>
                        <td>
                          <label className="cb">
                            <input type="checkbox" checked={Boolean(current)} disabled={busy || isReadOnly} aria-label={`Include ${subject.name}`} onChange={event => toggleSubject(subject, event.target.checked)} />
                            {subject.name}
                          </label>
                        </td>
                        <td className="n">
                          <input type="number" min={1} max={10} value={current?.periodsPerWeek ?? Number(periodDefaults[subject.name] || 2)} disabled={!current || busy || isReadOnly}
                            aria-label={`Periods per week ${subject.name}`}
                            onChange={event => setCurriculum(rows => rows.map(row => row.subjectId === subject.id ? { ...row, periodsPerWeek: Number(event.target.value) } : row))} />
                        </td>
                      </tr>
                    );
                  })}
                  {!availableSubjects.length && <tr><td colSpan={2} className="mut">Grade-kan wali ma laha subject template. Ku dar Subjects.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {!isReadOnly && <div className="bar" style={{ justifyContent: 'flex-end', marginTop: 12, marginBottom: 0 }}>
            <button type="button" className="primary" onClick={() => void save()} disabled={busy || detailLoading || loading || !selectedClass}>Save curriculum</button>
          </div>}
        </section>
      </div>
    </div>
  );
};
