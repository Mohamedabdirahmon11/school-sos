import React from 'react';
import { groupExamRoomSessions } from '../../lib/exam-timetable.ts';
import { School } from '../../types/index.ts';

type ExamScheduleRow = { id:string; subjectId:string; subjectName?:string; examDate:string; startTime:string; endTime:string; examName?:string; examType?:string; semester?:string; roomName?:string; status:string; };
type ExamTimetablePrintProps = { schedules:ExamScheduleRow[]; school?:School|null; title?:string; academicYearTitle?:string; classGroup?:string; includeFriday?:boolean; };
const SOMALI_WEEKDAYS=['Axad','Isniin','Talaado','Arbaco','Khamiis','Jimce','Sabti'];
export function formatSomaliExamDate(value:string):string { const [y,m,d]=String(value).slice(0,10).split('-'); const date=new Date(Number(y),Number(m)-1,Number(d)); return `${SOMALI_WEEKDAYS[date.getDay()]||''} ${d}/${m}/${y}`; }
export function isExamTimetableFriday(value:string):boolean { const [y,m,d]=String(value).slice(0,10).split('-'); return new Date(Number(y),Number(m)-1,Number(d)).getDay()===5; }
/** Shared printable timetable; role APIs determine which school-scoped published rows each portal receives. */
export const ExamTimetablePrint:React.FC<ExamTimetablePrintProps>=({schedules,school,title,academicYearTitle,classGroup,includeFriday})=>{
 const showFriday=includeFriday??school?.examTimetableIncludeFriday===true;
 const groups=groupExamRoomSessions(Array.isArray(schedules)?schedules:[]).filter(group=>showFriday||!isExamTimetableFriday(group.sessions[0].examDate));
 const groupsByDate=new Map<string,typeof groups>();
 groups.forEach(group=>{const date=group.sessions[0].examDate;const rows=groupsByDate.get(date)||[];rows.push(group);groupsByDate.set(date,rows);});
 const dates=[...groupsByDate.keys()].sort((a,b)=>a.localeCompare(b));
 const semester=groups[0]?.sessions[0]?.semester||'SEMESTER';
 const headingOne=title?.trim()||school?.examTimetableTitle?.trim()||`JADWALKA IMTIXAANKA ${semester}`;
 const headingTwo=academicYearTitle?.trim()||school?.examTimetableAcademicYearTitle?.trim()||`SANNAD DUGSIYEEDKA ${school?.academicYear||''}`;
 const headingThree=classGroup?.trim()||school?.examTimetableClassGroup?.trim()||'DHAMMAAN FASALLADA';
 return <section className="exam-timetable-print" aria-label="Exam timetable">
 <style>{`
 .exam-timetable-print{width:100%;padding:20px;color:#111827;background:#fff;font-family:Arial,Helvetica,sans-serif}
 .exam-timetable-print .exam-school-header{display:grid;grid-template-columns:minmax(0,1fr) 76px minmax(0,1fr);align-items:center;gap:12px;padding:4px 0 14px;border-bottom:2px solid #D9A425}
 .exam-timetable-print .exam-school-name{margin:0;color:#1d4ed8;font-size:clamp(12px,1.8vw,20px);font-style:italic;font-weight:800;line-height:1.25;text-transform:uppercase;overflow-wrap:anywhere}
 .exam-timetable-print .exam-school-location{margin:5px 0 0;color:#dc2626;font-size:11px;font-weight:700}
 .exam-timetable-print .exam-school-logo{display:flex;justify-content:center;align-items:center;min-width:0}
 .exam-timetable-print .exam-school-logo img{width:64px;height:64px;object-fit:contain}
 .exam-timetable-print .exam-school-arabic{margin:0;color:#1d4ed8;font-size:clamp(12px,1.8vw,20px);font-weight:800;line-height:1.4;text-align:right;direction:rtl;overflow-wrap:anywhere}
 .exam-timetable-print .exam-print-titles{display:grid;gap:5px;margin:14px 0 16px}
 .exam-timetable-print .exam-print-title-row{padding:8px 10px;border:1px solid #cbd5e1;background:#f3f4f6;color:#111827;text-align:center;font-size:12px;font-weight:800;letter-spacing:.025em;text-transform:uppercase}
 .exam-timetable-print table{width:100%;min-width:0!important;table-layout:fixed;border-collapse:collapse;border:1.5px solid #111}
 .exam-timetable-print th,.exam-timetable-print td{padding:10px 8px;border:1.5px solid #111;text-align:center;vertical-align:middle;overflow-wrap:anywhere}
 .exam-timetable-print thead th{background:#D9A425!important;color:#fff!important;font-size:12px;font-weight:800;text-transform:uppercase}
 .exam-timetable-print tbody td{color:#111;font-size:12px;font-weight:700}
 .exam-timetable-print tbody tr.exam-day-even td{background:#e5e7eb}
 .exam-timetable-print tbody tr.exam-day-odd td{background:#fff}
 .exam-timetable-print .exam-subject{font-weight:800;text-transform:uppercase}
 .exam-timetable-print .exam-date-cell{width:30%}.exam-timetable-print .exam-subject-cell{width:42%}.exam-timetable-print .exam-time-cell{width:28%;white-space:nowrap}
 .exam-timetable-print .exam-empty{padding:28px 12px;color:#64748b;text-align:center;font-size:12px}
 @page{size:A4 portrait;margin:12mm}
 @media print{body *{visibility:hidden!important}.exam-timetable-print,.exam-timetable-print *{visibility:visible!important}.exam-timetable-print{position:absolute!important;inset:0!important;width:100%!important;padding:0!important;margin:0!important}.exam-timetable-print thead{display:table-header-group}.exam-timetable-print tr{break-inside:avoid;page-break-inside:avoid}.exam-timetable-print th,.exam-timetable-print td{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
 @media(max-width:600px){.exam-timetable-print{padding:8px}.exam-timetable-print .exam-school-header{grid-template-columns:minmax(0,1fr) 48px minmax(0,1fr);gap:6px}.exam-timetable-print .exam-school-logo img{width:44px;height:44px}.exam-timetable-print .exam-print-title-row{padding:7px 5px;font-size:10px}.exam-timetable-print th,.exam-timetable-print td{padding:8px 4px;font-size:10px}.exam-timetable-print .exam-time-cell{white-space:normal}}
 `}</style>
 <header className="exam-school-header"><div><p className="exam-school-name">{school?.name||''}</p><p className="exam-school-location">{school?.city||school?.address||''}</p></div><div className="exam-school-logo">{school?.logoUrl?<img src={school.logoUrl} alt="School logo"/>:null}</div><div><p className="exam-school-arabic" dir="rtl">{school?.nameArabic||''}</p></div></header>
 <div className="exam-print-titles"><div className="exam-print-title-row">{headingOne}</div><div className="exam-print-title-row">{headingTwo}</div><div className="exam-print-title-row">{headingThree}</div></div>
 {groups.length===0?<p className="exam-empty">No exam timetable is available.</p>:<table><thead><tr><th className="exam-date-cell">TAARIIKHDA</th><th className="exam-subject-cell">MAADADA</th><th className="exam-time-cell">WAQTIGA</th></tr></thead><tbody>{dates.map((date,dateIndex)=>{const dayGroups=groupsByDate.get(date)||[];return dayGroups.map((group,rowIndex)=>{const schedule=group.sessions[0];return <tr key={group.key} className={dateIndex%2===0?'exam-day-even':'exam-day-odd'}>{rowIndex===0&&<td rowSpan={dayGroups.length} className="exam-date-cell">{formatSomaliExamDate(date)}</td>}<td className="exam-subject exam-subject-cell">{String(schedule.subjectName||'—').toUpperCase()}</td><td className="exam-time-cell">{String(schedule.startTime).slice(0,5)} – {String(schedule.endTime).slice(0,5)}</td></tr>;});})}</tbody></table>}
 </section>;
};
