import React, { useEffect, useMemo, useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { SchoolClass } from '../../types/index.ts';

type TermRow = { id: string; name: string; academic_year_id: string; start_date: string; end_date: string; status: 'open'|'closed' };
type Structure = { id: string; term_id: string; class_id: string|null; exam_max: number; rest_mode: 'single'|'quizzes'; quiz_count: number; components: Array<{id:string;kind:string;name:string;max_marks:number;seq:number}> };
type ResultRow = { student_id: string; student_code: string; name: string; average: number|null; grade: string; complete: boolean; rank: number; subjects: Array<{subject_id:string;subject:string;total:number;percentage:number;grade:string;entered:number;required:number}> };
type ReportCard = { id:string; student_id:string; yearly_average:number; overall_grade:string; rank_in_class:number; subject_results:any[]; teacher_comment?:string; head_comment?:string; published_at?:string|null; student?:{first_name:string;middle_name:string;last_name:string;student_id:string}|null };

export const TermMarksWorkspace: React.FC<{classes:SchoolClass[]}> = ({classes}) => {
  const [terms,setTerms] = useState<TermRow[]>([]);
  const [termId,setTermId] = useState('');
  const [classId,setClassId] = useState('');
  const [examMax,setExamMax] = useState(60);
  const [restMode,setRestMode] = useState<'single'|'quizzes'>('quizzes');
  const [quizCount,setQuizCount] = useState(4);
  const [structures,setStructures] = useState<Structure[]>([]);
  const [results,setResults] = useState<ResultRow[]>([]);
  const [missing,setMissing] = useState<any[]>([]);
  const [cards,setCards] = useState<ReportCard[]>([]);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');

  const term = terms.find(row=>row.id===termId);
  const rest = 100-examMax;
  const count = restMode==='single'?1:quizCount;
  const valid = Number.isInteger(count)&&count>=1&&count<=20&&rest%count===0;
  const components = useMemo(()=>[
    {name:'Imtixaanka Term-ka',max:examMax,kind:'exam'},
    ...(restMode==='single'?[{name:'Qiimayn joogto ah',max:rest,kind:'single'}]:
      Array.from({length:Math.max(0,Math.min(20,quizCount))},(_,i)=>({name:'Quiz '+(i+1),max:valid?rest/count:0,kind:'quiz'})))
  ],[examMax,rest,restMode,quizCount,valid,count]);

  const loadTerms = async () => {
    try {
      const rows = await ApiClient.request<TermRow[]>('/term-marks/terms');
      setTerms(rows);
      if (!termId && rows.length) setTermId(rows.find(row=>row.status==='open')?.id || rows[0].id);
    } catch(e:any) { setError(e.message||'Term-yada lama soo gelin.'); }
  };
  const loadStructures = async () => {
    if(!termId) return;
    try { setStructures(await ApiClient.request<Structure[]>(`/term-marks/structures?termId=${encodeURIComponent(termId)}${classId?'&classId='+encodeURIComponent(classId):''}`)); }
    catch(e:any) { setError(e.message||'Qaabka dhibcaha lama soo gelin.'); }
  };
  const loadResults = async () => {
    if(!termId||!classId) return;
    setBusy(true); setError('');
    try { const data=await ApiClient.request<{rows:ResultRow[];missingMarks:any[]}>(`/term-marks/results?termId=${encodeURIComponent(termId)}&classId=${encodeURIComponent(classId)}`);
      setResults(data.rows||[]); setMissing(data.missingMarks||[]);
    } catch(e:any) { setError(e.message||'Natiijooyinka lama soo gelin.'); }
    finally { setBusy(false); }
  };
  const loadCards = async () => {
    if(!term?.academic_year_id||!classId) return;
    try { setCards(await ApiClient.request<ReportCard[]>(`/term-marks/report-cards?classId=${encodeURIComponent(classId)}&academicYearId=${encodeURIComponent(term.academic_year_id)}`)); }
    catch(e:any) { setError(e.message||'Report Cards lama soo gelin.'); }
  };
  useEffect(()=>{ void loadTerms(); },[]);
  useEffect(()=>{ void loadStructures(); },[termId,classId]);
  useEffect(()=>{ setResults([]);setMissing([]);setCards([]); },[termId,classId]);

  const saveStructure = async () => {
    if(!termId||!valid) return;
    setBusy(true);setError('');setNotice('');
    try {
      await ApiClient.request('/term-marks/structures',{method:'PUT',body:JSON.stringify({termId,classId:classId||null,examMax,restMode,quizCount:restMode==='single'?1:quizCount})});
      setNotice('Qaabka dhibcaha waa la kaydiyey; wadartu waa 100/100.');
      await loadStructures();
    } catch(e:any) { setError(e.message||'Qaabka dhibcaha lama kaydin.'); }
    finally { setBusy(false); }
  };
  const setTermStatus = async (status:'open'|'closed') => {
    if(!termId) return;
    setBusy(true);setError('');setNotice('');
    try {
      await ApiClient.request(`/term-marks/terms/${termId}/status`,{method:'POST',body:JSON.stringify({status})});
      setTerms(rows=>rows.map(row=>row.id===termId?{...row,status}:row));
      setNotice(status==='closed'?'Term-ka waa la xiray. Macallimiintu hadda ma gelin karaan dhibco.':'Term-ka dib ayaa loo furay; Report Cards-kii hore si ammaan ah ayaa looga saaray daabacaadda.');
      if(status==='open') await loadCards();
    } catch(e:any) { setError(e.message||'Xaaladda term-ka lama beddelin.'); }
    finally { setBusy(false); }
  };
  const generateCards = async () => {
    if(!term?.academic_year_id||!classId) return;
    setBusy(true);setError('');setNotice('');
    try {
      const result=await ApiClient.request<any>('/term-marks/report-cards/generate',{method:'POST',body:JSON.stringify({academicYearId:term.academic_year_id,classId})});
      setNotice(`Report Cards waa la diyaariyey: ${result.generated_count||0} arday.`);
      await loadCards();
    } catch(e:any) { setError(e.message||'Report Cards lama samayn. Hubi in labada term xiran yihiin.'); }
    finally { setBusy(false); }
  };
  const togglePublish = async (card:ReportCard) => {
    setBusy(true);setError('');
    try {
      await ApiClient.request(`/term-marks/report-cards/${card.id}`,{method:'PATCH',body:JSON.stringify({published:!card.published_at})});
      await loadCards();
    } catch(e:any) { setError(e.message||'Daabacaadda Report Card-ka way fashilantay.'); }
    finally { setBusy(false); }
  };
  const saveComment = async (cardId:string, field:'teacherComment'|'headComment', value:string) => {
    try { await ApiClient.request(`/term-marks/report-cards/${cardId}`,{method:'PATCH',body:JSON.stringify({[field]:value})}); setNotice('Faallada Report Card-ka waa la kaydiyey.'); }
    catch(e:any) { setError(e.message||'Faallada lama kaydin.'); }
  };
  const selectedStructure=structures.find(row=>row.class_id===classId)||structures.find(row=>row.class_id===null);
  const yearTerms=terms.filter(row=>row.academic_year_id===term?.academic_year_id);
  const bothClosed=yearTerms.length===2&&yearTerms.every(row=>row.status==='closed');

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <div><h2 className="text-lg font-bold text-slate-900">Qaabka dhibcaha</h2><p className="text-sm text-slate-500">Term kasta maaddo walba waxay ka kooban tahay 100 dhibcood.</p></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold text-slate-600">Term
          <select value={termId} onChange={e=>setTermId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm">{terms.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Fasal (madhan = dugsi dhan)
          <select value={classId} onChange={e=>setClassId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"><option value="">Dhammaan dugsiga</option>{classes.map(row=><option key={row.id} value={row.id}>{row.name} {row.section}</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Imtixaanka Term-ka
          <select value={examMax} onChange={e=>setExamMax(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"><option value={50}>50 dhibcood</option><option value={60}>60 dhibcood</option></select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Qaybta hartay
          <select value={restMode} onChange={e=>setRestMode(e.target.value as any)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"><option value="single">Hal qiimayn</option><option value="quizzes">Quizzes isle'eg</option></select>
        </label>
      </div>
      {restMode==='quizzes'&&<label className="block max-w-xs text-xs font-semibold text-slate-600">Tirada quizzes-ka
        <input type="number" min={1} max={20} value={quizCount} onChange={e=>setQuizCount(Math.max(1,Math.min(20,Number(e.target.value)||1)))} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"/>
      </label>}
      <div className="rounded-xl bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-slate-800">Qaybaha dhibcaha</strong><strong className={valid?'text-emerald-700':'text-rose-700'}>{valid?100:rest} / 100</strong></div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {components.map((item,i)=><div key={item.name} className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{item.name}</p><p className="mt-1 text-lg font-bold text-slate-900">{item.max} <span className="text-xs font-medium text-slate-400">dhibcood</span></p></div>)}
        </div>
        {!valid&&<p className="mt-2 text-xs text-rose-700">Tirada quizzes-ka waa inay si sax ah u qaybisaa {rest} dhibcood.</p>}
      </div>
      {selectedStructure&&<p className="text-xs text-slate-500">Qaab hore ayaa jira: imtixaan {selectedStructure.exam_max}, {selectedStructure.rest_mode==='single'?'hal qiimayn':selectedStructure.quiz_count+' quiz'}.</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy||!valid||!termId||term?.status==='closed'} onClick={()=>void saveStructure()} className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy?'Kaydinaya…':'Kaydi qaabka dhibcaha'}</button>
        {term&&<button disabled={busy} onClick={()=>void setTermStatus(term.status==='open'?'closed':'open')} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40">{term.status==='open'?'Xir Term-ka':'Dib u fur Term-ka'}</button>}
      </div>
      {term&&<p className="text-xs text-slate-500">Xaaladda hadda: <strong>{term.status==='open'?'Furan':'Xiran'}</strong></p>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold text-slate-900">Natiijada Term-ka</h2><p className="text-xs text-slate-500">Natiijooyinka fasalka, celceliska, darajada iyo dhibcaha maqan.</p></div><button disabled={busy||!classId||!termId} onClick={()=>void loadResults()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40">Soo bandhig natiijooyinka</button></div>
      {!classId&&<p className="text-sm text-slate-500">Dooro fasal si aad u aragto natiijooyinka.</p>}
      {results.length>0&&<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-2">Arday</th>{(results[0].subjects||[]).map(subject=><th key={subject.subject_id} className="p-2">{subject.subject}<span className="block text-[10px]">/100</span></th>)}<th className="p-2">Celcelis</th><th className="p-2">Grade</th><th className="p-2">Darajo</th><th className="p-2">Xaalad</th></tr></thead><tbody>{results.map(row=><tr key={row.student_id} className="border-t border-slate-100"><td className="p-2"><strong>{row.name}</strong><span className="block text-xs text-slate-400">{row.student_code}</span></td>{(results[0].subjects||[]).map(subject=>{const mark=row.subjects.find(item=>item.subject_id===subject.subject_id);return <td key={subject.subject_id} className="p-2 tabular-nums">{mark?.total??'—'}</td>;})}<td className="p-2 tabular-nums font-semibold">{row.average??'—'}/100</td><td className="p-2">{row.grade}</td><td className="p-2">#{row.rank||'—'}</td><td className="p-2">{row.complete?'Dhammaystiran':'Dhibco ayaa maqan'}</td></tr>)}</tbody></table></div>}
      {missing.length>0&&<div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><strong className="text-sm text-amber-900">Dhibcaha maqan</strong>{missing.map(row=><p key={row.teacherId+':'+row.subjectId} className="mt-1 text-xs text-amber-800">{row.teacherName||'Macallin aan la aqoonsan'} · {row.subjectId}: {row.missing} dhibcood oo maqan</p>)}</div>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold text-slate-900">Report Card-ka sannadlaha</h2><p className="text-xs text-slate-500">Waxaa la abuuri karaa marka Term 1 iyo Term 2 labaduba xirmaan.</p></div><span className={bothClosed?'text-emerald-700':'text-amber-700'}>{bothClosed?'Labada term way xiran yihiin':'Sug labada term inay xirmaan'}</span></div>
      <div className="flex flex-wrap gap-2"><button disabled={busy||!classId||!bothClosed} onClick={()=>void generateCards()} className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Samee Report Cards</button><button disabled={!cards.length||!term?.academic_year_id} onClick={()=>ApiClient.downloadTermReportCardsPdf(classId,term!.academic_year_id)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">PDF fasalka oo dhan</button><button disabled={!classId} onClick={()=>void loadCards()} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Soo celi cards</button></div>
      {cards.map(card=><div key={card.id} className="space-y-3 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><strong className="text-sm">{[card.student?.first_name,card.student?.middle_name,card.student?.last_name].filter(Boolean).join(' ')||card.student_id}</strong><p className="text-xs text-slate-500">Celcelis {card.yearly_average}/100 · Grade {card.overall_grade} · Darajo #{card.rank_in_class}</p></div><div className="flex gap-2"><button onClick={()=>ApiClient.downloadTermReportCardPdf(card.student_id)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold">PDF</button><button disabled={busy} onClick={()=>void togglePublish(card)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold">{card.published_at?'Ka noqo daabacaadda':'Daabac'}</button></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">Maaddo</th><th className="p-2">Term 1</th><th className="p-2">Term 2</th><th className="p-2">Sanad</th><th className="p-2">Grade</th></tr></thead><tbody>{(card.subject_results||[]).map((subject:any)=><tr key={subject.subject_id} className="border-t border-slate-100"><td className="p-2">{subject.subject}</td><td className="p-2">{subject.term1}</td><td className="p-2">{subject.term2}</td><td className="p-2 font-semibold">{subject.yearly}</td><td className="p-2">{subject.grade||'—'}</td></tr>)}</tbody></table></div>
        <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Faallada macallinka<input defaultValue={card.teacher_comment||''} maxLength={2000} onBlur={e=>void saveComment(card.id,'teacherComment',e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal"/></label><label className="text-xs font-semibold text-slate-600">Faallada maamulaha<input defaultValue={card.head_comment||''} maxLength={2000} onBlur={e=>void saveComment(card.id,'headComment',e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal"/></label></div>
      </div>)}
    </section>
    {notice&&<p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error&&<p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  </div>;
};
