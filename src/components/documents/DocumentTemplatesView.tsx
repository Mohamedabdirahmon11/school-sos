/**
 * Documents > Templates: editable, printable result list and attendance sheet.
 * Layout and text are saved per school (document_templates). Marks and attendance edits stay on the page:
 * only the assigned Form Teacher may write attendance, and result-list marks are not written back from here.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Save, RotateCcw, Undo2, Redo2, Plus, Trash2, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import type { SchoolClass } from '../../types/index.ts';
import {
  DEFAULT_LAYOUT, attendanceCounts, attendanceMarkFromStatus, markTotal, maxTotal, monthDays, nextAttendanceMark, paginate, parseMark,
  passThreshold, studentResultStatus, summarizeStatuses, type AttendanceMark, type LayoutConfig, type MarkValue, type ResultStatus,
  type SubjectColumn, type TemplateType
} from '../../lib/documents/template-core.ts';
import './document-templates.css';

const DEFAULT_SUBJECTS: SubjectColumn[] = ['Xisaab', 'Ingiriis', 'Soomaali', 'Cilmi', 'Bulsho', 'Diin', 'Carabi'].map((name, index) => ({ id: 's' + (index + 1), name, max: 100 }));
const DEFAULT_TEXTS: Record<TemplateType, Record<string, string>> = {
  result_list: { line1: 'Jamhuuriyadda', line2: 'Wasaaradda Waxbarashada', line3: 'Xafiiska Imtixaanaadka', title: "Go'aanka Imtixaanka", legend: 'LB = Waa Laga Baabiyey · ABS = Maqan', center: '' },
  attendance_sheet: { line1: 'Warqadda Imaanshaha Bishii', line2: '', line3: '', title: 'Imaanshaha Ardayda', legend: 'J = Joogay · M = Maqnaa', center: '' }
};
const STATUS_LABEL: Record<ResultStatus, string> = { pass: 'Gudub', fail: 'Aan gudbin', absent: 'Maqan', cancelled: 'Laga baabiyey' };

interface Row { id: string; studentId: string; name: string }
type Snapshot = { subjects: SubjectColumn[]; marks: Record<string, Record<string, string>>; attendance: Record<string, Record<string, AttendanceMark>> };

function Editable({ label, value, onCommit, className = '' }: { label: string; value: string; onCommit: (text: string) => void; className?: string }) {
  return (
    <span className={'dt-edit ' + className} contentEditable suppressContentEditableWarning role="textbox" aria-label={label}
      onBlur={event => onCommit(event.currentTarget.textContent || '')}
      onPaste={event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); }}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); (event.currentTarget as HTMLElement).blur(); } }}>
      {value}
    </span>
  );
}

/** Text that could be read as a spreadsheet formula is prefixed so CSV exports cannot run it. */
const csvCell = (value: unknown) => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};

export function DocumentTemplatesView() {
  const { school } = useAuth();
  const [type, setType] = useState<TemplateType>('attendance_sheet');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [cfg, setCfg] = useState<Record<TemplateType, LayoutConfig>>({
    result_list: { ...DEFAULT_LAYOUT, subjects: DEFAULT_SUBJECTS, texts: DEFAULT_TEXTS.result_list },
    attendance_sheet: { ...DEFAULT_LAYOUT, texts: DEFAULT_TEXTS.attendance_sheet }
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [marks, setMarks] = useState<Record<string, Record<string, string>>>({});
  const [attendance, setAttendance] = useState<Record<string, Record<string, AttendanceMark>>>({});
  const [sort, setSort] = useState<'name' | 'id' | 'total'>('name');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const history = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const stage = useRef<HTMLDivElement>(null);

  const config = cfg[type];
  const texts = { ...DEFAULT_TEXTS[type], ...config.texts };
  const patchConfig = (patch: Partial<LayoutConfig>) => setCfg(current => ({ ...current, [type]: { ...current[type], ...patch } }));
  const setText = (key: string, value: string) => patchConfig({ texts: { ...texts, [key]: value.slice(0, 400) } });

  useEffect(() => {
    ApiClient.getClasses().then(list => setClasses(Array.isArray(list) ? list.filter(item => !item.isArchived) : [])).catch(() => setMessage('Fasallada lama soo qaadi karin.'));
    ApiClient.getLayoutTemplates().then(saved => {
      setCfg(current => {
        const next = { ...current };
        for (const item of saved) {
          if (item.type === 'result_list' || item.type === 'attendance_sheet') {
            const base = item.type === 'result_list' ? DEFAULT_SUBJECTS : [];
            next[item.type] = { ...DEFAULT_LAYOUT, ...item.config, subjects: item.config?.subjects?.length ? item.config.subjects : base, texts: { ...DEFAULT_TEXTS[item.type], ...(item.config?.texts || {}) } };
          }
        }
        return next;
      });
    }).catch(() => undefined);
  }, []);

  const snapshot = useCallback((): Snapshot => JSON.parse(JSON.stringify({ subjects: config.subjects, marks, attendance })), [config.subjects, marks, attendance]);
  const remember = () => { history.current = [...history.current.slice(-19), snapshot()]; future.current = []; };
  const restore = (state: Snapshot) => { patchConfig({ subjects: state.subjects }); setMarks(state.marks); setAttendance(state.attendance); };
  const undo = () => { const last = history.current.pop(); if (!last) return; future.current.push(snapshot()); restore(last); };
  const redo = () => { const next = future.current.pop(); if (!next) return; history.current.push(snapshot()); restore(next); };

  const days = useMemo(() => { const [y, m] = month.split('-').map(Number); return y && m ? monthDays(y, m) : []; }, [month]);

  const load = async () => {
    if (!classId) { setMessage('Marka hore fasal dooro.'); return; }
    setBusy('load'); setMessage('');
    try {
      history.current = []; future.current = [];
      if (type === 'attendance_sheet') {
        const data = await ApiClient.getAttendanceSheet(classId, month);
        setRows(data.students.map(student => ({ id: student.id, studentId: student.studentId, name: student.name })));
        const next: Record<string, Record<string, AttendanceMark>> = {};
        for (const student of data.students) {
          next[student.id] = {};
          for (const [iso, status] of Object.entries(data.records[student.id] || {})) next[student.id][iso] = attendanceMarkFromStatus(status);
        }
        setAttendance(next);
      } else {
        const students = await ApiClient.getAllStudents(classId);
        setRows(students.map(student => ({ id: student.id, studentId: student.studentId, name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ') })));
        setMarks({});
      }
    } catch (error: any) {
      setMessage(error?.message || 'Xogta lama soo qaadi karin.');
    } finally { setBusy(''); }
  };

  const saveTemplate = async () => {
    setBusy('save'); setMessage('');
    try { await ApiClient.saveLayoutTemplate(type, texts.title || type, { ...config, texts }); setMessage('La kaydiyay.'); }
    catch (error: any) { setMessage(error?.message || 'Lama kaydin karin.'); }
    finally { setBusy(''); }
  };
  const resetTemplate = async () => {
    setBusy('reset');
    try {
      await ApiClient.resetLayoutTemplate(type);
      setCfg(current => ({ ...current, [type]: { ...DEFAULT_LAYOUT, subjects: type === 'result_list' ? DEFAULT_SUBJECTS : [], texts: DEFAULT_TEXTS[type] } }));
      setMessage('Template-ka waa dib loo celiyay.');
    } catch (error: any) { setMessage(error?.message || 'Dib looma celin karin.'); }
    finally { setBusy(''); }
  };

  // ---- result list calculations ----
  const subjects = config.subjects;
  const parsed = (studentId: string, subject: SubjectColumn) => parseMark(marks[studentId]?.[subject.id] ?? '', subject.max);
  const valuesFor = (studentId: string): MarkValue[] => subjects.map(subject => { const result = parsed(studentId, subject); return result.ok ? result.value : null; });
  const computed = useMemo(() => rows.map(row => {
    const values = valuesFor(row.id);
    return { row, values, total: markTotal(values), status: studentResultStatus(values, subjects, config.passRule) };
  }), [rows, marks, subjects, config.passRule]); // eslint-disable-line react-hooks/exhaustive-deps
  const sorted = useMemo(() => {
    const list = [...computed];
    if (sort === 'name') list.sort((a, b) => a.row.name.localeCompare(b.row.name));
    else if (sort === 'id') list.sort((a, b) => a.row.studentId.localeCompare(b.row.studentId, undefined, { numeric: true }));
    else list.sort((a, b) => b.total - a.total);
    return list;
  }, [computed, sort]);
  const threshold = passThreshold(config.passRule, subjects);
  const summary = summarizeStatuses(computed.map(item => item.status));

  const setMark = (studentId: string, subjectId: string, value: string) => {
    remember();
    setMarks(current => ({ ...current, [studentId]: { ...(current[studentId] || {}), [subjectId]: value } }));
  };
  const cycleAttendance = (studentId: string, iso: string) => {
    remember();
    setAttendance(current => ({ ...current, [studentId]: { ...(current[studentId] || {}), [iso]: nextAttendanceMark((current[studentId]?.[iso] || '') as AttendanceMark) } }));
  };
  const changeSubjects = (next: SubjectColumn[]) => { remember(); patchConfig({ subjects: next.slice(0, 12) }); };

  // Enter/Tab/arrows move between mark cells.
  const onGridKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('mark')) return;
    const row = Number(target.dataset.r), col = Number(target.dataset.c);
    const moves: Record<string, [number, number]> = { ArrowDown: [1, 0], Enter: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };
    const move = moves[event.key];
    if (!move) return;
    const next = stage.current?.querySelector<HTMLInputElement>(`input.mark[data-r="${row + move[0]}"][data-c="${col + move[1]}"]`);
    if (next) { event.preventDefault(); next.focus(); next.select(); }
  };

  const exportCsv = () => {
    const head = ['ID', 'Magac', ...subjects.map(subject => subject.name), 'Wadar', 'Xaalad'];
    const lines = [head, ...sorted.map(item => [item.row.studentId, item.row.name, ...subjects.map(subject => marks[item.row.id]?.[subject.id] ?? ''), item.total, STATUS_LABEL[item.status]])];
    const blob = new Blob(['﻿' + lines.map(line => line.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'natiijada.csv'; link.click();
    URL.revokeObjectURL(url);
  };

  const header = (page: number, pages: number) => (
    <>
      <div className="dt-head">
        {config.showLogo && school?.logoUrl ? <img src={school.logoUrl} alt="" /> : <span style={{ width: 48 }} />}
        <div className="dt-title">
          <div><Editable label="Qoraal 1" value={texts.line1} onCommit={value => setText('line1', value)} /></div>
          <div><Editable label="Qoraal 2" value={texts.line2} onCommit={value => setText('line2', value)} /></div>
          <div><Editable label="Qoraal 3" value={texts.line3} onCommit={value => setText('line3', value)} /></div>
          <div className="big"><Editable label="Cinwaan" value={texts.title} onCommit={value => setText('title', value)} /> · {school?.name || ''} {type === 'attendance_sheet' ? month : ''}</div>
          {classId && <div>{classes.find(item => item.id === classId)?.name}</div>}
        </div>
        <span style={{ width: 48 }} />
      </div>
      {page === 1 && type === 'result_list' && (
        <div className="dt-summary" aria-live="polite">
          <span>Wadarta Gudubku Waa {threshold} Dhibcood ama ({config.passRule.kind === 'percent' ? config.passRule.value : maxTotal(subjects) ? Math.round(threshold / maxTotal(subjects) * 100) : 0}%)</span>
          {config.showSummary && <><span>Wadar arday: {summary.total}</span><span>Gudub: {summary.pass}</span><span>Aan gudbin: {summary.fail}</span><span>Maqan: {summary.absent}</span><span>Laga baabiyey: {summary.cancelled}</span></>}
        </div>
      )}
      {page === 1 && type === 'attendance_sheet' && (() => {
        const counts = attendanceCounts(rows.flatMap(row => days.map(day => (attendance[row.id]?.[day.iso] || '') as AttendanceMark)));
        return <div className="dt-summary"><span>Wadar arday: {rows.length}</span><span>Wadar joogay (J): {counts.present}</span><span>Wadar maqnaa (M): {counts.absent}</span></div>;
      })()}
    </>
  );
  const footer = (page: number, pages: number) => config.showFooter && (
    <div className="dt-foot"><Editable label="Qoraal hoose" value={texts.legend} onCommit={value => setText('legend', value)} /><Editable label="Dhexe" value={texts.center} onCommit={value => setText('center', value)} /><span>Page {page} of {pages}</span></div>
  );

  const resultPages = paginate(sorted, config.rowsPerPage);
  const attendancePages = paginate(rows, config.rowsPerPage);

  return (
    <div className="dtv" dir="ltr" style={{ ['--dt-color' as any]: config.color, ['--dt-fs' as any]: config.fontSize + 'px' }}>
      <div className="no-print">
        <h1>Template-yada dukumentiyada</h1>
        <div className="dt-bar" role="tablist">
          <button className={'dt-btn' + (type === 'attendance_sheet' ? ' primary' : '')} role="tab" aria-selected={type === 'attendance_sheet'} onClick={() => { setType('attendance_sheet'); setRows([]); }}>Warqadda imaanshaha</button>
          <button className={'dt-btn' + (type === 'result_list' ? ' primary' : '')} role="tab" aria-selected={type === 'result_list'} onClick={() => { setType('result_list'); setRows([]); }}>Liiska natiijada</button>
        </div>
        <div className="dt-bar">
          <select aria-label="Fasal" value={classId} onChange={event => setClassId(event.target.value)}>
            <option value="">Dooro fasal</option>
            {classes.map(item => <option key={item.id} value={item.id}>{item.name}{item.section ? ' ' + item.section : ''}</option>)}
          </select>
          {type === 'attendance_sheet' && <input type="month" aria-label="Bil" value={month} onChange={event => setMonth(event.target.value)} />}
          <button className="dt-btn primary" onClick={load} disabled={busy === 'load'}>{busy === 'load' ? 'Waa la soo qaadayaa...' : 'Soo geli ardayda'}</button>
          <button className="dt-btn" onClick={undo} aria-label="Dib u laabo"><Undo2 size={16} /></button>
          <button className="dt-btn" onClick={redo} aria-label="Hore u laabo"><Redo2 size={16} /></button>
          <button className="dt-btn" onClick={saveTemplate} disabled={busy === 'save'}><Save size={16} /> Kaydi template-ka</button>
          <button className="dt-btn" onClick={resetTemplate} disabled={busy === 'reset'}><RotateCcw size={16} /> Dib u celi</button>
          {type === 'result_list' && <button className="dt-btn" onClick={exportCsv} disabled={!rows.length}><Download size={16} /> CSV</button>}
          <button className="dt-btn" onClick={() => window.print()} disabled={!rows.length}><Printer size={16} /> Daabac</button>
        </div>
        {message && <div className="dt-msg" role="status">{message}</div>}
        <details className="dt-panel">
          <summary>Beddel qaabka</summary>
          <div className="dt-grid">
            <label>Midab<input type="color" value={config.color} onChange={event => patchConfig({ color: event.target.value })} /></label>
            <label>Safaf boggiiba (5-25)<input type="number" min={5} max={25} value={config.rowsPerPage} onChange={event => patchConfig({ rowsPerPage: Math.min(25, Math.max(5, Number(event.target.value) || 20)) })} /></label>
            <label>Cabbirka qoraalka (8-16)<input type="number" min={8} max={16} value={config.fontSize} onChange={event => patchConfig({ fontSize: Math.min(16, Math.max(8, Number(event.target.value) || 11)) })} /></label>
            <label className="row"><input type="checkbox" checked={config.zebra} onChange={event => patchConfig({ zebra: event.target.checked })} /> Safaf midab kala duwan</label>
            <label className="row"><input type="checkbox" checked={config.showLogo} onChange={event => patchConfig({ showLogo: event.target.checked })} /> Tus logo</label>
            <label className="row"><input type="checkbox" checked={config.showSummary} onChange={event => patchConfig({ showSummary: event.target.checked })} /> Tus soo koobid</label>
            <label className="row"><input type="checkbox" checked={config.showFooter} onChange={event => patchConfig({ showFooter: event.target.checked })} /> Tus hoose</label>
            {type === 'result_list' && <>
              <label>Xeerka gudbinta
                <select value={config.passRule.kind} onChange={event => patchConfig({ passRule: { kind: event.target.value as any, value: event.target.value === 'percent' ? 40 : event.target.value === 'average' ? 40 : 280 } })}>
                  <option value="percent">Boqolkiiba wadarta</option><option value="average">Celcelis</option><option value="total">Wadar go'an</option>
                </select>
              </label>
              <label>Qiimaha<input type="number" min={0} max={config.passRule.kind === 'percent' ? 100 : 1200} value={config.passRule.value} onChange={event => patchConfig({ passRule: { ...config.passRule, value: Math.max(0, Number(event.target.value) || 0) } })} /></label>
              <label>Kala saar<select value={sort} onChange={event => setSort(event.target.value as any)}><option value="name">Magac</option><option value="id">ID</option><option value="total">Wadar</option></select></label>
            </>}
          </div>
          {type === 'result_list' && (
            <div>
              {subjects.map((subject, index) => (
                <div className="dt-subj" key={subject.id}>
                  <input type="text" aria-label={'Magaca maaddada ' + (index + 1)} maxLength={40} value={subject.name} onChange={event => changeSubjects(subjects.map(item => item.id === subject.id ? { ...item, name: event.target.value } : item))} />
                  <input type="number" aria-label="Dhibcaha ugu badan" min={1} max={100} value={subject.max} onChange={event => changeSubjects(subjects.map(item => item.id === subject.id ? { ...item, max: Math.min(100, Math.max(1, Number(event.target.value) || 100)) } : item))} />
                  <button className="dt-btn" aria-label="Kor u qaad" disabled={index === 0} onClick={() => { const next = [...subjects]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; changeSubjects(next); }}><ArrowUp size={14} /></button>
                  <button className="dt-btn" aria-label="Hoos u dhig" disabled={index === subjects.length - 1} onClick={() => { const next = [...subjects]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; changeSubjects(next); }}><ArrowDown size={14} /></button>
                  <button className="dt-btn" aria-label="Tirtir maaddada" disabled={subjects.length <= 1} onClick={() => changeSubjects(subjects.filter(item => item.id !== subject.id))}><Trash2 size={14} /></button>
                </div>
              ))}
              <button className="dt-btn" style={{ marginTop: 8 }} disabled={subjects.length >= 12} onClick={() => changeSubjects([...subjects, { id: 's' + Date.now().toString(36), name: 'Maaddo ' + (subjects.length + 1), max: 100 }])}><Plus size={14} /> Ku dar maaddo</button>
            </div>
          )}
        </details>
        {type === 'attendance_sheet' && <p style={{ fontSize: 12, color: '#64748b' }}>Riix unug si aad u beddesho: madhan, J, M. Isbeddelada waxay ku jiraan dukumentigan oo keliya; Form Teacher-ka fasalka ayaa keydin kara imaanshaha rasmiga ah.</p>}
        {type === 'result_list' && <p style={{ fontSize: 12, color: '#64748b' }}>Geli dhibco 0 ilaa ugu badnaan, ABS ama LB. Dhibcaha halkan lagu geliyo ma gelaan nidaamka natiijooyinka.</p>}
      </div>

      <div className="dt-scroll"><div className="dt-stage" ref={stage} onKeyDown={onGridKey}>
        {!rows.length && <div className="dt-sheet no-print" style={{ minHeight: 120, justifyContent: 'center', alignItems: 'center' }}>Fasal dooro, kadibna riix "Soo geli ardayda".</div>}
        {rows.length > 0 && type === 'result_list' && resultPages.map(page => (
          <section className="dt-sheet" key={page.page} aria-label={`Page ${page.page}`}>
            {header(page.page, page.pages)}
            <table className={'dt-table' + (config.zebra ? ' zebra' : '')}>
              <thead><tr><th>#</th><th>ID</th><th>Magac</th>{subjects.map(subject => <th key={subject.id}>{subject.name}<br /><small>/{subject.max}</small></th>)}<th>Wadar</th><th>Xaalad</th></tr></thead>
              <tbody>
                {page.rows.map((item, rowIndex) => {
                  const globalIndex = (page.page - 1) * config.rowsPerPage + rowIndex;
                  return (
                    <tr key={item.row.id} className={item.status === 'fail' || item.status === 'cancelled' ? 'fail' : ''}>
                      <td className="num">{globalIndex + 1}</td><td>{item.row.studentId}</td><td>{item.row.name}</td>
                      {subjects.map((subject, colIndex) => {
                        const result = parsed(item.row.id, subject);
                        return <td className="cell" key={subject.id}>
                          <input className={'mark' + (result.ok ? '' : ' bad')} data-r={globalIndex} data-c={colIndex} inputMode="decimal" aria-label={`${item.row.name} ${subject.name}`}
                            aria-invalid={!result.ok} title={result.ok ? '' : result.error} value={marks[item.row.id]?.[subject.id] ?? ''} onChange={event => setMark(item.row.id, subject.id, event.target.value)} />
                        </td>;
                      })}
                      <td className="num">{item.total}</td><td>{STATUS_LABEL[item.status]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {footer(page.page, page.pages)}
          </section>
        ))}
        {rows.length > 0 && type === 'attendance_sheet' && attendancePages.map(page => (
          <section className="dt-sheet" key={page.page} aria-label={`Page ${page.page}`}>
            {header(page.page, page.pages)}
            <table className={'dt-table' + (config.zebra ? ' zebra' : '')}>
              <thead><tr><th>#</th><th>Magac</th>{days.map(day => <th key={day.iso}>{day.day}</th>)}<th>J</th><th>M</th></tr></thead>
              <tbody>
                {page.rows.map((row, rowIndex) => {
                  const dayMarks = days.map(day => (attendance[row.id]?.[day.iso] || '') as AttendanceMark);
                  const counts = attendanceCounts(dayMarks);
                  return (
                    <tr key={row.id}>
                      <td className="num">{(page.page - 1) * config.rowsPerPage + rowIndex + 1}</td><td>{row.name}</td>
                      {days.map((day, index) => day.weekend
                        ? <td key={day.iso} className="cell weekend" aria-label="Fasax" />
                        : <td key={day.iso} className={'cell ' + dayMarks[index]}><button type="button" aria-label={`${row.name} ${day.iso}: ${dayMarks[index] || 'madhan'}`} onClick={() => cycleAttendance(row.id, day.iso)}>{dayMarks[index]}</button></td>)}
                      <td className="num">{counts.present}</td><td className="num">{counts.absent}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {footer(page.page, page.pages)}
          </section>
        ))}
      </div></div>
    </div>
  );
}
