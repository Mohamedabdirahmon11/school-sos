import { gradeLabelForPercentage } from '../report-card.ts';

export type DocumentAcademicSummary = {
  totalMarks: string;
  average: string;
  grade: string;
  rank: string;
  teacherComment: string;
};

/** Summarizes approved class marks for a student and calculates their class rank. */
export function summarizeDocumentAcademicMarks(
  marks: Array<{ studentId:string; status?:string; totalMarks?:number; percentage?:number; teacherRemarks?:string; submittedAt?:string }>,
  studentId: string,
  gradingScale?: Array<{ minPercentage:number; label:string }>
): DocumentAcademicSummary {
  const byStudent = new Map<string, Array<{ total:number; percentage:number; remark:string; submittedAt:string }>>();
  for (const mark of marks) {
    if (mark.status !== 'approved') continue;
    const percentage = Number(mark.percentage);
    const total = Number(mark.totalMarks);
    if (!Number.isFinite(percentage) || !Number.isFinite(total)) continue;
    const list = byStudent.get(mark.studentId) || [];
    list.push({ total, percentage, remark:String(mark.teacherRemarks || '').trim(), submittedAt:String(mark.submittedAt || '') });
    byStudent.set(mark.studentId,list);
  }

  const summaries = new Map<string,{ total:number; average:number; comment:string }>();
  for (const [id, entries] of byStudent) {
    const total = entries.reduce((sum,entry)=>sum + entry.total,0);
    const average = entries.reduce((sum,entry)=>sum + entry.percentage,0) / entries.length;
    const comments = entries.filter(entry=>entry.remark).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt));
    summaries.set(id,{ total, average, comment:comments[0]?.remark || '' });
  }

  const ranked = [...summaries.entries()].sort((a,b)=>b[1].average - a[1].average || a[0].localeCompare(b[0]));
  const current = summaries.get(studentId);
  const rank = current ? ranked.findIndex(([id])=>id===studentId) + 1 : 0;
  return {
    totalMarks: current ? String(Number(current.total.toFixed(2))) : '',
    average: current ? current.average.toFixed(2) : '',
    grade: current ? gradeLabelForPercentage(current.average,gradingScale) : '',
    rank: current ? String(rank) : '',
    teacherComment: current?.comment || ''
  };
}
