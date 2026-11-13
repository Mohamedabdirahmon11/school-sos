import React, { useState } from 'react';
import { ApiClient } from '../../services/api.ts';

export const CreateSuperAdminPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setCreated(null);
    try {
      const result = await ApiClient.createSuperAdmin(fullName.trim(), email.trim());
      setCreated({ email: email.trim().toLowerCase(), temporaryPassword: result.temporaryPassword });
      setFullName('');
      setEmail('');
    } catch (err: any) {
      setError(err?.message || 'Unable to create the backup Super Admin.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4 text-xs space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[#132A29]">Backup Super Admin</h2>
          <p className="mt-1 text-[11px] text-[#64748B]">Create a second platform administrator for account continuity. The one-time password must be changed at first sign-in.</p>
        </div>
        <button type="button" onClick={() => { setOpen(value => !value); setCreated(null); setError(''); }} className="self-start rounded-lg border border-[#CBD5E1] bg-slate-50 px-3 py-2 font-semibold text-[#334155]">
          {open ? 'Close' : 'Add Super Admin'}
        </button>
      </div>
      {open && !created && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] items-end gap-3">
          <label className="space-y-1">
            <span className="block font-medium text-[#334155]">Full name</span>
            <input required minLength={2} maxLength={120} value={fullName} onChange={e => setFullName(e.target.value)} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2" />
          </label>
          <label className="space-y-1">
            <span className="block font-medium text-[#334155]">Email</span>
            <input required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2" />
          </label>
          <button type="submit" disabled={busy || fullName.trim().length < 2 || !email.trim()} className="rounded-lg bg-[#0F766E] px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
      )}
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800">{error}</p>}
      {created && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <p className="font-semibold">Account created. Share this temporary password securely; it is shown only once and must be changed at first sign-in.</p>
          <p>Email: <span className="font-mono">{created.email}</span></p>
          <p>Temporary password: <span className="select-all break-all font-mono font-bold">{created.temporaryPassword}</span></p>
          <button type="button" onClick={() => setCreated(null)} className="font-semibold underline">Hide temporary password</button>
        </div>
      )}
    </section>
  );
};
