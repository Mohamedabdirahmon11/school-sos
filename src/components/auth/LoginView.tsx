/**
 * Production Multi-Role Authentication Screen
 * Supports:
 * - Super Admin: Email + Password
 * - School Admin, Accountant: Email or Phone + Password
 * - Teacher: School-issued Teacher ID + Password or PIN
 * - Student & Parent: School Code + Phone Number + PIN (with children switcher and lockout protection)
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { UserRole } from '../../types/index.ts';
import { PasswordInput } from '../common/PasswordInput.tsx';
import { 
  ShieldCheck, 
  School as SchoolIcon, 
  GraduationCap, 
  Users, 
  Lock, 
  Mail, 
  Phone, 
  Key, 
  AlertCircle, 
  Sparkles,
  ArrowRight,
  Calculator
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, refreshUser, t } = useAuth();
  const [activeTab, setActiveTab] = useState<UserRole>('school_admin');
  const [parentStudentMode, setParentStudentMode] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapToken, setBootstrapToken] = useState<string | null>(null);
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorSetup, setTwoFactorSetup] = useState<{ secret: string; qrCodeUrl: string; recoveryCodes: string[] } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await login({
        role: activeTab,
        email,
        phone,
        schoolCode,
        pin,
        password,
        twoFactorCode: twoFactorRequired ? twoFactorCode : undefined
      });
      if (result.requirePasswordChange && result.challengeToken) {
        setBootstrapToken(result.challengeToken);
        setPasswordChangeRequired(true);
      } else if (result.requireTwoFactorSetup && result.challengeToken) {
        setBootstrapToken(result.challengeToken);
        setTwoFactorRequired(false);
        setTwoFactorCode('');
        const setup = await ApiClient.setup2FA(result.challengeToken);
        setTwoFactorSetup(setup);
      } else if (result.requireTwoFactorCode) {
        setTwoFactorRequired(true);
        setTwoFactorCode('');
      } else if (result.user) {
        setTwoFactorRequired(false);
        setTwoFactorCode('');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBootstrapPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newAdminPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newAdminPassword !== confirmAdminPassword) { setError('Passwords do not match.'); return; }
    if (!bootstrapToken) { setError('This setup session expired. Sign in again.'); return; }
    setIsLoading(true);
    setError(null);
    try {
      const result = await ApiClient.changePassword(newAdminPassword, bootstrapToken);
      setNewAdminPassword('');
      setConfirmAdminPassword('');
      setPasswordChangeRequired(false);
      if (result.requireTwoFactorSetup && bootstrapToken) {
        const setup = await ApiClient.setup2FA(bootstrapToken);
        setTwoFactorSetup(setup);
      } else {
        setBootstrapToken(null);
        await refreshUser();
      }
    } catch (err: any) {
      setError(err.message || 'Could not update the Super Admin password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnableTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bootstrapToken || !twoFactorSetup) { setError('This 2FA setup session expired. Sign in again.'); return; }
    if (!/^\d{6}$/.test(twoFactorCode)) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setIsLoading(true);
    setError(null);
    try {
      await ApiClient.enable2FA(twoFactorCode, bootstrapToken);
      setTwoFactorSetup(null);
      setBootstrapToken(null);
      setTwoFactorCode('');
      await refreshUser();
    } catch (err: any) {
      setError(err.message || 'The authenticator code could not be verified.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F6F6] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 rounded-xl bg-[#0B2B2A] text-white flex items-center justify-center font-bold text-2xl mx-auto shadow-md">
          S
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-[#132A29]">
          SchoolOS Cloud SaaS
        </h2>
        <p className="mt-1 text-xs text-[#64748B]">
          Enterprise Multi-School Management & Governance Platform
        </p>
      </div>

      {/* Main Login Card */}
      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-6 px-4 shadow-sm border border-[#E2E8F0] sm:rounded-xl sm:px-8">
          
          {twoFactorSetup ? (
            <form className="space-y-4" onSubmit={handleEnableTwoFactor}>
              <h3 className="text-base font-semibold text-[#132A29]">Secure your Super Admin account</h3>
              <p className="text-xs text-[#64748B]">Scan this QR code with an authenticator app, then enter the current 6-digit code to finish enabling two-factor authentication.</p>
              <img src={twoFactorSetup.qrCodeUrl} alt="Super Admin authenticator setup QR code" className="mx-auto w-44 h-44 border border-[#E2E8F0] rounded-lg p-2" />
              <p className="text-[11px] text-slate-600 break-all">Manual setup key: <span className="font-mono font-semibold">{twoFactorSetup.secret}</span></p>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="text-xs font-semibold text-amber-900">Save these recovery codes somewhere safe</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {twoFactorSetup.recoveryCodes.map(code => <code key={code} className="text-xs text-amber-950">{code}</code>)}
                </div>
              </div>
              <label className="block text-xs font-medium text-[#334155]">6-digit authenticator code</label>
              <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={twoFactorCode} onChange={e => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full px-3 py-2 text-sm font-mono tracking-[0.35em] text-center border border-[#CBD5E1] rounded-lg" placeholder="000000" />
              {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
              <button disabled={isLoading} className="w-full rounded-lg bg-[#0F766E] py-2.5 text-xs font-semibold text-white">{isLoading ? 'Verifying…' : 'Enable 2FA and sign in'}</button>
            </form>
          ) : passwordChangeRequired ? (
            <form className="space-y-4" onSubmit={handleBootstrapPasswordChange}>
              <h3 className="text-base font-semibold text-[#132A29]">Change the Super Admin password</h3>
              <p className="text-xs text-[#64748B]">Set a new password to continue to the dashboard.</p>
              <PasswordInput label="new password" required minLength={8} autoComplete="new-password" value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} placeholder="New password" className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm" />
              <PasswordInput label="confirm new password" required minLength={8} autoComplete="new-password" value={confirmAdminPassword} onChange={e => setConfirmAdminPassword(e.target.value)} placeholder="Confirm new password" className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm" />
              {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
              <button disabled={isLoading} className="w-full rounded-lg bg-[#0F766E] py-2.5 text-xs font-semibold text-white">{isLoading ? 'Updating…' : 'Set password and continue'}</button>
            </form>
          ) : <>
          <div className="mb-5 text-right text-xs">
            {parentStudentMode ? <><button type="button" className="text-[#0F766E] underline" onClick={() => { setParentStudentMode(false); setActiveTab('school_admin'); setError(null); }}>Staff sign in</button><span className="mx-2 text-slate-300">|</span><button type="button" className="text-[#64748B]" onClick={() => setActiveTab(activeTab === 'parent' ? 'student' : 'parent')}>Switch to {activeTab === 'parent' ? 'Student' : 'Parent'}</button></> : <button type="button" className="text-[#0F766E] underline" onClick={() => { setParentStudentMode(true); setActiveTab('parent'); setError(null); }}>Parent / Student sign in</button>}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            
            {/* SUPER ADMIN FORM */}
            {activeTab === 'super_admin' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-[#334155]">Super Admin Email</label>
                  <div className="mt-1 relative">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="admin@example.com"
                      className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                </div>

                {twoFactorRequired && (
                  <div>
                    <label className="block text-xs font-medium text-[#334155]">Authenticator or recovery code</label>
                    <input type="text" autoComplete="one-time-code" maxLength={16} required value={twoFactorCode} onChange={e => setTwoFactorCode(e.target.value.toUpperCase().slice(0, 16))} placeholder="6-digit or recovery code" className="mt-1 w-full px-3 py-2 text-sm font-mono tracking-[0.35em] text-center border border-[#CBD5E1] rounded-lg" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-[#334155]">Master Password</label>
                  <div className="mt-1 relative">
                    <PasswordInput
                      label="password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                </div>

              </>
            )}

            {/* SCHOOL ADMIN / TEACHER / ACCOUNTANT FORM */}
            {(activeTab === 'school_admin' || activeTab === 'teacher' || activeTab === 'accountant') && (
              <>
                <div>
                  <label className="block text-xs font-medium text-[#334155]">{activeTab === 'teacher' ? 'Teacher ID' : t('staff_signin_identifier')}</label>
                  <div className="mt-1">
                    <input
                      type="text"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder={activeTab === 'teacher' ? 'STF-SCHOOL-0001' : t('staff_signin_placeholder')}
                      className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-[#334155]">{activeTab === 'teacher' ? 'Password / PIN' : 'Password'}</label>
                    <span className="text-[11px] text-[#64748B] text-right max-w-[62%]">
                      {activeTab === 'school_admin' ? t('school_admin_initial_password_hint') : activeTab === 'teacher' ? 'Use the password or PIN given to you by your School Admin.' : 'Contact your school administrator to reset your password.'}
                    </span>
                  </div>
                  <div className="mt-1">
                    <PasswordInput
                      label="password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                </div>
              </>
            )}

            {/* PARENT LOGIN: School Code + Phone + PIN */}
            {activeTab === 'parent' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-[#334155]">{t('school_code')}</label>
                  <div className="mt-1">
                    <input
                      type="text"
                      required
                      value={schoolCode}
                      onChange={e => setSchoolCode(e.target.value.toUpperCase())}
                      placeholder="e.g. MOG01"
                      className="w-full px-3 py-2 text-xs font-mono uppercase border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#334155]">Registered Phone Number</label>
                  <div className="mt-1">
                    <input
                      type="text"
                      required
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+252615000000"
                      className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#334155]">4-Digit Parent PIN</label>
                  <div className="mt-1">
                    <input
                      type="password"
                      maxLength={4}
                      required
                      value={pin}
                      onChange={e => setPin(e.target.value)}
                      placeholder="1234"
                      className="w-full px-3 py-2 text-xs font-mono tracking-widest border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                </div>
              </>
            )}

            {/* STUDENT LOGIN: School Code + Phone + PIN */}
            {activeTab === 'student' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-[#334155]">{t('school_code')}</label>
                  <div className="mt-1">
                    <input
                      type="text"
                      required
                      value={schoolCode}
                      onChange={e => setSchoolCode(e.target.value.toUpperCase())}
                      placeholder="e.g. MOG01"
                      className="w-full px-3 py-2 text-xs font-mono uppercase border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#334155]">Student Phone (or Parent Phone)</label>
                  <div className="mt-1">
                    <input
                      type="text"
                      required
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+252615000000"
                      className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#334155]">Student PIN</label>
                  <div className="mt-1">
                    <input
                      type="password"
                      maxLength={4}
                      required
                      value={pin}
                      onChange={e => setPin(e.target.value)}
                      placeholder="4-digit PIN"
                      className="w-full px-3 py-2 text-xs font-mono tracking-widest border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0F766E] disabled:opacity-50"
            >
              {isLoading ? 'Verifying...' : 'Sign in to Platform'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
          </>}

        </div>
      </div>

      {/* Forgot Password Modal */}
    </div>
  );
};
