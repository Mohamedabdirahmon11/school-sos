import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { Subject } from '../../types/index.ts';
import { AcademicSetupHeader } from './AcademicSetupHeader.tsx';
import './academic-setup.css';

type BandKey = '1-4' | '5-6' | '7-8';
type Templates = Record<BandKey, string[]>;
type PeriodMap = Record<string, number>;
type Band = { key: BandKey; label: string };
const BANDS: Band[] = [
  { key: '1-4', label: 'Grade 1–4' },
  { key: '5-6', label: 'Grade 5–6' },
  { key: '7-8', label: 'Grade 7–8' }
];
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
const hasName = (names: string[], name: string) => names.some(item => sameName(item, name));
const cloneTemplates = (value: Templates): Templates => ({ '1-4': [...value['1-4']], '5-6': [...value['5-6']], '7-8': [...value['7-8']] });

export const SubjectsView: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { school, isReadOnly } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [templates, setTemplates] = useState<Templates | null>(null);
  const [draftTemplates, setDraftTemplates] = useState<Templates | null>(null);
  const [periods, setPeriods] = useState<PeriodMap>({});
  const [draftPeriods, setDraftPeriods] = useState<PeriodMap>({});
  const [defaults, setDefaults] = useState<{ templates: Templates; periods: PeriodMap } | null>(null);
  const [newName, setNewName] = useState('');
  const [newPeriods, setNewPeriods] = useState(2);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!school?.id) return;
    setLoading(true);
    try {
      const [subjectRows, savedTemplates, savedPeriods, standard] = await Promise.all([
        ApiClient.getSubjects(),
        ApiClient.getPrimarySubjectTemplates(),
        ApiClient.getPrimarySubjectTemplatePeriods(),
        ApiClient.getEthiopiaPrimaryDefaults()
      ]);
      setSubjects(subjectRows);
      setTemplates(cloneTemplates(savedTemplates));
      setDraftTemplates(cloneTemplates(savedTemplates));
      setPeriods({ ...savedPeriods });
      setDraftPeriods({ ...savedPeriods });
      setDefaults({ templates: cloneTemplates(standard.templates), periods: { ...standard.periods } });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Maaddooyinka lama soo qaadi karin.' });
    } finally { setLoading(false); }
  }, [school?.id]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => [...subjects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), [subjects]);

  const dirtyBands = useMemo(() => {
    if (!templates || !draftTemplates) return [] as BandKey[];
    const changedPeriods = new Set(Object.keys(draftPeriods).filter(name => Number(draftPeriods[name]) !== Number(periods[name])));
    return BANDS.map(band => band.key).filter(band => {
      const before = templates[band], after = draftTemplates[band];
      const templateChanged = before.length !== after.length || before.some((name, index) => !sameName(name, after[index] || ''));
      const periodChanged = after.some(name => changedPeriods.has(name));
      return templateChanged || periodChanged;
    });
  }, [templates, draftTemplates, periods, draftPeriods]);

  const addSubject = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (!Number.isInteger(newPeriods) || newPeriods < 1 || newPeriods > 10) {
      setNotice({ kind: 'error', text: 'Xiisadaha maaddadu waa inay u dhexeeyaan 1 ilaa 10.' });
      return;
    }
    if (subjects.some(subject => sameName(subject.name, name))) {
      setNotice({ kind: 'error', text: 'Maaddadan hore ayay uga jirtaa dugsigan.' });
      return;
    }
    setBusy(true); setNotice(null);
    try {
      const created = await ApiClient.addSubject({ name, code: '' });
      setSubjects(current => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setDraftPeriods(current => ({ ...current, [created.name]: newPeriods }));
      setNewName('');
      setNotice({ kind: 'ok', text: `${created.name} waa lagu daray. Calaamadee level-ka ay khusayso, kadib kaydi.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Maaddada lama abuuri karin.' });
    } finally { setBusy(false); }
  };

  const save = async (nextTemplates = draftTemplates, nextPeriods = draftPeriods, bands = dirtyBands): Promise<boolean> => {
    if (!nextTemplates || !bands.length || isReadOnly) return false;
    setBusy(true); setNotice(null);
    try {
      const result = await ApiClient.savePrimarySubjectTemplates(nextTemplates, nextPeriods, bands);
      setTemplates(cloneTemplates(result.templates));
      setDraftTemplates(cloneTemplates(result.templates));
      setPeriods({ ...result.periods });
      setDraftPeriods({ ...result.periods });
      setNotice({ kind: 'ok', text: `Subjects, curricula iyo teacher assignments waa la waafajiyey (${result.updatedClasses} fasal).` });
      return true;
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Template-ka lama kaydin karin.' });
      return false;
    } finally { setBusy(false); }
  };

  const reset = () => {
    if (!defaults) return;
    if (!resetArmed) {
      setResetArmed(true);
      window.setTimeout(() => setResetArmed(false), 3500);
      return;
    }
    setResetArmed(false);
    setDraftTemplates(cloneTemplates(defaults.templates));
    setDraftPeriods({ ...defaults.periods });
    setNotice({ kind: 'ok', text: 'Ethiopia standard waa la doortay. Riix Save template changes si loo waafajiyo fasallada.' });
  };

  const remove = async (subject: Subject) => {
    if (!draftTemplates) return;
    if (!window.confirm(`Remove ${subject.name} from all grade-band templates? Historical marks will be preserved.`)) return;
    const nextTemplates: Templates = {
      '1-4': draftTemplates['1-4'].filter(name => !sameName(name, subject.name)),
      '5-6': draftTemplates['5-6'].filter(name => !sameName(name, subject.name)),
      '7-8': draftTemplates['7-8'].filter(name => !sameName(name, subject.name))
    };
    const bands = BANDS.map(band => band.key).filter(band => draftTemplates[band].some(name => sameName(name, subject.name)));
    if (!bands.length) {
      try { await ApiClient.deleteSubject(subject.id); setSubjects(current => current.filter(item => item.id !== subject.id)); setNotice({ kind: 'ok', text: 'Maaddada waa la tirtiray.' }); }
      catch { setNotice({ kind: 'error', text: 'Maaddadani waxay ku jirtaa natiijooyin ama diiwaanno hore; xogteeda waa la ilaaliyey.' }); }
      return;
    }
    const synchronized = await save(nextTemplates, draftPeriods, bands);
    if (!synchronized) return;
    // Curriculum links are deactivated and teacher assignments detached by the
    // template sync. Keep the subject row when marks/history still reference it.
    try {
      await ApiClient.deleteSubject(subject.id);
      setSubjects(current => current.filter(item => item.id !== subject.id));
      setNotice({ kind: 'ok', text: 'Maaddada iyo xiriirradii firfircoonaa waa laga saaray.' });
    } catch {
      setNotice({ kind: 'ok', text: 'Maaddada waxaa laga saaray manhajka iyo qoondaynta; diiwaanka waxaa loo reebay ilaalinta natiijooyinkii hore.' });
    }
    setDraftTemplates(nextTemplates);
    setTemplates(nextTemplates);
  };

  const totals = useMemo(() => {
    if (!draftTemplates) return {} as Record<BandKey, number>;
    return Object.fromEntries(BANDS.map(band => [
      band.key,
      draftTemplates[band.key].reduce((sum, name) => sum + Number(draftPeriods[name] ?? periods[name] ?? 2), 0)
    ])) as Record<BandKey, number>;
  }, [draftTemplates, draftPeriods, periods]);

  if (loading) return <div className="academic-setup"><div className="wrap"><AcademicSetupHeader active="sch_subjects" onNavigate={onNavigate} /><div className="loading">Loading subjects…</div></div></div>;

  return (
    <div className="academic-setup">
      <div className="wrap">
        <AcademicSetupHeader active="sch_subjects" onNavigate={onNavigate} />
        <h2>Subjects</h2>
        <p className="lead">Template-ka Ethiopia Primary: maaddo kasta waxay ku jirtaa level kasta oo aad calaamadayso, waxayna si toos ah ugu darmaysaa fasallada level-kaas. Dugsi kasta wuu beddeli karaa.</p>
        {notice && <div role={notice.kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`msg ${notice.kind === 'error' ? 'bad' : 'ok'}`}>{notice.text}</div>}
        <section className="card">
          {!isReadOnly && (
            <form className="bar" onSubmit={addSubject}>
              <div className="f">
                <label htmlFor="sn">Maaddo cusub</label>
                <input id="sn" type="text" maxLength={150} value={newName} onChange={event => setNewName(event.target.value)} placeholder="tusaale Quraan" />
              </div>
              <div className="f">
                <label htmlFor="sp">Xiisad/toddobaad</label>
                <input id="sp" type="number" min={1} max={10} value={newPeriods} onChange={event => setNewPeriods(Number(event.target.value))} style={{ width: 90 }} />
              </div>
              <button className="primary" type="submit" disabled={busy || !newName.trim()}>Add subject</button>
              <span className="spacer" />
              <button type="button" onClick={reset} disabled={busy || !defaults}>{resetArmed ? 'Click again to confirm' : 'Reset to Ethiopia standard'}</button>
              <button type="button" className="primary" onClick={() => void save()} disabled={busy || !dirtyBands.length}>Save template changes</button>
            </form>
          )}
          <div className="bar" style={{ alignItems: 'center' }}>
            {BANDS.map(band => <span key={band.key} className={`pill ${totals[band.key] > 30 ? 'bad' : ''}`}>{band.label}: {totals[band.key] || 0}/30</span>)}
            <span className="spacer" />
            <span className="mut">Conduct is not a subject. Arabic and Islamic Studies/Quraan are optional.</span>
          </div>
          <div className="scroll">
            <table>
              <thead><tr><th>Subject</th><th>Levels</th><th className="n">Periods / week</th><th></th></tr></thead>
              <tbody>
                {visible.map(subject => (
                  <tr key={subject.id}>
                    <td><b>{subject.name}</b></td>
                    <td>
                      {BANDS.map(band => (
                        <label key={band.key} className="cb">
                          <input type="checkbox" checked={Boolean(draftTemplates?.[band.key] && hasName(draftTemplates[band.key], subject.name))} disabled={isReadOnly || busy}
                            aria-label={`${subject.name} ${band.label}`}
                            onChange={event => setDraftTemplates(current => {
                              if (!current) return current;
                              const names = [...current[band.key]];
                              const index = names.findIndex(name => sameName(name, subject.name));
                              if (event.target.checked && index < 0) names.push(subject.name);
                              if (!event.target.checked && index >= 0) names.splice(index, 1);
                              return { ...current, [band.key]: names };
                            })} />
                          {band.label}
                        </label>
                      ))}
                    </td>
                    <td className="n">
                      <input type="number" min={1} max={10} value={draftPeriods[subject.name] ?? periods[subject.name] ?? 2} disabled={isReadOnly || busy}
                        aria-label={`Periods per week ${subject.name}`}
                        onChange={event => setDraftPeriods(current => ({ ...current, [subject.name]: Number(event.target.value) }))} />
                    </td>
                    <td><button type="button" className="ghost" disabled={isReadOnly || busy} aria-label={`Delete ${subject.name}`} onClick={() => void remove(subject)}>Delete</button></td>
                  </tr>
                ))}
                {!visible.length && <tr><td colSpan={4} className="mut">Maaddo lama helin.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
