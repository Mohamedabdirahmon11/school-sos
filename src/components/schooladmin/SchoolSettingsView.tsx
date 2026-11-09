/**
 * Comprehensive School Settings Hub
 * Features:
 * 1. Institution Identity & Branding (Name, Logo, Brand Color, Currency, Super Admin locked academic dates)
 * 2. School Branches Manager (Multi-branch campus management)
 * 3. Report Card Designer (Template picker, color schemes, logo position, blocks visibility, stamp/signature, live preview)
 * 4. Administrator WhatsApp contact (manual parent messaging; no SMS provider)
 * 5. School Backup & Data Safety (Full JSON backup download, CSV exports)
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ApiClient } from '../../services/api.ts';
import { SchoolBranch, ReportCardDesign, ExamConfig, GradingBand } from '../../types/index.ts';
import { fileToJpegDataUrl } from '../../lib/image-upload.ts';
import { normalizeWhatsAppNumber } from '../../lib/whatsapp.ts';
import {
  Building2,
  Palette,
  Sliders,
  Save,
  CheckCircle2,
  GitBranch,
  FileText,
  Database,
  Download,
  Plus,
  Eye,
  Check,
  AlertCircle,
  ImagePlus,
  Trash2,
  Pencil,
  Star,
  Mail,
  Lock,
  X,
  Globe2,
  CalendarDays,
  ClipboardCheck,
  Bell,
  Clock
} from 'lucide-react';

type BranchForm = {
  name: string;
  address: string;
  phone: string;
  email: string;
  isMain: boolean;
};

type TimetableSettings = { firstPeriodStart: string; periodMinutes: number; breakAfterPeriod: number; breakMinutes: number };

const emptyBranchForm: BranchForm = { name: '', address: '', phone: '', email: '', isMain: false };
const defaultGradingScale: GradingBand[] = [
  { minPercentage: 90, label: 'A', remark: 'Excellent' },
  { minPercentage: 80, label: 'B', remark: 'Very good' },
  { minPercentage: 70, label: 'C', remark: 'Good' },
  { minPercentage: 60, label: 'D', remark: 'Satisfactory' },
  { minPercentage: 0, label: 'F', remark: 'Below pass mark' }
];
const defaultTerms = { semester1Start: '', semester1End: '', semester2Start: '', semester2End: '' };
const defaultAttendanceRules = { lateAfterMinutes: 15, absentAfterMinutes: 0, requireExcusedReason: true, allowParentExcuses: false };
const defaultNotificationPreferences = { email: true, sms: false, inApp: true, attendanceAlerts: true, feeReminders: true, examResults: true };
const defaultClassLevels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const SchoolSettingsView: React.FC = () => {
  const { school, isReadOnly, t, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'identity' | 'academics' | 'documents' | 'branches' | 'designer' | 'backup'>('identity');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savingSection, setSavingSection] = useState<string | null>(null);

  // Identity Form State
  const [name, setName] = useState(school?.name || '');
  const [brandColor, setBrandColor] = useState(school?.brandColor || '#0F766E');
  const [logoUrl, setLogoUrl] = useState(school?.logoUrl || '');
  const [address, setAddress] = useState(school?.address || '');
  const [city, setCity] = useState(school?.city || '');
  const [phone, setPhone] = useState(school?.phone || '');

  const [whatsappPhone, setWhatsappPhone] = useState(school?.whatsappPhone || '');
  const [email, setEmail] = useState(school?.email || '');
  const [currency, setCurrency] = useState(school?.currency || 'ETB');
  const [language, setLanguage] = useState(school?.language || 'en');
  const [timezone, setTimezone] = useState(school?.timezone || 'Africa/Addis_Ababa');
  const [studentAccessEnabled, setStudentAccessEnabled] = useState(school?.studentAccessEnabled === true);
  const [defaultClassCapacity, setDefaultClassCapacity] = useState(String(school?.defaultClassCapacity ?? 40));

  // Academic Rules State
  const [academicYear, setAcademicYear] = useState(school?.academicYear || '2026-2027');
  const [currentSemester, setCurrentSemester] = useState<'Semester 1' | 'Semester 2'>(school?.currentSemester || 'Semester 1');
  const [terms, setTerms] = useState(school?.terms || defaultTerms);
  const [gradingScale, setGradingScale] = useState<GradingBand[]>(school?.gradingScale?.length ? school.gradingScale : defaultGradingScale);
  const [attendanceRules, setAttendanceRules] = useState(school?.attendanceRules || defaultAttendanceRules);
  const [classLevels, setClassLevels] = useState<number[]>(school?.classLevels?.length ? school.classLevels : defaultClassLevels);
  const [examConfig, setExamConfig] = useState<ExamConfig | null>(null);
  const [timetableSettings, setTimetableSettings] = useState<TimetableSettings>({ firstPeriodStart: '08:00', periodMinutes: 40, breakAfterPeriod: 3, breakMinutes: 20 });

  // Documents & Notifications State
  const [reportCardHeader, setReportCardHeader] = useState(school?.reportCardHeader || '');
  const [reportCardFooter, setReportCardFooter] = useState(school?.reportCardFooter || '');
  const [receiptHeader, setReceiptHeader] = useState(school?.receiptHeader || '');
  const [receiptFooter, setReceiptFooter] = useState(school?.receiptFooter || '');
  const [notificationPreferences, setNotificationPreferences] = useState({ ...defaultNotificationPreferences, ...(school?.notificationPreferences || {}), sms: false });

  // Branches State
  const [branches, setBranches] = useState<SchoolBranch[]>([]);
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [editingBranch, setEditingBranch] = useState<SchoolBranch | null>(null);
  const [branchForm, setBranchForm] = useState<BranchForm>(emptyBranchForm);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [isBranchSaving, setIsBranchSaving] = useState(false);

  // Report Card Designer State
  const [design, setDesign] = useState<ReportCardDesign | null>(null);

  useEffect(() => {
    if (!school) return;
    ApiClient.getBranches()
      .then(items => setBranches([...items].sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.name.localeCompare(b.name))))
      .catch((err: any) => setBranchError(err.message || 'Failed to load campus branches.'));
    ApiClient.getReportCardDesign().then(setDesign);
    ApiClient.getExamConfig().then(setExamConfig).catch(() => setExamConfig(null));
    ApiClient.getTimetableSettings().then(settings => setTimetableSettings({
      firstPeriodStart: settings.firstPeriodStart,
      periodMinutes: settings.periodMinutes,
      breakAfterPeriod: settings.breakAfterPeriod,
      breakMinutes: settings.breakMinutes
    }));
  }, [school]);

  // Save Identity
  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !school) return;
    setError(null);
    if (!name.trim()) { setError('Official school name is required.'); return; }
    if (whatsappPhone.trim() && !normalizeWhatsAppNumber(whatsappPhone)) { setError('Admin WhatsApp number must include an international country code, for example +2519XXXXXXXX.'); return; }
    if (!/^#[0-9a-f]{6}$/i.test(brandColor)) { setError('Brand color must be a six-digit hex color such as #0F766E.'); return; }
    const capacity = Number(defaultClassCapacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) { setError('Default class capacity must be a whole number between 1 and 500.'); return; }
    try {
      Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      setError('Timezone must be a valid IANA timezone such as Africa/Addis_Ababa.');
      return;
    }
    setIsSaving(true);
    try {
      await ApiClient.request('/school/settings', {
        method: 'PUT',
        body: JSON.stringify({
          name,
          brandColor,
          logoUrl,
          address,
          city,

          currency,
          language,
          timezone,
          studentAccessEnabled,
          defaultClassCapacity: capacity
        })
      });
      await refreshUser();
      setNotice('School identity and configuration updated successfully!');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update school profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveSchoolSection = async (section: string, payload: Record<string, unknown>, successMessage: string) => {
    if (isReadOnly) return;
    setSavingSection(section);
    setError(null);
    try {
      await ApiClient.request('/school/settings', { method: 'PUT', body: JSON.stringify(payload) });
      await refreshUser();
      setNotice(successMessage);
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setError(err.message || 'The school settings could not be saved.');
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveAcademics = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setError(null);
    if (!/^\d{4}-\d{4}$/.test(academicYear)) { setError('Academic year must use YYYY-YYYY.'); return; }
    if (!classLevels.length) { setError('Select at least one class level.'); return; }
    if (!gradingScale.length) { setError('Add at least one grade band.'); return; }
    const sortedBands = [...gradingScale].sort((a, b) => b.minPercentage - a.minPercentage);
    if (sortedBands[sortedBands.length - 1].minPercentage !== 0) { setError('The final grade band must start at 0%.'); return; }
    if (sortedBands.some((band, index) => index > 0 && band.minPercentage >= sortedBands[index - 1].minPercentage)) { setError('Grade bands must use strictly descending minimum percentages.'); return; }
    if (sortedBands.some(band => !band.label.trim())) { setError('Each grade band needs a label.'); return; }
    if (terms.semester1Start && terms.semester1End && terms.semester1Start > terms.semester1End) { setError('Semester 1 start date must be on or before its end date.'); return; }
    if (terms.semester2Start && terms.semester2End && terms.semester2Start > terms.semester2End) { setError('Semester 2 start date must be on or before its end date.'); return; }
    if (terms.semester1End && terms.semester2Start && terms.semester1End > terms.semester2Start) { setError('Semester 2 must start after Semester 1 ends.'); return; }
    await saveSchoolSection('academics', {
      academicYear,
      currentSemester,
      terms,
      gradingScale: sortedBands,
      attendanceRules,
      classLevels
    }, 'Academic year, terms, grading, attendance, and class levels saved successfully!');
  };

  const handleSaveExamRules = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !examConfig) return;
    setError(null);
    if ([examConfig.smallExamMax, examConfig.bigExamMax].some(value => !Number.isFinite(value) || value < 1)) { setError('Exam maximum marks must be at least 1.'); return; }
    if (!Number.isFinite(examConfig.passMarkPercentage) || examConfig.passMarkPercentage < 0 || examConfig.passMarkPercentage > 100) { setError('Pass mark must be between 0 and 100.'); return; }
    setSavingSection('exams');
    try {
      const updated = await ApiClient.updateExamConfig({
        smallExamMax: examConfig.smallExamMax,
        bigExamMax: examConfig.bigExamMax,
        passMarkPercentage: examConfig.passMarkPercentage
      });
      setExamConfig(updated);
      setNotice('Exam maximum marks and pass mark saved successfully!');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save exam rules.');
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveTimetable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setError(null);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timetableSettings.firstPeriodStart)) { setError('Timetable start must use HH:MM.'); return; }
    if (!Number.isInteger(timetableSettings.periodMinutes) || timetableSettings.periodMinutes < 20 || timetableSettings.periodMinutes > 120) { setError('Period length must be a whole number between 20 and 120 minutes.'); return; }
    if (!Number.isInteger(timetableSettings.breakMinutes) || timetableSettings.breakMinutes < 0 || timetableSettings.breakMinutes > 120) { setError('Break length must be a whole number between 0 and 120 minutes.'); return; }
    setSavingSection('timetable');
    try {
      const updated = await ApiClient.saveTimetableSettings(timetableSettings) as TimetableSettings;
      setTimetableSettings(updated);
      setNotice('Timetable period and break settings saved successfully!');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save timetable settings.');
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveDocuments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    await saveSchoolSection('documents', {
      reportCardHeader,
      reportCardFooter,
      receiptHeader,
      receiptFooter,
      notificationPreferences: { ...notificationPreferences, sms: false }
    }, 'Document headers, footers, and notification preferences saved successfully!');
  };

  const sortBranches = (items: SchoolBranch[]) => [...items].sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.name.localeCompare(b.name));

  const openBranchForm = (branch?: SchoolBranch) => {
    setEditingBranch(branch || null);
    setBranchForm(branch ? {
      name: branch.name,
      address: branch.address,
      phone: branch.phone || '',
      email: branch.email || '',
      isMain: branch.isMain
    } : { ...emptyBranchForm });
    setBranchError(null);
    setShowAddBranch(true);
  };

  const closeBranchForm = () => {
    if (isBranchSaving) return;
    setShowAddBranch(false);
    setEditingBranch(null);
    setBranchError(null);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || isBranchSaving) return;
    setIsBranchSaving(true);
    setBranchError(null);
    try {
      const payload = {
        name: branchForm.name,
        address: branchForm.address,
        phone: branchForm.phone,
        email: branchForm.email,
        isMain: branchForm.isMain
      };
      const saved = editingBranch
        ? await ApiClient.updateBranch(editingBranch.id, payload)
        : await ApiClient.createBranch(payload);
      setBranches(prev => sortBranches((editingBranch ? prev.map(item => item.id === saved.id ? saved : item) : [...prev, saved]).map(item => item.id === saved.id ? saved : saved.isMain && item.isMain ? { ...item, isMain: false } : item)));
      setShowAddBranch(false);
      setEditingBranch(null);
      setBranchForm({ ...emptyBranchForm });
      setNotice(editingBranch ? 'Campus branch updated successfully!' : 'New campus branch created successfully!');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setBranchError(err.message || 'The campus branch could not be saved.');
    } finally {
      setIsBranchSaving(false);
    }
  };

  const handleSetMainBranch = async (branch: SchoolBranch) => {
    if (isReadOnly || branch.isMain) return;
    setBranchError(null);
    setIsBranchSaving(true);
    try {
      const saved = await ApiClient.updateBranch(branch.id, { isMain: true });
      setBranches(prev => sortBranches(prev.map(item => item.id === saved.id ? saved : item.id === branch.id ? item : item.isMain ? { ...item, isMain: false } : item)));
      setNotice(`${saved.name} is now the main campus.`);
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setBranchError(err.message || 'The main campus could not be changed.');
    } finally {
      setIsBranchSaving(false);
    }
  };

  const handleDeleteBranch = async (branch: SchoolBranch) => {
    if (isReadOnly || branch.isMain) return;
    if (!window.confirm(`Delete the empty campus branch "${branch.name}"? This action cannot be undone.`)) return;
    setBranchError(null);
    try {
      await ApiClient.deleteBranch(branch.id);
      setBranches(prev => prev.filter(item => item.id !== branch.id));
      setNotice(`Campus branch ${branch.name} was deleted.`);
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setBranchError(err.message || 'The campus branch could not be deleted.');
    }
  };

  // Save Report Card Design
  const handleSaveDesign = async () => {
    if (isReadOnly || !design) return;
    setIsSaving(true);
    try {
      const updated = await ApiClient.updateReportCardDesign(design);
      setDesign(updated);
      setNotice('Report Card Design saved successfully!');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setNotice(err.message || 'Failed to save design.');
    } finally {
      setIsSaving(false);
    }
  };

  const uploadImage = async (file: File | undefined, apply: (dataUrl: string) => void, maxDimension: number) => {
    if (!file) return;
    try {
      apply(await fileToJpegDataUrl(file, maxDimension));
      setNotice('Image compressed and ready. Save to keep it.');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setNotice(err.message || 'Image upload failed.');
    }
  };

  // Download School Backup JSON
  const handleDownloadBackup = async () => {
    try {
      const backupData = await ApiClient.getSchoolBackup();
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${school?.code || 'school'}_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
    } catch (err: any) {
      alert('Failed to generate school backup.');
    }
  };

  return (
    <div className="mx-auto min-w-0 w-full max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#132A29] flex items-center gap-2">
            <Sliders className="w-6 h-6 text-[#0F766E]" />
            School Settings
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Manage your school profile, academic calendar, branches, documents, report cards, and backups in one place.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="grid w-full grid-cols-2 gap-2 rounded-2xl border border-[#DCE7E4] bg-[#F5F8F7] p-2 text-xs shadow-sm sm:grid-cols-3 lg:grid-cols-6">
          <button
            type="button"
            onClick={() => setActiveTab('identity')}
            className={`w-full justify-center px-3 py-3 rounded-xl font-medium transition-colors flex items-center gap-1.5 text-center ${
              activeTab === 'identity' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Identity & Branding
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('academics')}
            className={`w-full justify-center px-3 py-3 rounded-xl font-medium transition-colors flex items-center gap-1.5 text-center ${
              activeTab === 'academics' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            {t('settings_academics')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('documents')}
            className={`w-full justify-center px-3 py-3 rounded-xl font-medium transition-colors flex items-center gap-1.5 text-center ${
              activeTab === 'documents' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            {t('settings_documents')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('branches')}
            className={`w-full justify-center px-3 py-3 rounded-xl font-medium transition-colors flex items-center gap-1.5 text-center ${
              activeTab === 'branches' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            {t('settings_branches')} ({branches.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('designer')}
            className={`w-full justify-center px-3 py-3 rounded-xl font-medium transition-colors flex items-center gap-1.5 text-center ${
              activeTab === 'designer' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Report Card Designer
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`w-full justify-center px-3 py-3 rounded-xl font-medium transition-colors flex items-center gap-1.5 text-center ${
              activeTab === 'backup' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Backup & Export
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: IDENTITY & BRANDING */}
      {activeTab === 'identity' && (
        <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm max-w-3xl space-y-5">
          <div className="flex items-center gap-4 pb-4 border-b border-[#E2E8F0]">
            <div
              className="w-14 h-14 rounded-xl text-white font-bold text-xl flex items-center justify-center shadow-xs"
              style={{ backgroundColor: brandColor }}
            >
              {school?.code ? school.code.slice(0, 2) : 'SC'}
            </div>
            <div>
              <h3 className="font-bold text-base text-[#132A29]">{name || 'School Name'}</h3>
              <p className="text-xs text-[#64748B]">
                School Code: <span className="font-mono text-[#0F766E] font-bold">{school?.code}</span>
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveIdentity} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-[#334155] mb-1">Official School Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Brand Theme Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={e => setBrandColor(e.target.value)}
                    className="w-9 h-9 p-0.5 border border-[#CBD5E1] rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={e => setBrandColor(e.target.value)}
                    className="flex-1 px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#334155] mb-1">School Logo</label>
                <div className="flex items-center gap-2">
                  {logoUrl && <img src={logoUrl} alt="School logo preview" className="w-10 h-10 rounded-lg border border-[#E2E8F0] object-contain bg-white p-1" />}
                  <input
                    type="text"
                    placeholder="https://example.com/logo.png or upload"
                    value={logoUrl}
                    onChange={e => setLogoUrl(e.target.value)}
                    className="flex-1 px-3 py-2 border border-[#CBD5E1] rounded-lg"
                  />
                  <label className="px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white font-semibold cursor-pointer hover:bg-slate-50 whitespace-nowrap">
                    <ImagePlus className="w-3.5 h-3.5 inline mr-1" />
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={isReadOnly}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        void uploadImage(file, setLogoUrl, 700);
                      }}
                    />
                  </label>
                  {logoUrl && (
                    <button type="button" onClick={() => setLogoUrl('')} disabled={isReadOnly} className="p-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50" title="Remove logo">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Campus City</label>
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-[#334155] mb-1">Physical Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Official School Telephone</label>
                <p className="mb-1 text-[11px] text-[#64748B]">Lambarka guud ee dugsiga; kama beddelmayo WhatsApp-ka maamulka.</p>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Admin WhatsApp Number</label>
                <p className="mb-1 text-[11px] text-[#64748B]">Geli lambarka gaarka ah ee maamulka WhatsApp ku isticmaalo, oo leh country code (+251...).</p>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="+2519XXXXXXXX"
                  value={whatsappPhone}
                  onChange={e => setWhatsappPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Official Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">School Currency</label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value as 'ETB' | 'USD' | 'SOS')}
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                >
                  <option value="USD">USD ($)</option>
                  <option value="SOS">SOS (Somali Shilling)</option>
                  <option value="ETB">ETB (Ethiopian Birr)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">{t('settings_language')}</label>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value as 'en' | 'so')}
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                >
                  <option value="en">English (default)</option>
                  <option value="so">Af-Soomaali</option>
                </select>
                <p className="text-[11px] text-[#64748B] mt-1">Used when a user has not chosen a language.</p>
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">{t('settings_timezone')}</label>
                <input
                  type="text"
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                  list="school-timezones"
                  placeholder="Africa/Addis_Ababa"
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                />
                <datalist id="school-timezones">
                  <option value="Africa/Addis_Ababa" />
                  <option value="Africa/Mogadishu" />
                  <option value="Africa/Nairobi" />
                  <option value="Africa/Djibouti" />
                  <option value="UTC" />
                </datalist>
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Default Class Capacity</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  required
                  value={defaultClassCapacity}
                  onChange={e => setDefaultClassCapacity(e.target.value)}
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                />
                <p className="text-[11px] text-[#64748B] mt-1">Starting capacity when creating a class.</p>
              </div>
            </div>

            <label className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={studentAccessEnabled}
                disabled={isReadOnly}
                onChange={e => setStudentAccessEnabled(e.target.checked)}
                className="mt-0.5 accent-[#0F766E]"
              />
              <span>
                <span className="block font-semibold text-[#334155]">{t('settings_student_portal')}</span>
                <span className="block text-[11px] text-[#64748B]">
                  {t('settings_student_portal_hint')}
                </span>
              </span>
            </label>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={isReadOnly || isSaving}
                className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: ACADEMICS & RULES */}
      {activeTab === 'academics' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <form onSubmit={handleSaveAcademics} className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm space-y-5 text-xs">
            <div>
              <h2 className="text-base font-bold text-[#132A29] flex items-center gap-2"><CalendarDays className="w-4 h-4 text-[#0F766E]" /> {t('settings_academic_calendar')}</h2>
              <p className="text-xs text-[#64748B] mt-0.5">Each school keeps its own academic calendar, class levels, grading scale, and attendance rules.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Academic Year</label>
                <input type="text" required value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="2026-2027" className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono" />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Current Term</label>
                <select value={currentSemester} onChange={e => setCurrentSemester(e.target.value as 'Semester 1' | 'Semester 2')} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg">
                  <option value="Semester 1">Semester 1</option>
                  <option value="Semester 2">Semester 2</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1"><span className="font-semibold text-[#334155]">Semester 1 starts</span><input type="date" value={terms.semester1Start} onChange={e => setTerms(prev => ({ ...prev, semester1Start: e.target.value }))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" /></label>
              <label className="space-y-1"><span className="font-semibold text-[#334155]">Semester 1 ends</span><input type="date" value={terms.semester1End} onChange={e => setTerms(prev => ({ ...prev, semester1End: e.target.value }))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" /></label>
              <label className="space-y-1"><span className="font-semibold text-[#334155]">Semester 2 starts</span><input type="date" value={terms.semester2Start} onChange={e => setTerms(prev => ({ ...prev, semester2Start: e.target.value }))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" /></label>
              <label className="space-y-1"><span className="font-semibold text-[#334155]">Semester 2 ends</span><input type="date" value={terms.semester2End} onChange={e => setTerms(prev => ({ ...prev, semester2End: e.target.value }))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" /></label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="font-semibold text-[#334155]">{t('settings_grading_scale')}</label>
                <button type="button" onClick={() => setGradingScale(prev => [...prev, { minPercentage: 0, label: '', remark: '' }])} className="px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] text-[11px] font-semibold text-[#334155] hover:bg-slate-50">Add grade band</button>
              </div>
              <p className="text-[11px] text-[#64748B]">Minimum percentages must decrease and the final band must start at 0%.</p>
              {gradingScale.map((band, index) => (
                <div key={index} className="grid grid-cols-[72px_72px_1fr_32px] gap-2 items-center">
                  <input type="number" min={0} max={100} required value={band.minPercentage} onChange={e => setGradingScale(prev => prev.map((item, itemIndex) => itemIndex === index ? { ...item, minPercentage: Number(e.target.value) } : item))} className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded-lg font-mono" title="Minimum percentage" />
                  <input type="text" required maxLength={20} value={band.label} onChange={e => setGradingScale(prev => prev.map((item, itemIndex) => itemIndex === index ? { ...item, label: e.target.value } : item))} className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded-lg font-semibold" placeholder="Grade" title="Grade label" />
                  <input type="text" maxLength={120} value={band.remark || ''} onChange={e => setGradingScale(prev => prev.map((item, itemIndex) => itemIndex === index ? { ...item, remark: e.target.value } : item))} className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded-lg" placeholder="Remark (optional)" />
                  <button type="button" disabled={gradingScale.length <= 1} onClick={() => setGradingScale(prev => prev.filter((_, itemIndex) => itemIndex !== index))} className="p-1.5 rounded-lg border border-rose-200 text-rose-600 disabled:opacity-30" title="Remove grade band"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className="font-semibold text-[#334155]">{t('settings_class_levels')}</label>
              <div className="grid grid-cols-6 gap-2">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(level => (
                  <label key={level} className="flex items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] py-1.5 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={classLevels.includes(level)} onChange={e => setClassLevels(prev => e.target.checked ? [...prev, level].sort((a, b) => a - b) : prev.filter(item => item !== level))} className="accent-[#0F766E]" />
                    <span>{level === 0 ? 'KG' : level}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-[#E2E8F0] p-3">
              <label className="font-semibold text-[#334155] flex items-center gap-1.5"><ClipboardCheck className="w-3.5 h-3.5" /> {t('settings_attendance_rules')}</label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1"><span>Lateness after (minutes)</span><input type="number" min={0} max={240} value={attendanceRules.lateAfterMinutes} onChange={e => setAttendanceRules(prev => ({ ...prev, lateAfterMinutes: Number(e.target.value) }))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono" /></label>
                <label className="space-y-1"><span>Absent after (minutes)</span><input type="number" min={0} max={240} value={attendanceRules.absentAfterMinutes} onChange={e => setAttendanceRules(prev => ({ ...prev, absentAfterMinutes: Number(e.target.value) }))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono" /></label>
              </div>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={attendanceRules.requireExcusedReason} onChange={e => setAttendanceRules(prev => ({ ...prev, requireExcusedReason: e.target.checked }))} className="accent-[#0F766E]" /><span>Require a reason for excused absences</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={attendanceRules.allowParentExcuses} onChange={e => setAttendanceRules(prev => ({ ...prev, allowParentExcuses: e.target.checked }))} className="accent-[#0F766E]" /><span>Allow parents to submit absence excuses</span></label>
            </div>

            <div className="flex justify-end">
              <button type="submit" disabled={isReadOnly || savingSection === 'academics'} className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white font-semibold rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> {savingSection === 'academics' ? '...' : t('settings_save_academics')}
              </button>
            </div>
          </form>

          <div className="space-y-6">
            {examConfig && (
              <form onSubmit={handleSaveExamRules} className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm space-y-4 text-xs">
                <div>
                  <h2 className="text-base font-bold text-[#132A29]">{t('settings_exam_marks')}</h2>
                  <p className="text-xs text-[#64748B] mt-0.5">These values drive marks entry, report cards, and year-end promotion for this school.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <label className="space-y-1"><span className="font-semibold text-[#334155]">Small Exam Maximum</span><input type="number" min={1} max={1000} required value={examConfig.smallExamMax} onChange={e => setExamConfig({ ...examConfig, smallExamMax: Number(e.target.value) })} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono" /></label>
                  <label className="space-y-1"><span className="font-semibold text-[#334155]">Big Exam Maximum</span><input type="number" min={1} max={1000} required value={examConfig.bigExamMax} onChange={e => setExamConfig({ ...examConfig, bigExamMax: Number(e.target.value) })} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono" /></label>
                </div>
                <label className="block space-y-1"><span className="font-semibold text-[#334155]">Minimum Pass Mark (%)</span><input type="number" min={0} max={100} required value={examConfig.passMarkPercentage} onChange={e => setExamConfig({ ...examConfig, passMarkPercentage: Number(e.target.value) })} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono" /></label>
                <p className="text-[11px] text-[#64748B]">Combined maximum score: <span className="font-mono font-bold text-[#132A29]">{examConfig.smallExamMax + examConfig.bigExamMax}</span></p>
                <div className="flex justify-end">
                  <button type="submit" disabled={isReadOnly || savingSection === 'exams'} className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white font-semibold rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50">
                    <Save className="w-3.5 h-3.5" /> {savingSection === 'exams' ? '...' : t('settings_save_exam')}
                  </button>
                </div>
              </form>
            )}

            <form onSubmit={handleSaveTimetable} className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm space-y-4 text-xs">
              <div>
                <h2 className="text-base font-bold text-[#132A29] flex items-center gap-2"><Clock className="w-4 h-4 text-[#0F766E]" /> {t('settings_timetable')}</h2>
                <p className="text-xs text-[#64748B] mt-0.5">Monday to Friday, six periods per day, and five periods on Friday. These times drive the timetable generator.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1"><span className="font-semibold text-[#334155]">First Period Start</span><input type="time" required value={timetableSettings.firstPeriodStart} onChange={e => setTimetableSettings(prev => ({ ...prev, firstPeriodStart: e.target.value }))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono" /></label>
                <label className="space-y-1"><span className="font-semibold text-[#334155]">Period Length (minutes)</span><input type="number" min={20} max={120} required value={timetableSettings.periodMinutes} onChange={e => setTimetableSettings(prev => ({ ...prev, periodMinutes: Number(e.target.value) }))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono" /></label>
                <label className="space-y-1"><span className="font-semibold text-[#334155]">Break After Period</span><select value={timetableSettings.breakAfterPeriod} onChange={e => setTimetableSettings(prev => ({ ...prev, breakAfterPeriod: Number(e.target.value) }))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg">{[1, 2, 3, 4, 5].map(period => <option key={period} value={period}>{period}</option>)}</select></label>
                <label className="space-y-1"><span className="font-semibold text-[#334155]">Break Length (minutes)</span><input type="number" min={0} max={120} required value={timetableSettings.breakMinutes} onChange={e => setTimetableSettings(prev => ({ ...prev, breakMinutes: Number(e.target.value) }))} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono" /></label>
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={isReadOnly || savingSection === 'timetable'} className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white font-semibold rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" /> {savingSection === 'timetable' ? '...' : t('settings_save_timetable')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: DOCUMENTS & ALERTS */}
      {activeTab === 'documents' && (
        <form onSubmit={handleSaveDocuments} className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm max-w-3xl space-y-5 text-xs">
          <div>
            <h2 className="text-base font-bold text-[#132A29] flex items-center gap-2"><FileText className="w-4 h-4 text-[#0F766E]" /> {t('settings_documents')}</h2>
            <p className="text-xs text-[#64748B] mt-0.5">Headers and footers are printed on official report cards and cash receipts.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-1"><span className="font-semibold text-[#334155]">{t('settings_report_header')}</span><textarea rows={3} maxLength={300} value={reportCardHeader} onChange={e => setReportCardHeader(e.target.value)} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" placeholder="School motto or official heading" /></label>
            <label className="space-y-1"><span className="font-semibold text-[#334155]">{t('settings_report_footer')}</span><textarea rows={3} maxLength={300} value={reportCardFooter} onChange={e => setReportCardFooter(e.target.value)} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" placeholder="Contact details or verification note" /></label>
            <label className="space-y-1"><span className="font-semibold text-[#334155]">{t('settings_receipt_header')}</span><textarea rows={3} maxLength={300} value={receiptHeader} onChange={e => setReceiptHeader(e.target.value)} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" placeholder="Official receipt heading" /></label>
            <label className="space-y-1"><span className="font-semibold text-[#334155]">{t('settings_receipt_footer')}</span><textarea rows={3} maxLength={300} value={receiptFooter} onChange={e => setReceiptFooter(e.target.value)} className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" placeholder="Thank-you note or payment terms" /></label>
          </div>

          <div className="border-t border-[#E2E8F0] pt-5 space-y-3">
            <div>
              <h3 className="font-bold text-[#132A29] flex items-center gap-1.5"><Bell className="w-4 h-4 text-[#0F766E]" /> {t('settings_notifications')}</h3>
              <p className="text-[11px] text-[#64748B] mt-0.5">Choose which school alerts and delivery channels are enabled.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                ['email', 'Email notifications'],
                ['inApp', 'In-app notifications'],
                ['attendanceAlerts', 'Attendance alerts'],
                ['feeReminders', 'Fee reminders'],
                ['examResults', 'Exam result alerts']
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 p-2.5 rounded-lg border border-[#E2E8F0] hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={notificationPreferences[key]} onChange={e => setNotificationPreferences(prev => ({ ...prev, [key]: e.target.checked }))} className="accent-[#0F766E]" />
                  <span className="text-[#334155]">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={isReadOnly || savingSection === 'documents'} className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white font-semibold rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50">
              <Save className="w-3.5 h-3.5" /> {savingSection === 'documents' ? '...' : t('settings_save_documents')}
            </button>
          </div>
        </form>
      )}
      {/* TAB 2: BRANCHES */}
      {activeTab === 'branches' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm">
            <div>
              <h2 className="text-sm font-bold text-[#132A29]">Campus Branches & Locations</h2>
              <p className="text-xs text-[#64748B]">
                Manage multiple school campuses, contact details, and the main campus.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openBranchForm()}
              disabled={isReadOnly}
              className="px-3 py-2 bg-[#0F766E] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Branch
            </button>
          </div>

          {branchError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{branchError}</span>
            </div>
          )}

          {branches.length === 0 ? (
            <div className="bg-white p-8 rounded-xl border border-dashed border-[#CBD5E1] text-center">
              <GitBranch className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" />
              <p className="text-sm font-semibold text-[#334155]">No campus branches yet</p>
              <p className="text-xs text-[#64748B] mt-1">Add a branch to organize classes, students, and staff by location.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {branches.map(b => (
                <div key={b.id} className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-sm text-[#132A29]">{b.name}</h3>
                    {b.isMain && (
                      <span className="text-[10px] uppercase font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-200 whitespace-nowrap">
                        Main Campus
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5 text-xs text-[#64748B]">
                    <p className="flex items-start gap-1.5">
                      <Building2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{b.address}</span>
                    </p>
                    <p className="flex items-center gap-1.5 font-mono">
                      <Sliders className="w-3.5 h-3.5 shrink-0" />
                      <span>{b.phone || 'No telephone on file'}</span>
                    </p>
                    <p className="flex items-center gap-1.5 break-all">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span>{b.email || 'No email on file'}</span>
                    </p>
                  </div>
                  {!isReadOnly && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F1F5F9]">
                      <button
                        type="button"
                        onClick={() => openBranchForm(b)}
                        className="px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] text-[11px] font-semibold text-[#334155] hover:bg-slate-50 flex items-center gap-1"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                      {!b.isMain && (
                        <button
                          type="button"
                          onClick={() => handleSetMainBranch(b)}
                          disabled={isBranchSaving}
                          className="px-2.5 py-1.5 rounded-lg border border-teal-200 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 flex items-center gap-1 disabled:opacity-50"
                        >
                          <Star className="w-3 h-3" />
                          Make Main
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteBranch(b)}
                        disabled={b.isMain}
                        title={b.isMain ? 'Choose another main campus before deleting this branch.' : 'Delete branch'}
                        className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {showAddBranch && (
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl border border-[#E2E8F0] max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-base text-[#132A29]">{editingBranch ? 'Edit Campus Branch' : 'Add New Branch'}</h3>
                    <p className="text-xs text-[#64748B] mt-0.5">Branch details are visible to staff and used for campus-specific lists.</p>
                  </div>
                  <button type="button" onClick={closeBranchForm} className="p-1 text-[#64748B] hover:text-[#132A29]" title="Close">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {branchError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">{branchError}</div>
                )}
                <form onSubmit={handleSaveBranch} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-[#475569] mb-1">Branch Campus Name</label>
                    <input
                      type="text"
                      required
                      maxLength={150}
                      placeholder="e.g. North Campus"
                      value={branchForm.name}
                      onChange={e => setBranchForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#475569] mb-1">Campus Address</label>
                    <input
                      type="text"
                      required
                      maxLength={500}
                      placeholder="e.g. Hodan District"
                      value={branchForm.address}
                      onChange={e => setBranchForm(prev => ({ ...prev, address: e.target.value }))}
                      className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-[#475569] mb-1">Branch Telephone</label>
                      <input
                        type="tel"
                        maxLength={50}
                        value={branchForm.phone}
                        onChange={e => setBranchForm(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#475569] mb-1">Branch Email</label>
                      <input
                        type="email"
                        maxLength={150}
                        value={branchForm.email}
                        onChange={e => setBranchForm(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                      />
                    </div>
                  </div>
                  <label className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={branchForm.isMain}
                      disabled={Boolean(editingBranch?.isMain)}
                      onChange={e => setBranchForm(prev => ({ ...prev, isMain: e.target.checked }))}
                      className="mt-0.5 accent-[#0F766E] disabled:cursor-not-allowed"
                    />
                    <span>
                      <span className="block font-semibold text-[#334155]">Main campus</span>
                      <span className="block text-[11px] text-[#64748B]">{editingBranch?.isMain ? 'Use "Make Main" on another campus to transfer this status.' : 'The current main campus will be updated automatically.'}</span>
                    </span>
                  </label>
                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeBranchForm}
                      disabled={isBranchSaving}
                      className="px-3 py-2 text-xs text-[#64748B] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isBranchSaving || isReadOnly}
                      className="px-4 py-2 bg-[#0F766E] text-white font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isBranchSaving ? 'Saving...' : editingBranch ? 'Save Branch' : 'Create Campus Branch'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: REPORT CARD DESIGNER */}
      {activeTab === 'designer' && design && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Controls Panel */}
          <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm space-y-5">
            <div>
              <h2 className="text-base font-bold text-[#132A29]">Report Card Layout & Styles</h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Customize templates, brand accents, visible blocks, and administrative signatures.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Template Style</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['modern', 'classic', 'minimal', 'executive'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDesign({ ...design, templateId: t })}
                      className={`py-2 px-2 text-center rounded-lg border capitalize font-semibold transition-colors ${
                        design.templateId === t
                          ? 'border-[#0F766E] bg-teal-50 text-[#0F766E]'
                          : 'border-[#CBD5E1] hover:bg-slate-50 text-[#64748B]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#334155] mb-1">Header Title Text</label>
                <input
                  type="text"
                  value={design.titleText}
                  onChange={e => setDesign({ ...design, titleText: e.target.value })}
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-[#334155] mb-1">Logo Alignment</label>
                  <select
                    value={design.logoPosition}
                    onChange={e => setDesign({ ...design, logoPosition: e.target.value as any })}
                    className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                  >
                    <option value="left">Left Aligned</option>
                    <option value="center">Centered</option>
                    <option value="right">Right Aligned</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#334155] mb-1">Primary Color</label>
                  <input
                    type="color"
                    value={design.primaryColor}
                    onChange={e => setDesign({ ...design, primaryColor: e.target.value })}
                    className="w-full h-9 p-0.5 border border-[#CBD5E1] rounded-lg cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#334155] mb-1">Secondary Color</label>
                  <input
                    type="color"
                    value={design.secondaryColor}
                    onChange={e => setDesign({ ...design, secondaryColor: e.target.value })}
                    className="w-full h-9 p-0.5 border border-[#CBD5E1] rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#334155] mb-2">Report Card Images</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    { key: 'stampImageUrl', label: 'School Stamp' },
                    { key: 'signatureImageUrl', label: 'Signature' },
                    { key: 'ownDesignImageUrl', label: 'Background Design' }
                  ] as const).map(field => {
                    const value = design[field.key] || '';
                    return (
                      <div key={field.key} className="rounded-lg border border-[#E2E8F0] p-2.5 space-y-2">
                        <p className="font-semibold text-[#334155]">{field.label}</p>
                        {value ? (
                          <img src={value} alt={field.label} className="h-16 w-full object-contain rounded border border-[#F1F5F9] bg-white" />
                        ) : (
                          <div className="h-16 rounded border border-dashed border-[#CBD5E1] flex items-center justify-center text-[10px] text-[#64748B]">No image</div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <label className="flex-1 px-2 py-1.5 rounded border border-[#CBD5E1] bg-white text-center font-semibold cursor-pointer hover:bg-slate-50">
                            <ImagePlus className="w-3 h-3 inline mr-1" />
                            Upload
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={isReadOnly}
                              onChange={e => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                void uploadImage(file, dataUrl => setDesign(prev => prev ? { ...prev, [field.key]: dataUrl } : prev), field.key === 'ownDesignImageUrl' ? 1600 : 700);
                              }}
                            />
                          </label>
                          {value && (
                            <button type="button" disabled={isReadOnly} onClick={() => setDesign(prev => prev ? { ...prev, [field.key]: '' } : prev)} className="p-1.5 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50" title={`Remove ${field.label}`}>
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] text-[#64748B]">Uploads are compressed to JPEG in the browser (max ~2 MB) and embedded in PDFs. WebP/PNG stays visible in the app.</p>
              </div>

              {/* Block Visibility Checkboxes */}
              <div>
                <label className="block font-semibold text-[#334155] mb-2">Visible Content Blocks</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(design.visibleBlocks).map(([key, val]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-[#E2E8F0] hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={val}
                        onChange={e => setDesign({
                          ...design,
                          visibleBlocks: { ...design.visibleBlocks, [key]: e.target.checked }
                        })}
                        className="rounded text-[#0F766E] focus:ring-[#0F766E]"
                      />
                      <span className="capitalize text-[#334155] font-medium">
                        {key.replace(/([A-Z])/g, ' $1')}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-[#334155] mb-1">Left Signature Label</label>
                  <input
                    type="text"
                    value={design.signatureTitleLeft}
                    onChange={e => setDesign({ ...design, signatureTitleLeft: e.target.value })}
                    className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#334155] mb-1">Right Signature Label</label>
                  <input
                    type="text"
                    value={design.signatureTitleRight}
                    onChange={e => setDesign({ ...design, signatureTitleRight: e.target.value })}
                    className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveDesign}
                  disabled={isReadOnly || isSaving}
                  className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Design
                </button>
              </div>
            </div>
          </div>

          {/* Live Preview Card */}
          <div className="bg-slate-100 p-6 rounded-xl border border-[#CBD5E1] flex flex-col justify-start">
            <div className="flex items-center justify-between mb-3 text-xs font-semibold text-[#64748B]">
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Live Report Card Preview
              </span>
              <span className="uppercase text-[10px] px-2 py-0.5 rounded bg-white shadow-2xs font-bold text-[#0F766E]">
                {design.templateId} Template
              </span>
            </div>
            <p className="mb-3 rounded-lg bg-white px-3 py-2 text-[10px] text-[#64748B]">
              Layout preview only. Student, class, subject and result values are filled from real report-card data when cards are generated.
            </p>

            <div
              className={`bg-white p-6 rounded-lg shadow-sm border border-[#E2E8F0] space-y-4 text-xs font-sans ${design.templateId === 'classic' ? 'font-serif border-double border-4' : design.templateId === 'executive' ? 'border-2 rounded-lg' : design.templateId === 'minimal' ? 'border-0 border-t-4 rounded-none' : ''}`}
              style={{
                borderColor: design.templateId === 'executive' ? design.secondaryColor : design.primaryColor,
                backgroundImage: design.ownDesignImageUrl ? `url("${design.ownDesignImageUrl.replace(/"/g, '\\"')}")` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            >
              <div className={`pb-3 border-b-2 ${design.logoPosition === 'left' ? 'text-left' : design.logoPosition === 'right' ? 'text-right' : 'text-center'}`} style={{ borderColor: design.primaryColor, backgroundColor: design.templateId === 'executive' ? design.secondaryColor : undefined, padding: design.templateId === 'executive' ? '12px' : undefined }}>
                {school?.logoUrl ? (
                  <img src={school.logoUrl} alt="School logo" className={`w-10 h-10 object-contain rounded-lg bg-white p-1 mb-1 inline-flex ${design.templateId === 'executive' ? '' : ''}`} />
                ) : (
                  <div
                    className="w-10 h-10 rounded-lg text-white font-bold flex items-center justify-center mb-1 text-sm inline-flex"
                    style={{ backgroundColor: design.primaryColor }}
                  >
                    {school?.code ? school.code.slice(0, 2) : 'SC'}
                  </div>
                )}
                <h4 className="font-bold text-sm" style={{ color: design.templateId === 'executive' ? '#FFFFFF' : '#132A29' }}>{school?.name}</h4>
                <p className="text-[11px] font-semibold" style={{ color: design.templateId === 'executive' ? 'rgba(255,255,255,0.8)' : design.secondaryColor }}>{design.titleText}</p>
                <p className="text-[10px] text-[#64748B]">Academic Year: {school?.academicYear || 'Current'} | {design.templateId}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2 rounded">
                <div>Student: <span className="font-bold">Student Name</span></div>
                <div>Class: <span className="font-bold">Class</span></div>
                {design.visibleBlocks.rank && (
                  <div>Class Rank: <span className="font-bold" style={{ color: design.primaryColor }}>-</span></div>
                )}
                {design.visibleBlocks.percentage && (
                  <div>Yearly Percentage: <span className="font-bold" style={{ color: design.primaryColor }}>-</span></div>
                )}
              </div>

              <table className="w-full text-left text-[11px] border-t border-b border-[#E2E8F0]">
                <thead>
                  <tr className="text-[#64748B]">
                    <th className="py-1">Subject</th>
                    <th className="py-1 text-center">Sem 1</th>
                    <th className="py-1 text-center">Sem 2</th>
                    <th className="py-1 text-right">Yearly Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  <tr>
                    <td className="py-1 font-semibold">Subject</td>
                    <td className="py-1 text-center font-mono">-</td>
                    <td className="py-1 text-center font-mono">-</td>
                    <td className="py-1 text-right font-mono font-bold" style={{ color: design.primaryColor }}>-</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-semibold">Subject</td>
                    <td className="py-1 text-center font-mono">-</td>
                    <td className="py-1 text-center font-mono">-</td>
                    <td className="py-1 text-right font-mono font-bold" style={{ color: design.primaryColor }}>-</td>
                  </tr>
                </tbody>
              </table>

              {design.visibleBlocks.teacherRemarks && (
                <div className="rounded border border-[#CBD5E1] p-2 text-[10px] italic text-[#334155]">Teacher remarks appear here.</div>
              )}
              {design.visibleBlocks.adminRemarks && (
                <div className="rounded border border-[#CBD5E1] p-2 text-[10px] italic text-[#334155]">Administrator remarks appear here.</div>
              )}

              <div className="grid grid-cols-3 gap-4 pt-4 text-center text-[10px]">
                {design.visibleBlocks.signatures && (
                  <>
                    <div>
                      {design.signatureImageUrl
                        ? <img src={design.signatureImageUrl} alt="Signature" className="h-8 mx-auto object-contain" />
                        : <div className="border-b border-dashed border-[#94A3B8] h-6"></div>}
                      <p className="text-[#64748B] mt-1">{design.signatureTitleLeft}</p>
                    </div>
                    <div>
                      <div className="border-b border-dashed border-[#94A3B8] h-6"></div>
                      <p className="text-[#64748B] mt-1">{design.signatureTitleRight}</p>
                    </div>
                  </>
                )}
                {design.visibleBlocks.stamp && (
                  <div>
                    {design.stampImageUrl
                      ? <img src={design.stampImageUrl} alt="Stamp" className="h-10 mx-auto object-contain" />
                      : <div className="border-b border-dashed border-[#94A3B8] h-6 flex items-center justify-center"><span className="text-[8px] font-mono text-[#94A3B8]">[ STAMP ]</span></div>}
                    <p className="text-[#64748B] mt-1">Official Seal</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: BACKUP & DATA SAFETY */}
      {activeTab === 'backup' && (
        <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm max-w-2xl space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#132A29]">Data Safety, Backups & Exports</h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Generate full point-in-time backups and export raw tabular CSV files for external audits.
            </p>
          </div>

          <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl space-y-2">
            <h4 className="font-bold text-xs text-teal-900 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-teal-600" />
              Complete School Database Snapshot (JSON)
            </h4>
            <p className="text-[11px] text-teal-800">
              Downloads all classes, subjects, teachers, students, daily attendance, examination marks, and cash fee receipts for this institution.
            </p>
            <button
              type="button"
              onClick={handleDownloadBackup}
              className="mt-2 px-4 py-2 bg-[#0F766E] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              Download School Backup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
