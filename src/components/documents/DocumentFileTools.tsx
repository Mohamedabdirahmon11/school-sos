import React, { useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileUp, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { sanitizeDocumentHtml } from '../../lib/documents/sanitize-html.ts';
import { docxBlobToHtml, htmlToDocxBlob } from '../../lib/documents/docx.ts';
import { escapeSpreadsheetHtml, rowsToCsv } from '../../lib/documents/spreadsheet.ts';

type Props = { html:string; title:string; onImport:(html:string)=>void };
const tableHtml=(rows:unknown[][])=>'<table><tbody>'+rows.map((row,index)=>'<tr>'+row.map(cell=>index===0?'<th>'+escapeSpreadsheetHtml(cell)+'</th>':'<td>'+escapeHtml(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table><p><br></p>';
const download=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();URL.revokeObjectURL(url);};
const baseName=(title:string)=>title.trim().replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,60)||'school-document';

export const DocumentFileTools:React.FC<Props>=({html,title,onImport})=>{
  const importRef=useRef<HTMLInputElement>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const importFile=async(file?:File)=>{
    if(!file)return;
    if(file.size>15*1024*1024){setMessage('Faylku waa inuu ka yaraadaa 15 MB.');if(importRef.current)importRef.current.value='';return;}
    setBusy(true);setMessage('');
    try{
      const extension=file.name.split('.').pop()?.toLowerCase();
      let imported='';
      if(extension==='docx') imported=await docxBlobToHtml(file);
      else if(extension==='csv'||extension==='xlsx'||extension==='xls'){
        const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
        imported=workbook.SheetNames.map(name=>{
          const rows=XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name],{header:1,raw:false,defval:''});
          return '<h2>'+escapeHtml(name)+'</h2>'+tableHtml(rows);
        }).join('');
      }else throw new Error('Fayl noocan ah lama taageero. Dooro DOCX, XLSX ama CSV.');
      if(!imported.trim())throw new Error('Faylka wax xog ah kuma jirto.');
      onImport(sanitizeDocumentHtml(imported));
      setMessage('Faylka waa la soo geliyey. Kaydi dukumentiga si isbeddelku u haro.');
    }catch(error){setMessage(error instanceof Error?error.message:'Faylka lama akhrin karin.');}
    finally{setBusy(false);if(importRef.current)importRef.current.value='';}
  };
  const parseTables=()=>{
    const parsed=new DOMParser().parseFromString('<div>'+html+'</div>','text/html');
    return Array.from(parsed.querySelectorAll('table')).map(table=>
      Array.from(table.rows).map(row=>Array.from(row.cells).map(cell=>cell.innerText.trim()))
    );
  };
  const exportXlsx=()=>{
    const tables=parseTables();
    if(!tables.length){setMessage('Ku dar jadwal dukumentiga ka hor XLSX export.');return;}
    const workbook=XLSX.utils.book_new();
    tables.forEach((rows,index)=>XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'Jadwal '+(index+1)));
    XLSX.writeFile(workbook,baseName(title)+'.xlsx');setMessage('XLSX waa la soo dejiyey.');
  };
  const exportCsv=()=>{
    const rows=parseTables()[0];
    if(!rows){setMessage('Ku dar jadwal dukumentiga ka hor CSV export.');return;}
    const csv=rowsToCsv(rows);
    download(new Blob([csv],{type:'text/csv;charset=utf-8'}),baseName(title)+'.csv');setMessage('CSV waa la soo dejiyey (jadwalka koowaad).');
  };
  const exportDocx=()=>{
    try{download(htmlToDocxBlob(html,title),baseName(title)+'.docx');setMessage('DOCX waa la soo dejiyey.');}
    catch(error){setMessage(error instanceof Error?error.message:'DOCX lama samayn karin.');}
  };
  return <section className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3" aria-label="Soo dejin iyo gelin faylal">
    <div className="mr-2 flex items-center gap-2 text-xs font-semibold text-slate-700"><FileSpreadsheet size={16}/> Faylal & jadwallo</div>
    <input ref={importRef} type="file" accept=".docx,.xlsx,.xls,.csv" className="hidden" onChange={event=>void importFile(event.target.files?.[0])}/>
    <button type="button" disabled={busy} onClick={()=>importRef.current?.click()} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"><FileUp size={14}/>{busy?'Waa la akhrinayaa…':'Soo geli DOCX / XLSX / CSV'}</button>
    <button type="button" onClick={exportDocx} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"><FileText size={14}/> Soo dejiso DOCX</button>
    <button type="button" onClick={exportXlsx} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"><Download size={14}/> Soo dejiso XLSX</button>
    <button type="button" onClick={exportCsv} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"><Download size={14}/> Soo dejiso CSV</button>
    {message&&<p className="w-full text-xs text-slate-600" role="status">{message}</p>}
    <p className="w-full text-[11px] text-slate-500">XLSX wuxuu jadwal kasta u sameeyaa sheet gaar ah; CSV wuxuu soo saaraa jadwalka koowaad. Soo gelintu waxay beddelaysaa qoraalka hadda furan.</p>
  </section>;
};
