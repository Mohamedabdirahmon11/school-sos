import React from 'react';
import { ExamAssessmentComponent, SchoolClass, Student, Subject } from '../../types/index.ts';

interface TeacherMarkEntryPrintProps {
  schoolName: string;
  className: string;
  section?: string;
  academicYear?: string;
  semester: 'Semester 1' | 'Semester 2';
  teacherName: string;
  students: Student[];
  subjects: Subject[];
  components: ExamAssessmentComponent[];
}

/**
 * Print-only blank register. It deliberately reuses the teacher's already
 * authorized class roster and active subject assignments; it does not fetch
 * or expose any additional student data.
 */
export const TeacherMarkEntryPrint: React.FC<TeacherMarkEntryPrintProps> = ({
  schoolName, className, section, academicYear, semester, teacherName, students, subjects, components
}) => {
  const printSheets = () => window.print();

  return (
    <>
      <button
        type="button"
        onClick={printSheets}
        disabled={!students.length || !subjects.length || !components.length}
        className="rounded-xl border border-teal-200 bg-white px-4 py-2 text-xs font-semibold text-teal-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Print blank mark sheets
      </button>
      <div className="teacher-mark-entry-print hidden">
        <style>{`
          @page { size: A4 landscape; margin: 12mm; }
          @media print {
            body * { visibility: hidden !important; }
            .teacher-mark-entry-print, .teacher-mark-entry-print * { visibility: visible !important; }
            .teacher-mark-entry-print { display: block !important; position: absolute !important; inset: 0 !important; width: 100% !important; color: #111 !important; background: #fff !important; font-family: Arial, sans-serif; }
            .teacher-mark-entry-print .teacher-mark-sheet { break-after: page; page-break-after: always; }
            .teacher-mark-entry-print .teacher-mark-sheet:last-child { break-after: auto; page-break-after: auto; }
          }
        `}</style>
        {subjects.map(subject => (
          <section key={subject.id} className="teacher-mark-sheet">
            <header style={{ textAlign: 'center', borderBottom: '2px solid #111', paddingBottom: 10, marginBottom: 12 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{schoolName}</h1>
              <h2 style={{ margin: '5px 0', fontSize: 16 }}>TEACHER MARK-ENTRY SHEET</h2>
              <p style={{ margin: 0, fontSize: 11 }}>{className}{section ? ` · ${section}` : ''} · {subject.name} · {semester} · {academicYear}</p>
            </header>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 11 }}>
              <span>Teacher: {teacherName}</span>
              <span>Date: ____________________</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #111', padding: 6, width: 28 }}>#</th>
                  <th style={{ border: '1px solid #111', padding: 6, textAlign: 'left' }}>Student name / ID</th>
                  {components.map(component => <th key={component.id} style={{ border: '1px solid #111', padding: 6 }}>{component.name}<br />/{component.maxMarks}</th>)}
                  <th style={{ border: '1px solid #111', padding: 6 }}>Total /100</th>
                  <th style={{ border: '1px solid #111', padding: 6 }}>Teacher remarks</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student, index) => (
                  <tr key={student.id} style={{ height: 34 }}>
                    <td style={{ border: '1px solid #111', padding: 5, textAlign: 'center' }}>{index + 1}</td>
                    <td style={{ border: '1px solid #111', padding: 5 }}>{student.firstName} {student.middleName} {student.lastName}<br /><small>{student.studentId}</small></td>
                    {components.map(component => <td key={component.id} style={{ border: '1px solid #111', padding: 5, minWidth: 55 }} />)}
                    <td style={{ border: '1px solid #111', padding: 5, minWidth: 65 }} />
                    <td style={{ border: '1px solid #111', padding: 5, minWidth: 100 }} />
                  </tr>
                ))}
              </tbody>
            </table>
            <footer style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 24, fontSize: 11 }}>
              <span>Teacher signature: ____________________</span>
              <span>Form Teacher: ____________________</span>
              <span>Date received: ____________________</span>
            </footer>
          </section>
        ))}
      </div>
    </>
  );
};
