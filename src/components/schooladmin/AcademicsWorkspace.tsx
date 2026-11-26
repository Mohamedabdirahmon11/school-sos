import React from 'react';
import { TimetableView } from './TimetableView.tsx';

export const AcademicsWorkspace: React.FC<{ activeView: string; onNavigate: (view: string) => void }> = () => (
  <main className="mx-auto w-full min-w-0 max-w-[1680px] space-y-5 px-3 py-4 md:px-6 md:py-6">
    <header className="space-y-1">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--schoolos-accent)]">SchoolOS · Academics</p>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Timetable</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">Maamul jadwalka fasallada iyo xiisadaha.</p>
    </header>
    <section className="min-w-0" aria-label="Timetable">
      <TimetableView />
    </section>
  </main>
);
