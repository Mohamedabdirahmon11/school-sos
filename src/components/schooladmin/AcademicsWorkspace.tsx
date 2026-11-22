import React, { useEffect, useState } from 'react';
import { CalendarDays, ClipboardList, Users } from 'lucide-react';
import { TeacherAssignmentsView } from './TeacherAssignmentsView.tsx';
import { TimetableView } from './TimetableView.tsx';
import { ExamsResultsView } from './ExamsResultsView.tsx';

type AcademicSection = 'assignments' | 'timetable' | 'marks';

const SECTIONS: Array<{ id: AcademicSection; title: string; subtitle: string; icon: React.ElementType; view: string }> = [
  { id: 'assignments', title: 'Teacher Assignments', subtitle: 'Macallimiinta, fasallada iyo maaddooyinka', icon: Users, view: 'sch_teacher_assignments' },
  { id: 'timetable', title: 'Timetable', subtitle: 'Jadwalka fasallada iyo xiisadaha', icon: CalendarDays, view: 'sch_timetable' },
  { id: 'marks', title: 'Marks Entry', subtitle: 'Gelinta iyo hubinta dhibcaha', icon: ClipboardList, view: 'sch_marks' }
];

function sectionFromView(view: string): AcademicSection {
  if (view === 'sch_timetable') return 'timetable';
  if (view === 'sch_marks' || view === 'sch_exams') return 'marks';
  return 'assignments';
}

export const AcademicsWorkspace: React.FC<{ activeView: string; onNavigate: (view: string) => void }> = ({ activeView, onNavigate }) => {
  const [activeSection, setActiveSection] = useState<AcademicSection>(() => sectionFromView(activeView));

  useEffect(() => {
    setActiveSection(sectionFromView(activeView));
  }, [activeView]);

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1680px] space-y-5 px-3 py-4 md:px-6 md:py-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--schoolos-accent)]">SchoolOS · Academics</p>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--schoolos-text)]">Academics</h1>
        <p className="text-sm text-[var(--schoolos-muted)]">Maamul saddexda hawlood ee waxbarashada hal meel.</p>
      </header>

      <nav aria-label="Academic sections" className="grid grid-cols-1 gap-2 rounded-2xl border border-[var(--schoolos-line)] bg-[var(--schoolos-surface)] p-2 sm:grid-cols-3">
        {SECTIONS.map(section => {
          const Icon = section.icon;
          const selected = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              aria-current={selected ? 'page' : undefined}
              onClick={() => { setActiveSection(section.id); onNavigate(section.view); }}
              className={`flex min-h-[66px] items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--schoolos-accent)] ${selected ? 'border-[var(--schoolos-accent)] bg-[var(--schoolos-accent)] text-white shadow-sm' : 'border-transparent text-[var(--schoolos-text)] hover:border-[var(--schoolos-line)] hover:bg-[var(--schoolos-hover)]'}`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-white/15' : 'bg-[var(--schoolos-accent-soft)] text-[var(--schoolos-accent)]'}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{section.title}</span>
                <span className={`mt-0.5 block text-xs ${selected ? 'text-white/80' : 'text-[var(--schoolos-muted)]'}`}>{section.subtitle}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <section className="min-w-0" aria-label={SECTIONS.find(section => section.id === activeSection)?.title}>
        {activeSection === 'assignments' && <TeacherAssignmentsView onNavigate={onNavigate} />}
        {activeSection === 'timetable' && <TimetableView />}
        {activeSection === 'marks' && <ExamsResultsView initialTab="marks" />}
      </section>
    </main>
  );
};
