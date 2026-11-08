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
    setBusy(true);
    setError('');
    try {
      const result = await ApiClient.createSuperAdmin(fullName.trim(), email.trim());
      setCreated({ email: email.trim().toLowerCase(), temporaryPassword: result.temporaryPassword });
      setFullName('');
      setEmail('');
    } catch (err: any) {
      setError(err?.message || 'Unable to create the Super Admin.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white p-4 rounded-xl border border-[#E2E8F0] text-xs space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[#132A29]">Backup Super Admin</h2>
          <p className="text-[11px] text-[#64748B]">Create a second Super Admin so the platform is never locked if one account is lost. The last active Super Admin cannot be blocked.</p>
        </div>
        <button type="button" onClick={() => { setOpen(value => !value); setCreated(null); setError(''); }} className="px-3 py-2 rounded-lg border border-[#CBD5E1] bg-slate-50">{open ? 'Close' : 'Add Super Admin'}</button>
      </div>
      {open && !created && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <label className="space-y-1"><span className="block font-medium text-[#334155]">Full name</span><input required value={fullName} onChange={e => setFullName(e.target.value)} className="px-3 py-2 border border-[#CBD5E1] rounded-lg" /></label>
          <label className="space-y-1"><span className="block font-medium text-[#334155]">Email</span><input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="px-3 py-2 border border-[#CBD5E1] rounded-lg" /></label>
          <button type="submit" disabled={busy} className="px-3 py-2 rounded-lg bg-[#0F766E] text-white disabled:opacity-50">Create</button>
        </form>
      )}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {created && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
          <p className="font-semibold text-amber-900">Super Admin created. Share this temporary password securely. It is shown only once and must be changed at first login.</p>
          <p>Email: <span className="font-mono">{created.email}</span></p>
          <p>Temporary password: <span className="font-mono select-all">{created.temporaryPassword}</span></p>
        </div>
      )}
    </section>
  );
};
