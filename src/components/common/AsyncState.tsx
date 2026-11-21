import React from 'react';
import { Inbox, LoaderCircle } from 'lucide-react';

type StateIcon = React.ComponentType<{ className?: string }>;

export function LoadingState({ label = 'Loading…', className = '' }: {
  label?: string;
  className?: string;
}) {
  return (
    <section role="status" aria-live="polite" aria-label={label}
      className={`mx-auto flex min-h-40 w-full max-w-3xl flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center ${className}`}>
      <LoaderCircle aria-hidden="true" className="h-7 w-7 animate-spin text-blue-600" />
      <p className="text-sm font-medium text-slate-600">{label}</p>
    </section>
  );
}

export function EmptyState({ title, description, icon: Icon = Inbox, actionLabel, onAction, className = '' }: {
  title: string;
  description: string;
  icon?: StateIcon;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <section role="status"
      className={`flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center ${className}`}>
      <Icon aria-hidden="true" className="h-7 w-7 text-slate-400" />
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="max-w-md text-sm text-slate-500">{description}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction}
          className="mt-2 inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          {actionLabel}
        </button>
      )}
    </section>
  );
}
