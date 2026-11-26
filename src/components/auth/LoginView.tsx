/**
 * Production Multi-Role Authentication Screen
 * Supports:
 * - Super Admin: Email + Password
 * - School Admin: School ID or Admin ID + PIN
 * - Accountant: School-issued Staff ID + PIN
 * - Teacher: School-issued Teacher ID + PIN
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

export const LoginView: React.FC<{ authCheckPending?: boolean }> = ({ authCheckPending = false }) => {
  const { login, refreshUser, t } = useAuth();
  const [activeTab, setActiveTab] = useState<UserRole>('school_admin');
  const [parentStudentMode, setParentStudentMode] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [studentId, setStudentId] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [pin, setPin] = useState('');
  const [showPortalPin, setShowPortalPin] = useState(false);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapToken, setBootstrapToken] = useState<string | null>(null);
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);
  const [pinChangeRequired, setPinChangeRequired] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [newAdminPin, setNewAdminPin] = useState('');
  const [confirmAdminPin, setConfirmAdminPin] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authCheckPending) return;
    setError(null);
    setIsLoading(true);

    try {
      const isSuperAdminLogin = activeTab === 'school_admin' && email.trim().includes('@');
      const result = await login({
        role: isSuperAdminLogin ? 'super_admin' : activeTab,
        email: email.trim(),
        phone,
        studentId,
        schoolCode,
        pin: isSuperAdminLogin ? undefined : pin,
        password: isSuperAdminLogin ? password : undefined
      });
      if (result.requirePinChange && result.challengeToken) {
        setBootstrapToken(result.challengeToken);
        setPinChangeRequired(true);
        return;
      }
      if (result.requirePasswordChange && result.challengeToken) {
        setBootstrapToken(result.challengeToken);
        setPasswordChangeRequired(true);
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
      await ApiClient.changePassword(newAdminPassword, bootstrapToken);
      setNewAdminPassword('');
      setConfirmAdminPassword('');
      setPasswordChangeRequired(false);
      setBootstrapToken(null);
      await refreshUser();
    } catch (err: any) {
      setError(err.message || 'Could not update the Super Admin password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBootstrapPinChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const portalPinChange = activeTab === 'student' || activeTab === 'parent';
    if (!(portalPinChange ? /^\d{6}$/.test(newAdminPin) : /^\d{4,6}$/.test(newAdminPin)) || ['000000','123456','111111','222222','333333','444444','555555','666666','777777','888888','999999'].includes(newAdminPin)) { setError(portalPinChange ? 'Choose a strong 6-digit PIN.' : 'PIN must contain 4 to 6 digits.'); return; }
    if (newAdminPin !== confirmAdminPin) { setError('PINs do not match.'); return; }
    if (!bootstrapToken) { setError('This setup session expired. Sign in again.'); return; }
    setIsLoading(true);
    setError(null);
    try {
      await ApiClient.changePin(newAdminPin, bootstrapToken);
      setNewAdminPin('');
      setConfirmAdminPin('');
      setPinChangeRequired(false);
      setBootstrapToken(null);
      await refreshUser();
    } catch (err: any) {
      setError(err.message || 'Could not set the School Admin PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="schoolos-login-page min-h-screen">
      <div className="schoolos-login-layout">
        <section className="schoolos-login-welcome" aria-label="SchoolOS welcome">
          <div className="schoolos-login-orb schoolos-login-orb-one" />
          <div className="schoolos-login-orb schoolos-login-orb-two" />
          <div className="schoolos-login-orb schoolos-login-orb-three" />
          <div className="schoolos-login-welcome-copy">
            <div className="schoolos-login-brand-mark">S</div>
            <p className="schoolos-login-eyebrow">WELCOME TO</p>
            <h1>SchoolOS</h1>
            <p className="schoolos-login-welcome-subtitle">YOUR SCHOOL. YOUR FUTURE.</p>
            <p className="schoolos-login-welcome-description">One connected place for learning, teaching and managing your school community.</p>
            <div className="schoolos-login-welcome-rule" />
            <span className="schoolos-login-welcome-footer">LEARN · GROW · SUCCEED</span>
          </div>
        </section>
        <div className="schoolos-login-content">
      {/* Brand Header */}
      <div className="schoolos-login-heading sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 rounded-xl bg-[#0B2B2A] text-white flex items-center justify-center font-bold text-2xl mx-auto shadow-md">
          S
        </div>
        <h2 className="schoolos-login-title mt-4 text-2xl font-bold tracking-tight text-[#132A29]">
          SchoolOS Cloud SaaS
        </h2>
        <p className="schoolos-login-muted mt-1 text-xs text-[#64748B]">
          Enterprise Multi-School Management & Governance Platform
        </p>
      </div>

      {/* Main Login Card */}
      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="schoolos-login-card bg-white py-6 px-4 shadow-sm border border-[#E2E8F0] sm:rounded-xl sm:px-8">
          
          {pinChangeRequired ? (
            <form className="space-y-4" onSubmit={handleBootstrapPinChange}>
              <h3 className="text-base font-semibold text-[#132A29]">Change your temporary PIN</h3>
              <p className="text-xs text-[#64748B]">{activeTab === 'student' || activeTab === 'parent' ? 'Create a strong 6-digit PIN to protect your portal.' : 'Create a new 4–6 digit PIN for your School Admin account.'}</p>
              <PasswordInput label="new PIN" required minLength={activeTab === 'student' || activeTab === 'parent' ? 6 : 4} autoComplete="new-password" value={newAdminPin} onChange={e => setNewAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={activeTab === 'student' || activeTab === 'parent' ? '6-digit PIN' : '4–6 digit PIN'} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm" />
              <PasswordInput label="confirm new PIN" required minLength={activeTab === 'student' || activeTab === 'parent' ? 6 : 4} autoComplete="new-password" value={confirmAdminPin} onChange={e => setConfirmAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Confirm PIN" className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm" />
              {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
              <button disabled={isLoading} className="w-full rounded-lg bg-[#0F766E] py-2.5 text-xs font-semibold text-white">{isLoading ? 'Saving…' : 'Set PIN and continue'}</button>
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
          <div className="mb-5 flex items-center justify-between gap-3 text-xs">
            {parentStudentMode ? (
              <>
                <div role="tablist" aria-label="Portal login type" className="grid flex-1 grid-cols-2 rounded-xl bg-slate-100 p-1">
                  <button type="button" role="tab" aria-selected={activeTab === 'student'} onClick={() => { setActiveTab('student'); setPin(''); setShowPortalPin(false); setError(null); }} className={`rounded-lg px-3 py-2 font-semibold transition ${activeTab === 'student' ? 'bg-white text-[#0F766E] shadow-sm' : 'text-slate-500'}`}>Arday</button>
                  <button type="button" role="tab" aria-selected={activeTab === 'parent'} onClick={() => { setActiveTab('parent'); setPin(''); setShowPortalPin(false); setError(null); }} className={`rounded-lg px-3 py-2 font-semibold transition ${activeTab === 'parent' ? 'bg-white text-[#0F766E] shadow-sm' : 'text-slate-500'}`}>Waalid</button>
                </div>
                <button type="button" className="shrink-0 text-[#0F766E] underline" onClick={() => { setParentStudentMode(false); setActiveTab('school_admin'); setError(null); }}>Staff</button>
              </>
            ) : <button type="button" className="ml-auto text-[#0F766E] underline" onClick={() => { setParentStudentMode(true); setActiveTab('student'); setError(null); }}>Arday / Waalid</button>}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!parentStudentMode && (
            <p className="mb-4 text-center text-xs text-[#64748B]">
              Super Admin and School Admin use this same login. Enter your Super Admin email or your School Admin ID; the correct account type is detected automatically.
            </p>
          )}

          {/* Form */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            
            {/* ONE SHARED ADMIN LOGIN: Super Admin email/password or School Admin ID/PIN */}
            {activeTab === 'school_admin' && !parentStudentMode && (
              <>
                <div>
                  <label className="block text-xs font-medium text-[#334155]">
                    {email.trim().includes('@') ? 'Super Admin Email' : 'School Admin ID'}
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setPin(''); setPassword(''); setError(null); }}
                    placeholder="Enter Super Admin email or School Admin ID"
                    className="mt-1 w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>
                {email.trim().includes('@') ? (
                  <div>
                    <label className="block text-xs font-medium text-[#334155]">Super Admin Password</label>
                    <PasswordInput
                      label="Super Admin password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="mt-1 w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-[#334155]">School Admin PIN (4–6 digits)</label>
                    <PasswordInput
                      label="School Admin PIN"
                      required
                      value={pin}
                      onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Enter your PIN"
                      autoComplete="current-password"
                      className="mt-1 w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
                    />
                  </div>
                )}
              </>
            )}

            {/* PARENT LOGIN: School Code + Phone + 6-digit PIN */}
            {activeTab === 'parent' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-[#334155]">{t('school_code')}</label>
                  <input type="text" required value={schoolCode} onChange={e => setSchoolCode(e.target.value.toUpperCase())} placeholder="e.g. MOG01" className="mt-1 w-full px-3 py-2 text-xs font-mono uppercase border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#334155]">Parent phone number</label>
                  <input type="tel" required autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+252615000000" className="mt-1 w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#334155]">6-digit PIN</label>
                  <div className="mt-1 flex gap-2">
                    <input type={showPortalPin ? 'text' : 'password'} inputMode="numeric" autoComplete="current-password" maxLength={6} required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit PIN" className="min-w-0 flex-1 px-3 py-2 text-xs font-mono tracking-widest border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]" />
                    <button type="button" onClick={() => setShowPortalPin(value => !value)} className="rounded-lg border border-[#CBD5E1] px-3 text-xs">{showPortalPin ? 'Hide' : 'Show'}</button>
                  </div>
                  <p className="mt-1 text-[11px] text-[#64748B]">PIN illoobay? La xidhiidh dugsigaaga.</p>
                </div>
              </>
            )}

            {/* STUDENT LOGIN: School Code + Student ID + 6-digit PIN */}
            {activeTab === 'student' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-[#334155]">{t('school_code')}</label>
                  <input type="text" required value={schoolCode} onChange={e => setSchoolCode(e.target.value.toUpperCase())} placeholder="e.g. MOG01" className="mt-1 w-full px-3 py-2 text-xs font-mono uppercase border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#334155]">Student ID</label>
                  <input type="text" required autoComplete="username" value={studentId} onChange={e => setStudentId(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40))} placeholder="e.g. ST-0421" className="mt-1 w-full px-3 py-2 text-xs font-mono border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#334155]">6-digit PIN</label>
                  <div className="mt-1 flex gap-2">
                    <input type={showPortalPin ? 'text' : 'password'} inputMode="numeric" autoComplete="current-password" maxLength={6} required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit PIN" className="min-w-0 flex-1 px-3 py-2 text-xs font-mono tracking-widest border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]" />
                    <button type="button" onClick={() => setShowPortalPin(value => !value)} className="rounded-lg border border-[#CBD5E1] px-3 text-xs">{showPortalPin ? 'Hide' : 'Show'}</button>
                  </div>
                  <p className="mt-1 text-[11px] text-[#64748B]">PIN illoobay? La xidhiidh Form Teacher-kaaga.</p>
                </div>
              </>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || authCheckPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0F766E] disabled:opacity-50"
            >
              {isLoading ? 'Verifying...' : 'Sign in to Platform'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
          </>}

        </div>
      </div>

      </div>
      </div>
      {/* Forgot Password Modal */}
    </div>
  );
};
