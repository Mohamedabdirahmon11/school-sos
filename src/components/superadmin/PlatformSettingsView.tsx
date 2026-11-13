/**
 * Super Admin Global Platform Settings
 * Settings:
 * 1. Subscription Lifecycle: Trial days, Grace days, platform currency, read-only mode after expiry
 * 2. Security & Governance: Lockout threshold, lockout duration, session timeout, 2FA enforcement
 * 3. Academic Calendar: Single synchronized academic year name, Semester 1 & 2 start and end dates for all schools
 * 4. Multi-Language Switcher: English, Somali, and Amharic enable toggle
 * 5. Database Backups: On-demand backup snapshot & platform JSON download
 */

import React, { useState, useEffect, useCallback } from 'react';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoadError(null);
    try {
      setSettings(await ApiClient.getSettings());
    } catch (error: any) {
      setLoadError(error.message || 'Unable to load platform settings.');
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await ApiClient.updateSettings(settings);
      setSettings(updated);
      setNotice('Platform configuration saved and live across all tenants.');
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setSaveError(err.message || 'Unable to save platform settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPlatformBackup = async () => {
    setIsBackingUp(true);
    setSaveError(null);
    try {
      const res = await ApiClient.getPlatformBackup();
      if (res?.checksum?.algorithm !== 'sha256' || typeof res.checksum.value !== 'string'
        || !res.backupDate || !res.version || !res.manifest || !res.data) {
        throw new Error('The backup response is incomplete or has no integrity checksum. No file was downloaded.');
      }
      const checksumPayload = JSON.stringify({
        backupDate: res.backupDate,
        version: res.version,
        manifest: res.manifest,
        data: res.data
      });
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(checksumPayload));
      const actualChecksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (actualChecksum !== res.checksum.value.toLowerCase()) {
        throw new Error('Backup integrity verification failed. The file was not downloaded.');
      }

      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `schoolos_platform_backup_${new Date().toISOString().split('T')[0]}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Backup checksum verified and the platform export was downloaded.');
      setTimeout(() => setNotice(null), 5000);

      try {
        setSettings(await ApiClient.getSettings());
      } catch {
        setSaveError('Backup downloaded and verified, but the backup status could not be refreshed.');
      }
    } catch (err: any) {
      setSaveError(err.message || 'Failed to generate or verify platform backup.');
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

  if (!settings) return loadError ? (
    <div role="alert" className="m-6 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
      <p className="font-semibold">Platform settings could not be loaded.</p>
      <p className="mt-1">{loadError}</p>
      <button type="button" onClick={() => void loadSettings()} className="mt-3 font-semibold underline">Retry loading</button>
    </div>
  ) : <div role="status" aria-busy="true" className="p-6 text-xs text-[#64748B]">Loading settings...</div>;

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

      {saveError && <div role="alert" className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800">{saveError}</div>}

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
              <p className="text-[10px] text-[#64748B] mt-0.5">Locks after {settings.lockoutThreshold} failed attempts</p>
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
              <p className="text-[10px] text-[#64748B] mt-0.5">Account locked for {settings.lockoutDurationMinutes} minutes</p>
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
              <p className="text-[10px] text-[#64748B] mt-0.5">Session expires after {settings.sessionTimeoutMinutes} minutes</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
            <div>
              <p className="font-semibold text-[#132A29]">Record security events</p>
              <p className="text-[11px] text-[#64748B]">Controls security-category audit records such as lockouts and security changes. Other audit categories remain recorded.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.logSecurityEvents}
              onChange={e => setSettings({ ...settings, logSecurityEvents: e.target.checked })}
              className="w-4 h-4 text-[#0F766E] rounded"
            />
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

            {(['so', 'am'] as const).map(code => (
              <label key={code} className="p-3 border border-slate-200 rounded-lg flex items-center justify-between cursor-pointer hover:bg-slate-50">
                <span>
                  <span className="block font-semibold text-[#132A29]">{code === 'so' ? 'Somali (SO)' : 'Amharic (AM)'}</span>
                  <span className="block text-[10px] text-[#64748B]">{code === 'so' ? 'Af-Soomaali' : 'አማርኛ'}</span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.enabledLanguages.includes(code)}
                  onChange={() => toggleLanguage(code)}
                  className="w-4 h-4 text-[#0F766E] rounded"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Database Backup & Disaster Recovery */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#132A29] flex items-center gap-2">
                <Database className="w-4 h-4 text-[#0F766E]" />
                <span>Database Backups & Disaster Recovery</span>
              </h2>
              <p className="mt-1 text-[11px] text-[#64748B]">A GitHub Actions workflow can create encrypted off-site backups when all required private Supabase and S3 secrets are configured. The manual JSON export is separate, excludes credentials, and is not a full-platform restore image.</p>
            </div>
            <button
              type="button"
              onClick={handleDownloadPlatformBackup}
              disabled={isBackingUp}
              className="px-3 py-1.5 bg-[#0F766E] hover:bg-[#0D655E] disabled:opacity-60 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isBackingUp ? 'Generating...' : 'Generate & Download Backup'}</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-[#334155]">Backup Frequency Preference</label>
              <select
                value={settings.backupSchedule}
                onChange={e => setSettings({ ...settings, backupSchedule: e.target.value as SuperAdminSettings['backupSchedule'] })}
                className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
              >
                <option value="daily">Daily (GitHub Actions)</option>
                <option value="weekly">Weekly (GitHub Actions)</option>
                <option value="manual">Manual only</option>
              </select>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-800 sm:col-span-2">
              The scheduled workflow is currently blocked because its required GitHub Actions secrets are missing. Configure SUPABASE_DB_URL, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY, BACKUP_S3_REGION, and BACKUP_S3_BUCKET to enable encrypted off-site backups. Until then, only the manual JSON export is available. Full-platform restore is not supported.
            </p>
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <p className="font-medium text-[#334155]">Last manual platform export generated</p>
              <p className="mt-1 text-[11px] text-[#64748B]">
                {settings.lastBackupDate && settings.lastBackupStatus === 'success'
                  ? new Date(settings.lastBackupDate).toLocaleString()
                  : settings.lastBackupStatus === 'failed'
                    ? 'Last backup attempt failed'
                    : 'No verified backup recorded'}
              </p>
              {settings.lastBackupStatus === 'failed' && <p className="mt-1 text-[10px] text-rose-700">Generate a new backup and verify the download.</p>}
            </div>
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
