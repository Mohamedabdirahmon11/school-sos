import React from 'react';

type Tab = { hash: string; label: string; view: string };
const TABS: Tab[] = [
  { hash: '#classes', label: 'Classes & Sections', view: 'sch_classes' },
  { hash: '#subjects', label: 'Subjects', view: 'sch_subjects' },
  { hash: '#curriculum', label: 'Class Curriculum', view: 'sch_curriculum' },
  { hash: '#assignment', label: 'Teacher Assignment', view: 'sch_teacher_assignments' }
];

export const AcademicSetupHeader: React.FC<{ active: Tab['view']; onNavigate: (view: string) => void }> = ({ active, onNavigate }) => (
  <header>
    <div className="brand">SchoolOS · Academic Setup</div>
    <nav aria-label="Qaybaha">
      {TABS.map(tab => (
        <a
          key={tab.view}
          href={tab.hash}
          data-t={tab.hash.slice(1)}
          aria-current={active === tab.view ? 'page' : undefined}
          onClick={event => {
            event.preventDefault();
            if (window.location.hash !== tab.hash) window.history.replaceState(null, '', tab.hash);
            onNavigate(tab.view);
          }}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  </header>
);
