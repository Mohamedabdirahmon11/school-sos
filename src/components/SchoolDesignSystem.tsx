import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' };
export const PageHeader: React.FC<{title:string;subtitle:string}> = ({title,subtitle}) => <header className="ds-page-header"><div><h1>{title}</h1><p>{subtitle}</p></div></header>;
export const Stepper: React.FC<{activeStep:number;labels?:string[];ariaLabel?:string}> = ({activeStep,labels,ariaLabel='Setup steps'}) => {
  const steps=labels?.length ? labels : ['Dugsiga','Fasallo','Maaddooyin','Macallimiin','Dhammaystir'];
  return <nav className="ds-stepper" aria-label={ariaLabel}>{steps.map((label,index)=>{
    const step=index+1; const done=step<activeStep; const active=step===activeStep;
    return <div key={label} className={'ds-step '+(active?'is-active ':'')+(done?'is-complete':'')} aria-current={active?'step':undefined}><span className="ds-step-number">{done?'✓':step}</span><span>{label}</span></div>;
  })}</nav>;
};
export const Card: React.FC<React.PropsWithChildren<{className?:string}>> = ({children,className=''}) => <section className={'ds-card '+className}>{children}</section>;
export const Button: React.FC<React.PropsWithChildren<ButtonProps>> = ({children,variant='secondary',className='',...props}) => <button {...props} className={'ds-button ds-button-'+variant+' '+className}>{children}</button>;
export const Chip: React.FC<React.PropsWithChildren<{onRemove?:()=>void;disabled?:boolean;removeLabel?:string}>> = ({children,onRemove,disabled,removeLabel='Remove section'}) => <span className="ds-chip">{children}{onRemove&&<button type="button" aria-label={removeLabel} disabled={disabled} onClick={onRemove}>×</button>}</span>;
export const Pill: React.FC<React.PropsWithChildren> = ({children}) => <span className="ds-pill">{children}</span>;
export const Table: React.FC<React.PropsWithChildren<{className?:string}>> = ({children,className=''}) => <div className={'ds-list '+className}>{children}</div>;
export const EmptyState: React.FC<{children:React.ReactNode}> = ({children}) => <div className="ds-empty">{children}</div>;
export const FormRow: React.FC<React.PropsWithChildren<{label:string;hint?:string}>> = ({label,hint,children}) => <label className="ds-form-row"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;
