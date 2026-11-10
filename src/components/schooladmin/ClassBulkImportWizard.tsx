import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, LoaderCircle, Upload, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

type ClassImportRow = { className: string; gradeLevel: string; section: string; branch: string; roomNumber: string; capacity: string; monthlyFee: string };

export const ClassBulkImportWizard: React.FC<{ open: boolean; onClose: () => void; onComplete: () => void }> = ({ open, onClose, onComplete }) => {
  const { t } = useAuth();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ClassImportRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const downloadTemplate = () => {
    const csv = [
      'className,gradeLevel,section,branch,roomNumber,capacity,monthlyFee',
      'KG,KG,A,,KG-A,40,0',
      'KG,KG,B,,KG-B,40,0',
      'Grade 1,1,A,,Room 101,40,0',
      'Grade 1,1,B,,Room 102,40,0',
      'Grade 2,2,A,,Room 201,40,0',
      'Grade 2,2,B,,Room 202,40,0',
      'Grade 3,3,A,,Room 301,40,0',
      'Grade 3,3,B,,Room 302,40,0',
      'Grade 4,4,A,,Room 401,40,0',
      'Grade 4,4,B,,Room 402,40,0',
      'Grade 5,5,A,,Room 501,40,0',
      'Grade 5,5,B,,Room 502,40,0'
    ].join('\\r\\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'schoolos-class-import-template.csv'; anchor.click(); URL.revokeObjectURL(url);
  };
  const chooseFile = async (file?: File) => {
    if (!file) return;
    setError(''); setRows([]); setFileName('');
    if (file.size > 5 * 1024 * 1024) { setError('File exceeds the 5 MB limit.'); return; }
    if (!/\.(csv|xlsx)$/i.test(file.name)) { setError('Choose a CSV or XLSX file.'); return; }
    setFileName(file.name);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('The file has no worksheet.');
      const values = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (!values.length || values.length > 500) throw new Error('The file must contain 1–500 class rows.');
      setRows(values.map(value => ({
        className: String(value.className ?? '').trim(),
        gradeLevel: String(value.gradeLevel ?? '').trim(),
        section: String(value.section ?? '').trim(),
        branch: String(value.branch ?? '').trim(),
        roomNumber: String(value.roomNumber ?? '').trim(),
        capacity: String(value.capacity ?? '40').trim(),
        monthlyFee: String(value.monthlyFee ?? '0').trim()
      })));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not read the file.'); }
  };
  const importRows = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/classes/bulk-import', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classes: rows }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Class import failed.');
      onComplete(); onClose(); setRows([]); setFileName('');
      window.alert(`Imported ${body.count} classes successfully.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Class import failed.'); }
    finally { setLoading(false); }
  };
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><section role="dialog" aria-modal="true" aria-label="Bulk import classes" className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl">
    <header className="flex items-center justify-between border-b pb-3"><div><h2 className="font-bold text-lg">Bulk Import Classes</h2><p className="text-xs text-slate-500">Upload a CSV or XLSX file with class details.</p></div><button onClick={onClose} aria-label="Close"><X className="h-5 w-5"/></button></header>
    {error && <p role="alert" className="mt-3 rounded bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <div className="mt-4 flex flex-wrap items-center gap-3"><button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"><Download className="h-4 w-4"/>Download CSV template</button><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white"><FileSpreadsheet className="h-4 w-4"/>{fileName || 'Choose CSV / XLSX'}<input className="sr-only" type="file" accept=".csv,.xlsx" onChange={event => void chooseFile(event.target.files?.[0])}/></label></div>
    {rows.length > 0 && <><p className="mt-4 text-sm font-semibold">{rows.length} class rows ready to import</p><div className="mt-2 max-h-72 overflow-auto rounded border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50"><tr>{['Class','Grade','Section','Branch','Room','Capacity','Monthly Fee'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index} className="border-t"><td className="p-2">{row.className}</td><td className="p-2">{row.gradeLevel}</td><td className="p-2">{row.section}</td><td className="p-2">{row.branch || '—'}</td><td className="p-2">{row.roomNumber || '—'}</td><td className="p-2">{row.capacity}</td><td className="p-2">{row.monthlyFee}</td></tr>)}</tbody></table></div></>}
    <footer className="mt-5 flex justify-end gap-2 border-t pt-4"><button onClick={onClose} className="rounded-lg border px-4 py-2 text-xs">Cancel</button><button onClick={() => void importRows()} disabled={!rows.length || loading} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading && <LoaderCircle className="h-4 w-4 animate-spin"/>}<Upload className="h-4 w-4"/>Import Classes</button></footer>
  </section></div>;
};
