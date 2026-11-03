import React, { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { ApiLoadError } from '../../hooks/useApi.ts';

export const ErrorState: React.FC<{ error: ApiLoadError; onRetry: () => void }> = ({ error, onRetry }) => {
  useEffect(() => {
    if (error.code === 'MUST_CHANGE_PASSWORD') window.dispatchEvent(new CustomEvent('schoolos:must-change-password'));
    else if (error.status === 401) window.dispatchEvent(new CustomEvent('schoolos:api-error', { detail: { status: 401, message: error.message } }));
  }, [error]);
  const unauthorized = error.status === 401;
  const forbidden = error.status === 403;
  return (
    <section role="alert" className="mx-auto my-8 max-w-xl rounded-xl border border-rose-200 bg-white p-5 text-sm shadow-sm">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-[#132A29]">{forbidden ? 'No permission' : unauthorized ? 'Session expired' : 'This screen could not load'}</h2>
          <p className="mt-1 text-[#64748B]">{error.message || (forbidden ? 'Your account is not allowed to view this information.' : unauthorized ? 'Sign in again to continue.' : 'The server could not return this information.')}</p>
          <button type="button" onClick={onRetry} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2 font-semibold text-white hover:bg-[#0D655E] focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:ring-offset-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    </section>
  );
};
