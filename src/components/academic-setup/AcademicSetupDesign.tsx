import React from 'react';

export type SetupStep = { label: string; complete?: boolean };
export const PageHeader: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <header className="as-page-header"><h1>{title}</h1><p>{subtitle}</p></header>
);

export const Stepper: React.FC<{ steps: SetupStep[]; active: number }> = ({ steps, active }) => (
  <nav className="as-stepper-scroll" aria-label="Tallaabooyinka dejinta">
    <div className="as-stepper">{steps.map((step, index) => (
      <div key={step.label} className={'as-step ' + (index === active ? 'is-active ' : '') + (step.complete ? 'is-complete' : '')}>
        <span className="as-step-number">{step.complete ? '✓' : index + 1}</span>
        <span className="as-step-label">{step.label}</span>
      </div>
    ))}</div>
  </nav>
);

export const Card: React.FC<React.PropsWithChildren<{ title: string; subtitle?: string; actions?: React.ReactNode }>> = ({ title, subtitle, actions, children }) => (
  <section className="as-card">
    <div className="as-card-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{actions}</div>
    {children}
  </section>
);

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }> = ({ variant='secondary', className='', children, ...props }) => (
  <button {...props} className={'as-button as-button-' + variant + ' ' + className}>{children}</button>
);

export const Chip: React.FC<{ selected: boolean; children: React.ReactNode; onClick: () => void }> = ({ selected, children, onClick }) => (
  <button type="button" aria-pressed={selected} onClick={onClick} className={'as-chip ' + (selected ? 'is-selected' : '')}>{children}</button>
);

export const Pill: React.FC<React.PropsWithChildren<{ tone?: 'primary' | 'success' | 'muted' }>> = ({ tone='muted', children }) => (
  <span className={'as-pill as-pill-' + tone}>{children}</span>
);

export const DataTable: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div className="as-table-scroll"><table className="as-table">{children}</table></div>
);

export const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="as-empty">{children}</div>
);

export const FormRow: React.FC<React.PropsWithChildren<{ label: string; hint?: string }>> = ({ label, hint, children }) => (
  <label className="as-form-row"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
);
