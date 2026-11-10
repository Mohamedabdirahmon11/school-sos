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
        password
      });
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
          
          {passwordChangeRequired ? (
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

          {!parentStudentMode && (
            <p className="mb-4 text-center text-xs text-[#64748B]">
              One sign-in for Super Admin, School Admin, Accountant, and Teacher. Enter your email, phone, or school-issued Teacher ID; SchoolOS opens the correct dashboard automatically.
            </p>
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
                  <label className="block text-xs font-medium text-[#334155]">Email, phone, or Teacher ID</label>
                  <div className="mt-1">
                    <input
                      type="text"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="Email, phone, or STF-SCHOOL-0001"
                      className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-[#334155]">Password / Teacher PIN</label>
                    <span className="text-[11px] text-[#64748B] text-right max-w-[62%]">
                      Use your account password. Teachers may also use the PIN issued by their School Admin.
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
