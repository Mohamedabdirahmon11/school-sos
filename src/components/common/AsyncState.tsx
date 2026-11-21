import React, { useEffect } from 'react';
import { AlertCircle, Inbox, LoaderCircle, RefreshCw } from 'lucide-react';
import type { ApiLoadError } from '../../hooks/useApi.ts';

type StateIcon = React.ComponentType<{ className?: string }>;

export function LoadingState({ label = 'Loading…', className = '' }: {
  label?: string;
  className?: string;
}) {
  return (
    <section role="status" aria-live="polite" aria-label={label}
      className={`mx-auto flex min-h-40 w-full max-w-3xl flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center ${className}`}>
      <LoaderCircle aria-hidden="true" className="h-7 w-7 animate-spin text-blue-600 motion-reduce:animate-none" />
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
      <p className="max-w-md text-sm text-slate-600">{description}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction}
          className="mt-2 inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          {actionLabel}
        </button>
      )}
    </section>
  );
}

/** Shared retryable error presentation used by all API-backed screens. */
export const ErrorState: React.FC<{ error: ApiLoadError; onRetry: () => void }> = ({ error, onRetry }) => {
  useEffect(() => {
    if (error.code === 'MUST_CHANGE_PASSWORD') window.dispatchEvent(new CustomEvent('schoolos:must-change-password'));
    else if (error.status === 401) window.dispatchEvent(new CustomEvent('schoolos:api-error', { detail: { status: 401, message: error.message } }));
  }, [error]);
  const unauthorized = error.status === 401;
  const forbidden = error.status === 403;
  return (
    <section role="alert" aria-live="assertive" className="mx-auto my-8 max-w-xl rounded-xl border border-rose-200 bg-white p-5 text-sm shadow-sm">
      <div className="flex items-start gap-3">
        <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-[#132A29]">{forbidden ? 'No permission' : unauthorized ? 'Session expired' : 'This screen could not load'}</h2>
          <p className="mt-1 text-[#475569]">{error.message || (forbidden ? 'Your account is not allowed to view this information.' : unauthorized ? 'Sign in again to continue.' : 'The server could not return this information.')}</p>
          <button type="button" onClick={onRetry} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2 font-semibold text-white hover:bg-[#0D655E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]">
            <RefreshCw aria-hidden="true" className="h-4 w-4" /> Retry · Isku day mar kale
          </button>
        </div>
      </div>
    </section>
  );
};
