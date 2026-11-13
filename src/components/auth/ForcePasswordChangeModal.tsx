/**
 * Forced Password Change Modal for First-Time Staff Logins
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { ShieldAlert, KeyRound, Check } from 'lucide-react';
import { PasswordInput } from '../common/PasswordInput.tsx';

export const ForcePasswordChangeModal: React.FC = () => {
  const { user, refreshUser, t } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user?.mustChangePassword) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.role === 'school_admin') {
      if (!/^\d{4,6}$/.test(pin)) { setError('PIN must contain 4 to 6 digits.'); return; }
      if (pin !== confirmPin) { setError('PINs do not match.'); return; }
    } else {
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
      if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    }

    setIsSubmitting(true);
    setError(null);
    try {
      if (user?.role === 'school_admin') await ApiClient.changePin(pin);
      else await ApiClient.changePassword(password);
      await refreshUser();
    } catch (err: any) {
      setError(err.message || 'Failed to update credentials');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-[#E2E8F0]">
        <div className="flex items-center gap-3 text-amber-600 mb-4">
          <div className="p-2 bg-amber-50 rounded-lg">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#132A29]">{user.role === 'school_admin' ? 'First-Time Sign In – Set PIN' : 'First-Time Sign In'}</h3>
            <p className="text-xs text-[#64748B]">{user.role === 'school_admin' ? 'Set a secure 4–6 digit PIN to continue.' : t('first_time_password_hint')}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-2.5 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {user.role === 'school_admin' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-[#334155]">New School Admin PIN</label>
                <input type="password" inputMode="numeric" maxLength={6} required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="4–6 digit PIN" autoComplete="new-password" className="mt-1 w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]" />
                <p className="mt-1 text-[11px] text-[#64748B]">Use this PIN with your School ID or Admin ID whenever you sign in.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#334155]">Confirm New PIN</label>
                <input type="password" inputMode="numeric" maxLength={6} required value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Confirm PIN" autoComplete="new-password" className="mt-1 w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]" />
              </div>
            </>
          ) : (
            <>
          <div>
            <label className="block text-xs font-medium text-[#334155]">New Password</label>
            <PasswordInput
              label="new password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              placeholder="8+ characters with letters and a number"
              className="mt-1 w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            />
            <p className="mt-1 text-[11px] text-[#64748B]">Use at least 8 characters, including uppercase, lowercase, and a number.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#334155]">Confirm New Password</label>
            <PasswordInput
              label="confirm new password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              className="mt-1 w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            />
          </div>


            </>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            <span>{isSubmitting ? 'Updating...' : 'Set PIN / Password & Continue'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
