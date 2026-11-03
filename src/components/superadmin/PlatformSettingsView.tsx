/**
 * Super Admin Global Platform Settings
 * Settings:
 * 1. Subscription Lifecycle: Trial days, Grace days, platform currency, read-only mode after expiry
 * 2. Security & Governance: Lockout threshold, lockout duration, session timeout, 2FA enforcement
 * 3. Academic Calendar: Single synchronized academic year name, Semester 1 & 2 start and end dates for all schools
 * 4. Multi-Language Switcher: English, Somali, and Amharic enable toggle
 * 5. Database Backups: On-demand backup snapshot & platform JSON download
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { SuperAdminSettings } from '../../types/index.ts';
import { 
  Settings, 
  Shield, 
  Clock, 
  Database, 
  Globe, 
  CheckCircle2, 
  RefreshCw, 
  Calendar, 
  Download,
  Languages
} from 'lucide-react';

export const PlatformSettingsView: React.FC = () => {
  const [settings, setSettings] = useState<SuperAdminSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    ApiClient.getSettings().then(setSettings).catch(console.error);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setIsSaving(true);
    try {
      const updated = await ApiClient.updateSettings(settings);
      setSettings(updated);
      setNotice('Platform configuration saved and live across all tenants.');
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPlatformBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await ApiClient.getPlatformBackup();
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schoolos_platform_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      setNotice('Platform backup snapshot downloaded successfully.');
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Failed to download backup');
    } finally {
      setIsBackingUp(false);
    }
  };

  const toggleLanguage = (code: 'en' | 'so' | 'am') => {
    if (!settings) return;
    let list = [...settings.enabledLanguages];
    if (list.includes(code)) {
      if (code === 'en') return; // English is mandatory base
      list = list.filter(c => c !== code);
    } else {
      list.push(code);
    }
    setSettings({ ...settings, enabledLanguages: list });
  };

  if (!settings) return <div className="p-6 text-xs text-[#64748B]">Loading settings...</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
          Platform Security & System Governance
        </h1>
        <p className="text-xs text-[#64748B]">
          Global subscription rules, session policies, brute-force lockouts, and synchronized academic calendar
        </p>
      </div>

      {notice && (
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6 text-xs">
        {/* Academic Calendar (Same for all schools) */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-4 shadow-xs">
          <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#0F766E]" />
            <span>Academic Calendar & Semester Dates (Universal for All Schools)</span>
          </h2>
          <p className="text-[11px] text-[#64748B]">
            All tenant schools follow exactly these synchronized dates. Individual schools cannot alter semester timelines.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-[#334155]">Academic Year Name</label>
              <input
                type="text"
                required
                value={settings.academicYearName}
                onChange={e => setSettings({ ...settings, academicYearName: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#334155]">Semester 1 Start</label>
              <input
                type="date"
                required
                value={settings.semester1Start}
                onChange={e => setSettings({ ...settings, semester1Start: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-[#334155]">Semester 1 End</label>
              <input
                type="date"
                required
                value={settings.semester1End}
                onChange={e => setSettings({ ...settings, semester1End: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block font-medium text-[#334155]">Semester 2 Start</label>
              <input
                type="date"
                required
                value={settings.semester2Start}
                onChange={e => setSettings({ ...settings, semester2Start: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-[#334155]">Semester 2 End</label>
              <input
                type="date"
                required
                value={settings.semester2End}
                onChange={e => setSettings({ ...settings, semester2End: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Subscription & Lifecycle Policies */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-4 shadow-xs">
          <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#0F766E]" />
            <span>Subscription Lifecycle Policies</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-[#334155]">Default Trial Duration (Days)</label>
              <input
                type="number"
                min="1"
                max="90"
                value={settings.trialDays}
                onChange={e => setSettings({ ...settings, trialDays: parseInt(e.target.value, 10) || 7 })}
                className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#334155]">Grace Period Allowance (Days)</label>
              <input
                type="number"
                min="0"
                max="60"
                value={settings.graceDays}
                onChange={e => { const value = e.target.value; setSettings({ ...settings, graceDays: value === '' ? 0 : Math.min(60, Math.max(0, Number.parseInt(value, 10) || 0)) }); }}
                className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#334155]">Default Platform Currency</label>
              <select
                value={settings.platformCurrency}
                onChange={e => setSettings({ ...settings, platformCurrency: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
              >
                <option value="USD">USD ($)</option>
                <option value="SOS">SOS (Somali Shilling)</option>
                <option value="ETB">ETB (Ethiopian Birr)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
            <div>
              <p className="font-semibold text-[#132A29]">Enforce Read-Only Mode Upon Grace Expiry</p>
              <p className="text-[11px] text-[#64748B]">When grace ends, write mutations are strictly blocked in the backend.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.readOnlyAfterExpiry}
              onChange={e => setSettings({ ...settings, readOnlyAfterExpiry: e.target.checked })}
              className="w-4 h-4 text-[#0F766E] rounded"
            />
          </div>
        </div>

        {/* Security & Authentication Rules */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-4 shadow-xs">
          <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#0F766E]" />
            <span>Security, Rate Limiting & Lockout Rules</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-[#334155]">Failed Login Threshold</label>
              <input
                type="number"
                min="3"
                max="10"
                value={settings.lockoutThreshold}
                onChange={e => setSettings({ ...settings, lockoutThreshold: parseInt(e.target.value, 10) || 5 })}
                className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
              />
              <p className="text-[10px] text-[#64748B] mt-0.5">Locks after 5 failed attempts</p>
            </div>

            <div>
              <label className="block font-medium text-[#334155]">Lockout Duration (Minutes)</label>
              <input
                type="number"
                min="5"
                max="120"
                value={settings.lockoutDurationMinutes}
                onChange={e => setSettings({ ...settings, lockoutDurationMinutes: parseInt(e.target.value, 10) || 15 })}
                className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
              />
              <p className="text-[10px] text-[#64748B] mt-0.5">Account locked for 15 minutes</p>
            </div>

            <div>
              <label className="block font-medium text-[#334155]">Session Inactivity Timeout</label>
              <input
                type="number"
                min="15"
                max="360"
                value={settings.sessionTimeoutMinutes}
                onChange={e => setSettings({ ...settings, sessionTimeoutMinutes: parseInt(e.target.value, 10) || 60 })}
                className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
              />
              <p className="text-[10px] text-[#64748B] mt-0.5">Default 60 minutes</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
            <div>
              <p className="font-semibold text-[#132A29]">Enable 2FA feature</p>
              <p className="text-[11px] text-[#64748B]">Off by default. When enabled, the retained Super Admin TOTP setup and verification endpoints are available.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.requireSuperAdmin2FA}
              onChange={e => setSettings({ ...settings, requireSuperAdmin2FA: e.target.checked })}
              className="w-4 h-4 text-[#0F766E] rounded"
            />
          </div>
        </div>

        {/* Multi-Language Governance */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-4 shadow-xs">
          <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
            <Languages className="w-4 h-4 text-[#0F766E]" />
            <span>Supported Languages</span>
          </h2>
          <p className="text-[11px] text-[#64748B]">
            English and Somali are available by default. Amharic can be enabled or disabled for the platform.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#132A29]">English (EN)</p>
                <p className="text-[10px] text-[#64748B]">Default System Base</p>
              </div>
              <span className="text-[10px] uppercase font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">Enabled</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#132A29]">Somali (SO)</p>
                <p className="text-[10px] text-[#64748B]">Af-Soomaali</p>
              </div>
              <span className="text-[10px] uppercase font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">Enabled</span>
            </div>

            <div className="p-3 border rounded-lg flex items-center justify-between cursor-pointer hover:bg-slate-50"
                 onClick={() => toggleLanguage('am')}>
              <div>
                <p className="font-semibold text-[#132A29]">Amharic (AM)</p>
                <p className="text-[10px] text-[#64748B]">አማርኛ</p>
              </div>
              <input
                type="checkbox"
                checked={settings.enabledLanguages.includes('am')}
                onChange={() => toggleLanguage('am')}
                className="w-4 h-4 text-[#0F766E] rounded"
              />
            </div>
          </div>
        </div>

        {/* Database Backup & Disaster Recovery */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
              <Database className="w-4 h-4 text-[#0F766E]" />
              <span>Database Backups & Disaster Recovery</span>
            </h2>
            <button
              type="button"
              onClick={handleDownloadPlatformBackup}
              disabled={isBackingUp}
              className="px-3 py-1.5 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isBackingUp ? 'Generating...' : 'Download Full Backup (JSON)'}</span>
            </button>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg font-semibold shadow-sm transition-colors text-xs"
          >
            {isSaving ? 'Applying Settings...' : 'Save Platform Governance Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};
