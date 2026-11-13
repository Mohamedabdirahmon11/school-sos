/**
 * Super Admin Schools Directory, Add School Modal, School Detail, and Subscription Modifier Dialog
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { School, PlanTier, SubscriptionCadence, SubscriptionStatus, PlanConfig, SchoolCurrency, SchoolLanguage } from '../../types/index.ts';
import { formatMoney } from '../../lib/money.ts';
import { PasswordInput } from '../common/PasswordInput.tsx';
import { 
  Building2, 
  Search, 
  Plus, 
  Users, 
  GraduationCap, 
  ShieldCheck, 
  Clock, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  KeyRound, 
  ShieldAlert, 
  ExternalLink,
  ChevronRight,
  X,
  CreditCard,
  Trash2
} from 'lucide-react';

interface SchoolsViewProps {
  initialSchoolId?: string;
  onViewSchool?: (school: School) => void;
}

export const SchoolsView: React.FC<SchoolsViewProps> = ({ initialSchoolId, onViewSchool }) => {
  const { viewAsSchool, t } = useAuth();
  const [schools, setSchools] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedSchool, setSelectedSchool] = useState<any | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showEditSchoolModal, setShowEditSchoolModal] = useState(false);
  const [isUpdatingSubscription, setIsUpdatingSubscription] = useState(false);
  const [isSavingSchoolDetails, setIsSavingSchoolDetails] = useState(false);
  const [editSchoolError, setEditSchoolError] = useState<string | null>(null);
  const [editSchoolForm, setEditSchoolForm] = useState({
    name: '', email: '', address: '', city: '', country: '', region: '', schoolType: 'combined' as 'primary' | 'secondary' | 'combined', phone: '', whatsappPhone: '',
    brandColor: '#0F766E', currency: 'ETB' as SchoolCurrency, language: 'en' as SchoolLanguage
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [planOptions, setPlanOptions] = useState<PlanConfig[]>([]);
  const [platformCurrency, setPlatformCurrency] = useState('ETB');
  const [plansError, setPlansError] = useState<string | null>(null);
  const [showDeleteSchoolModal, setShowDeleteSchoolModal] = useState(false);
  const [deletionPreview, setDeletionPreview] = useState<any | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState('');
  const [isLoadingDeletionPreview, setIsLoadingDeletionPreview] = useState(false);
  const [isDeletingSchool, setIsDeletingSchool] = useState(false);
  const [deleteSchoolError, setDeleteSchoolError] = useState<string | null>(null);


  useEffect(() => {
    let cancelled = false;
    Promise.all([ApiClient.getPlans(), ApiClient.getSettings()])
      .then(([plans, settings]) => {
        if (cancelled) return;
        setPlanOptions(plans);
        setPlatformCurrency(String(settings.platformCurrency || 'ETB').toUpperCase());
      })
      .catch((error: any) => {
        if (!cancelled) setPlansError(error.message || 'Unable to load subscription plan prices.');
      });
    return () => { cancelled = true; };
  }, []);

  // Add School Form State
  const [addName, setAddName] = useState('');
  const [addCode, setAddCode] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addAddress, setAddAddress] = useState('');
  const [addCity, setAddCity] = useState('');
  const [addCountry, setAddCountry] = useState('Ethiopia');
  const [addRegion, setAddRegion] = useState('');
  const [addSchoolType, setAddSchoolType] = useState<'primary' | 'secondary' | 'combined'>('combined');
  const [addLogoDataUrl, setAddLogoDataUrl] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addWhatsappPhone, setAddWhatsappPhone] = useState('');
  const [addPlan, setAddPlan] = useState<PlanTier>('standard');
  const [addCadence, setAddCadence] = useState<SubscriptionCadence>('monthly');
  const [addAdminName, setAddAdminName] = useState('');
  const [addAdminUsername, setAddAdminUsername] = useState('');
  const [addAdminPin, setAddAdminPin] = useState('');
  const [addAdminEmail, setAddAdminEmail] = useState('');
  const [addAdminPhone, setAddAdminPhone] = useState('');
  const [addStudentAccess, setAddStudentAccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Subscription Modifier Form State
  const [subMonthsToAdd, setSubMonthsToAdd] = useState(1);
  const [subGraceDays, setSubGraceDays] = useState(7);
  const [subPlan, setSubPlan] = useState<PlanTier>('standard');
  const [subStatus, setSubStatus] = useState<SubscriptionStatus>('active');

  const fetchSchools = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const list = await ApiClient.getSchools({ search, status: statusFilter });
      setSchools(list);
      if (initialSchoolId) {
        const found = list.find(s => s.id === initialSchoolId);
        if (found) loadSchoolDetail(found.id);
      }
    } catch (err: any) {
      setLoadError(err.message || 'Unable to load the school directory.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSchools();
  }, [search, statusFilter]);

  const loadSchoolDetail = async (id: string) => {
    try {
      const detail = await ApiClient.getSchoolDetails(id);
      setSelectedSchool(detail);
      if (detail && detail.school) {
        setSubPlan(detail.school.subscription?.plan || 'standard');
        setSubGraceDays(detail.school.subscription?.graceDays || 7);
        setSubStatus(detail.school.subscription?.status || 'active');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openPermanentDeleteDialog = async () => {
    if (!selectedSchool?.school?.id) return;
    setShowDeleteSchoolModal(true);
    setDeleteSchoolError(null);
    setDeleteConfirmationName('');
    setDeletionPreview(null);
    setIsLoadingDeletionPreview(true);
    try {
      const preview = await ApiClient.previewSchoolDeletion(selectedSchool.school.id);
      setDeletionPreview(preview);
    } catch (error: any) {
      setDeleteSchoolError(error.message || 'Unable to load the deletion preview.');
    } finally {
      setIsLoadingDeletionPreview(false);
    }
  };

  const handlePermanentSchoolDeletion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSchool?.school || deleteConfirmationName !== selectedSchool.school.name || !deletionPreview) return;
    setIsDeletingSchool(true);
    setDeleteSchoolError(null);
    try {
      const result = await ApiClient.deleteSchoolPermanently(selectedSchool.school.id, deleteConfirmationName);
      setShowDeleteSchoolModal(false);
      setSelectedSchool(null);
      setDeleteConfirmationName('');
      await fetchSchools();
      if (result.cleanupWarnings?.length) {
        window.alert(`Database records for ${result.schoolName} were deleted. Some external cleanup needs attention:\\n\\n${result.cleanupWarnings.join('\\n')}`);
      } else {
        setActionNotice(`School "${result.schoolName}" and its school-scoped database records were permanently deleted.`);
      }
    } catch (error: any) {
      setDeleteSchoolError(error.message || 'Permanent school deletion failed.');
    } finally {
      setIsDeletingSchool(false);
    }
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setIsSubmitting(true);

    try {
      const res = await ApiClient.addSchool({
        name: addName,
        code: addCode,
        email: addEmail,
        address: addAddress,
        city: addCity,
        country: addCountry,
        region: addRegion,
        schoolType: addSchoolType,
        logoDataUrl: addLogoDataUrl,
        phone: addPhone,
        whatsappPhone: addWhatsappPhone,
        plan: addPlan,
        cadence: addCadence,
        adminName: addAdminName,
        adminUsername: addAdminUsername,
        adminPin: addAdminPin,
        adminEmail: addAdminEmail,
        adminPhone: addAdminPhone,
        studentAccessEnabled: addStudentAccess
      });

      setShowAddModal(false);
      setActionNotice(`School "${res.school.name}" onboarded successfully.`);
      window.alert(`School Administrator created.\n\nLogin ID: ${res.adminUsername || res.admin?.staffId || 'See school details'}\nTemporary PIN: ${res.temporaryPin}\nChange it at first sign-in.`);
      // Reset form
      setAddName('');
      setAddCode('');
      setAddEmail('');
      setAddAddress('');
      setAddCity('');
      setAddCountry('Ethiopia');
      setAddRegion('');
      setAddSchoolType('combined');
      setAddLogoDataUrl('');
      setAddPhone('');
      setAddWhatsappPhone('');
      setAddAdminName('');
      setAddAdminUsername('');
      setAddAdminPin('');
      setAddAdminEmail('');
      setAddAdminPhone('');
      setAddStudentAccess(false);
      await fetchSchools();
      loadSchoolDetail(res.school.id);
    } catch (err: any) {
      setModalError(err.message || 'Failed to onboard school');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditSchool = () => {
    if (!selectedSchool?.school) return;
    const school = selectedSchool.school;
    setEditSchoolForm({
      name: school.name || '',
      email: school.email || '',
      address: school.address || '',
      city: school.city || '',
      country: school.country || '',
      region: school.region || '',
      schoolType: school.schoolType || 'combined',
      phone: school.phone || '',
      whatsappPhone: school.whatsappPhone || '',
      brandColor: school.brandColor || '#0F766E',
      currency: school.currency || 'ETB',
      language: school.language || 'en'
    });
    setEditSchoolError(null);
    setShowEditSchoolModal(true);
  };

  const handleSaveSchoolDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool || isSavingSchoolDetails) return;
    setIsSavingSchoolDetails(true);
    setEditSchoolError(null);
    try {
      const schoolId = selectedSchool.school.id;
      await ApiClient.updateSchoolDetails(schoolId, editSchoolForm);
      setShowEditSchoolModal(false);
      setActionNotice('School details saved successfully.');
      await fetchSchools();
      await loadSchoolDetail(schoolId);
    } catch (error: any) {
      setEditSchoolError(error.message || 'Unable to save school details.');
    } finally {
      setIsSavingSchoolDetails(false);
    }
  };

  const handleUpdateSubscription = async () => {
    if (!selectedSchool || isUpdatingSubscription) return;
    setIsUpdatingSubscription(true);
    try {
      const schoolId = selectedSchool.school.id;
      await ApiClient.updateSubscription(schoolId, {
        plan: subPlan,
        monthsToAdd: subMonthsToAdd,
        graceDays: subGraceDays,
        status: subStatus
      });
      setShowSubModal(false);
      setActionNotice('Subscription updated successfully.');
      await fetchSchools();
      await loadSchoolDetail(schoolId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUpdatingSubscription(false);
    }
  };

  const handleToggleSuspension = async () => {
    if (!selectedSchool) return;
    const isSuspended = selectedSchool.school.subscription.status === 'suspended';
    const confirmMsg = isSuspended 
      ? `Reactivate school "${selectedSchool.school.name}" and restore user logins?`
      : `SUSPEND school "${selectedSchool.school.name}"? This blocks login for all students, parents, teachers, and admins of this school.`;

    if (!confirm(confirmMsg)) return;

    try {
      await ApiClient.setSchoolSuspension(selectedSchool.school.id, !isSuspended);
      setActionNotice(`School ${isSuspended ? 'reactivated' : 'suspended'}.`);
      await fetchSchools();
      loadSchoolDetail(selectedSchool.school.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleStudentAccess = async () => {
    if (!selectedSchool) return;
    const current = selectedSchool.school.studentAccessEnabled;
    const confirmMsg = current
      ? `Turn OFF Student Portal access for "${selectedSchool.school.name}"? Students of this school will NOT be able to log in.`
      : `Turn ON Student Portal access for "${selectedSchool.school.name}"?`;

    if (!confirm(confirmMsg)) return;

    try {
      await ApiClient.setStudentAccess(selectedSchool.school.id, !current);
      setActionNotice(`Student access ${!current ? 'enabled' : 'disabled'}.`);
      await fetchSchools();
      loadSchoolDetail(selectedSchool.school.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResetAdminPassword = async (adminId: string) => {
    if (!confirm('Generate a temporary password for this school administrator? They must change it at next sign-in.')) return;
    try {
      const result = await ApiClient.resetUserPassword(adminId);
      window.alert(`Temporary password (shown once):\n\n${result.temporaryPassword}\n\nThe administrator must change it at next sign-in.`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Live preview of "New Valid Until"
  const calculateNewValidUntil = () => {
    if (!selectedSchool) return '';
    const currentValid = new Date(selectedSchool.school.subscription.validUntil);
    const base = currentValid > new Date() ? currentValid : new Date();
    base.setMonth(base.getMonth() + Number(subMonthsToAdd));
    return base.toISOString().split('T')[0];
  };

  if (isLoading) return <div role="status" aria-busy="true" className="p-6 text-sm text-[#64748B]">Loading school directory…</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Tenant Schools Directory
          </h1>
          <p className="text-xs text-[#64748B]">
            Multi-tenant campus administration, subscriptions, and access control
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg shadow-sm transition-colors flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Onboard New School</span>
        </button>
      </div>

      {actionNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}
      {loadError && (
        <div role="alert" className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button type="button" onClick={() => void fetchSchools()} className="font-semibold underline">Retry loading</button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-white p-3 rounded-xl border border-[#E2E8F0]">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search school name or code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          />
        </div>

        {/* Status Segmented Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg w-full md:w-auto overflow-x-auto text-xs">
          {[
            { id: 'all', label: 'All Schools' },
            { id: 'active', label: 'Active' },
            { id: 'trial', label: 'Trial' },
            { id: 'grace', label: 'Grace' },
            { id: 'read_only', label: 'Read-Only' },
            { id: 'suspended', label: 'Suspended' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1 font-medium rounded transition-colors whitespace-nowrap ${
                statusFilter === f.id
                  ? 'bg-white text-[#132A29] shadow-xs font-semibold'
                  : 'text-[#64748B] hover:text-[#132A29]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Left is Schools Table, Right is Selected School Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Schools Table */}
        <div className={`bg-white rounded-xl border border-[#E2E8F0] overflow-hidden ${selectedSchool ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-4 py-3">School</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Students</th>
                  <th className="px-4 py-3">Teachers</th>
                  <th className="px-4 py-3">Valid Until</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {schools.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-[#64748B]">
                      No schools found matching the criteria. Click "Onboard New School" to create one.
                    </td>
                  </tr>
                ) : (
                  schools.map(s => {
                    const isSelected = selectedSchool?.school.id === s.id;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => loadSchoolDetail(s.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#F0FDFA]' : 'hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <td className="px-4 py-3"><div className="flex items-center gap-2.5 min-w-40"><div className="h-9 w-9 shrink-0 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-center overflow-hidden">{s.logoUrl ? <img src={s.logoUrl} alt={`${s.name} logo`} className="h-full w-full object-contain" /> : <Building2 className="h-4 w-4 text-[#94A3B8]" />}</div><span className="font-semibold text-[#132A29]">{s.name}</span></div></td>
                        <td className="px-4 py-3 font-mono text-[#64748B]">{s.code}</td>
                        <td className="px-4 py-3 capitalize text-[#334155]">{s.subscription.plan}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-semibold ${
                            s.subscription.status === 'active' ? 'text-emerald-700' :
                            s.subscription.status === 'trial' ? 'text-sky-700' :
                            s.subscription.status === 'grace' ? 'text-amber-700' :
                            s.subscription.status === 'read_only' ? 'text-rose-700' :
                            'text-slate-700'
                          }`}>
                            {s.subscription.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[#334155]">{s.studentCount || 0}</td>
                        <td className="px-4 py-3 font-mono text-[#334155]">{s.teacherCount || 0}</td>
                        <td className="px-4 py-3 font-mono text-[#64748B]">
                          {s.subscription.validUntil.split('T')[0]}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              loadSchoolDetail(s.id);
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-[#0F766E] bg-[#F0FDFA] hover:bg-[#CCFBF1] rounded border border-[#99F6E4] transition-colors"
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected School Detail View */}
        {selectedSchool && (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-5 lg:col-span-1 shadow-xs">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono text-[#0F766E] bg-[#F0FDFA] px-2 py-0.5 rounded border border-[#CCFBF1] uppercase">
                  {selectedSchool.school.code}
                </span>
                {selectedSchool.school.logoUrl && <img src={selectedSchool.school.logoUrl} alt={`${selectedSchool.school.name} logo`} className="mb-2 h-14 max-w-28 object-contain rounded-md border border-[#E2E8F0] p-1" />}
                <h2 className="text-base font-bold text-[#132A29] mt-1">
                  {selectedSchool.school.name}
                </h2>
                <p className="text-[11px] text-[#64748B]">{[selectedSchool.school.schoolType, selectedSchool.school.region, selectedSchool.school.country].filter(Boolean).join(' · ')}</p>
                <p className="text-xs text-[#64748B]">{selectedSchool.school.email}</p>
                <p className="text-[11px] text-[#64748B] mt-1">
                  {[selectedSchool.school.address, selectedSchool.school.city].filter(Boolean).join(', ') || 'Address not recorded'}
                </p>
                <p className="text-[11px] text-[#64748B]">
                  Phone: {selectedSchool.school.phone || '—'} · WhatsApp: {selectedSchool.school.whatsappPhone || '—'}
                </p>
              </div>
              <button
                onClick={() => setSelectedSchool(null)}
                className="text-[#64748B] hover:text-[#132A29] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={openEditSchool}
              className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-semibold text-[#334155] hover:bg-[#F8FAFC]"
            >
              Edit School Details
            </button>

            {/* Subscription & Cadence Card */}
            <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#64748B]">Subscription Plan:</span>
                <span className="font-semibold capitalize text-[#132A29]">
                  {selectedSchool.school.subscription.plan} ({selectedSchool.school.subscription.cadence})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#64748B]">Current State:</span>
                <span className="font-bold uppercase text-[#0F766E]">
                  {selectedSchool.school.subscription.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#64748B]">Valid Until:</span>
                <span className="font-mono text-[#132A29]">
                  {selectedSchool.school.subscription.validUntil.split('T')[0]}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#64748B]">Grace Days Config:</span>
                <span className="font-mono">{selectedSchool.school.subscription.graceDays || 7} days</span>
              </div>
              <button
                onClick={() => setShowSubModal(true)}
                className="w-full mt-2 py-1.5 px-3 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded font-medium text-xs transition-colors"
              >
                Modify Subscription / Extend
              </button>
            </div>

            {/* Student Access Master Switch (Controlled ONLY by Super Admin) */}
            <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-[#132A29]">Student Portal Access</p>
                  <p className="text-[11px] text-[#64748B]">
                    {selectedSchool.school.studentAccessEnabled ? 'Active (Students can log in)' : 'Disabled by Platform Admin'}
                  </p>
                </div>
                <button
                  onClick={handleToggleStudentAccess}
                  className={`px-3 py-1 rounded font-medium text-xs transition-colors ${
                    selectedSchool.school.studentAccessEnabled
                      ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  {selectedSchool.school.studentAccessEnabled ? 'Turn OFF' : 'Turn ON'}
                </button>
              </div>
            </div>

            {/* School Usage Counters */}
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="p-2.5 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                <p className="text-[11px] text-[#64748B]">Enrolled Students</p>
                <p className="text-lg font-bold font-mono text-[#132A29]">{selectedSchool.studentCount}</p>
              </div>
              <div className="p-2.5 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                <p className="text-[11px] text-[#64748B]">Appointed Teachers</p>
                <p className="text-lg font-bold font-mono text-[#132A29]">{selectedSchool.teacherCount}</p>
              </div>
            </div>

            {/* Administrator Account */}
            <div className="text-xs space-y-2">
              <h3 className="font-semibold text-[#132A29]">School Administrator</h3>
              {(Array.isArray(selectedSchool.admins) ? selectedSchool.admins : selectedSchool.admin ? [selectedSchool.admin] : []).map((adm: any) => (
                <div key={adm.id} className="p-2.5 bg-[#F8FAFC] rounded border border-[#E2E8F0] flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#132A29]">{adm.fullName}</p>
                    <p className="text-[11px] text-[#64748B]">Login ID: {adm.staffId || '—'} · {adm.email || adm.phone || 'No email/phone'}</p>
                  </div>
                  <button
                    onClick={() => handleResetAdminPassword(adm.id)}
                    className="p-1.5 text-[#0F766E] hover:bg-[#E2E8F0] rounded"
                    title="Reset Admin Password"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Actions: View as School Admin & Suspend */}
            <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
              <button
                onClick={() => viewAsSchool(selectedSchool.school)}
                className="w-full py-2 px-3 bg-[#0B2B2A] hover:bg-[#143D3B] text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Enter & Inspect as School Admin</span>
              </button>

              <button
                type="button"
                onClick={openPermanentDeleteDialog}
                className="w-full py-2 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 bg-red-700 hover:bg-red-800 text-white"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete School Permanently</span>
              </button>

              <button
                onClick={handleToggleSuspension}
                className={`w-full py-2 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 ${
                  selectedSchool.school.subscription.status === 'suspended'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>
                  {selectedSchool.school.subscription.status === 'suspended'
                    ? 'Reactivate School Access'
                    : 'Suspend Entire School'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PERMANENT SCHOOL DELETION CONFIRMATION */}
      {showDeleteSchoolModal && selectedSchool?.school && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 border border-red-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 mb-4">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-red-50 text-red-700 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-red-800">Delete School Permanently</h2>
                <p className="text-xs text-slate-600 mt-1">This action cannot be undone. It removes this school's database records and School Admin accounts. It does not delete the platform Super Admin.</p>
              </div>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 mb-4 text-xs text-red-900">
              <p className="font-bold">{selectedSchool.school.name} ({selectedSchool.school.code})</p>
              <p className="mt-1">Do not continue unless you have an independent backup and authority to erase this school's records.</p>
            </div>
            {isLoadingDeletionPreview ? (
              <p className="text-xs text-slate-600 py-4">Loading exact deletion preview…</p>
            ) : deletionPreview ? (
              <div className="rounded-lg border border-slate-200 p-3 mb-4">
                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                  <span>Records included in deletion</span>
                  <span>{Number(deletionPreview.total_rows || 0).toLocaleString()} rows</span>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {Object.entries(deletionPreview.counts || {}).map(([table, count]) => (
                    <div key={table} className="flex justify-between gap-4 text-[11px] text-slate-600">
                      <span>{table.replace(/_/g, ' ')}</span>
                      <span className="font-mono font-semibold">{Number(count).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {deleteSchoolError && <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-3 text-xs text-red-700">{deleteSchoolError}</div>}
            <form onSubmit={handlePermanentSchoolDeletion} className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                Type the exact school name to unlock deletion
                <input
                  value={deleteConfirmationName}
                  onChange={event => setDeleteConfirmationName(event.target.value)}
                  placeholder={selectedSchool.school.name}
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </label>
              <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end pt-2">
                <button type="button" disabled={isDeletingSchool} onClick={() => setShowDeleteSchoolModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700">Cancel</button>
                <button type="submit" disabled={isDeletingSchool || isLoadingDeletionPreview || !deletionPreview || deleteConfirmationName !== selectedSchool.school.name} className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 disabled:opacity-40 text-white text-xs font-bold">
                  {isDeletingSchool ? 'Deleting school…' : 'Permanently Delete All School Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD SCHOOL MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-[#E2E8F0] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
              <h2 className="text-base font-bold text-[#132A29] flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#0F766E]" />
                <span>Onboard New Tenant School</span>
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-[#64748B] hover:text-[#132A29]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateSchool} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#334155]">School Name *</label>
                  <input
                    type="text"
                    required
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    placeholder="e.g. Al-Najah Academy"
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#334155]">School Code * (e.g. NAJ01)</label>
                  <input
                    type="text"
                    required
                    value={addCode}
                    onChange={e => setAddCode(e.target.value.toUpperCase())}
                    placeholder="NAJ01"
                    className="mt-1 w-full px-3 py-2 font-mono uppercase border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#334155]">Country *</label>
                  <input required maxLength={80} value={addCountry} onChange={e => setAddCountry(e.target.value)} placeholder="Ethiopia" className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" />
                </div>
                <div>
                  <label className="block font-medium text-[#334155]">Region *</label>
                  <input required maxLength={100} value={addRegion} onChange={e => setAddRegion(e.target.value)} placeholder="Somali Region" className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" />
                </div>
                <div>
                  <label className="block font-medium text-[#334155]">School Type *</label>
                  <select required value={addSchoolType} onChange={e => setAddSchoolType(e.target.value as 'primary' | 'secondary' | 'combined')} className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg">
                    <option value="primary">Primary</option><option value="secondary">Secondary</option><option value="combined">Combined</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#334155]">School Logo (PNG/JPEG/WebP, max 2 MB)</label>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) { setAddLogoDataUrl(''); return; }
                    if (file.size > 2 * 1024 * 1024) { setModalError('School logo must be smaller than 2 MB.'); e.target.value = ''; return; }
                    const reader = new FileReader();
                    reader.onload = () => setAddLogoDataUrl(typeof reader.result === 'string' ? reader.result : '');
                    reader.onerror = () => setModalError('Unable to read the selected school logo.');
                    reader.readAsDataURL(file);
                  }} className="mt-1 w-full text-[11px]" />
                  {addLogoDataUrl && <span className="text-[10px] text-emerald-700">Logo ready to upload</span>}
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#334155]">School Email *</label>
                <input type="email" required value={addEmail} onChange={e => setAddEmail(e.target.value)} placeholder="office@school.so" className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#334155]">City *</label>
                  <input type="text" required value={addCity} onChange={e => setAddCity(e.target.value)} placeholder="e.g. Jijiga" className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" />
                </div>
                <div>
                  <label className="block font-medium text-[#334155]">School Address *</label>
                  <input type="text" required value={addAddress} onChange={e => setAddAddress(e.target.value)} placeholder="Street / area / location" className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" />
                </div>
                <div>
                  <label className="block font-medium text-[#334155]">School Phone *</label>
                  <input type="tel" required value={addPhone} onChange={e => setAddPhone(e.target.value)} placeholder="+251..." className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" />
                </div>
                <div>
                  <label className="block font-medium text-[#334155]">School / Admin WhatsApp (Optional)</label>
                  <input type="tel" value={addWhatsappPhone} onChange={e => setAddWhatsappPhone(e.target.value)} placeholder="+251..." className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#334155]">Plan Tier</label>
                  <select
                    value={addPlan}
                    onChange={e => setAddPlan(e.target.value as PlanTier)}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  >
                    {planOptions.length > 0 ? planOptions.map(plan => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} ({formatMoney(plan.monthlyPrice, platformCurrency)}/mo)
                      </option>
                    )) : (
                      <>
                        <option value="basic">Basic</option>
                        <option value="standard">Standard</option>
                        <option value="premium">Premium Enterprise</option>
                      </>
                    )}
                  </select>
                  {plansError && <p role="alert" className="mt-1 text-[10px] text-rose-700">{plansError}</p>}
                </div>
                <div>
                  <label className="block font-medium text-[#334155]">Subscription Cadence</label>
                  <select
                    value={addCadence}
                    onChange={e => setAddCadence(e.target.value as SubscriptionCadence)}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  >
                    <option value="trial">Free Trial (7 Days)</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="lifetime">Lifetime</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-3">
                <h3 className="font-semibold text-[#132A29]">First Administrator Profile</h3>
                <div>
                  <label className="block font-medium text-[#334155]">Admin Full Name *</label>
                  <input
                    type="text"
                    required
                    value={addAdminName}
                    onChange={e => setAddAdminName(e.target.value)}
                    placeholder="e.g. Hassan Mohamed Warsame"
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-[#334155]">Admin Login ID (Optional)</label>
                    <input type="text" maxLength={32} value={addAdminUsername} onChange={e => setAddAdminUsername(e.target.value.toUpperCase())} placeholder="Auto-generate if blank" className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg bg-white" />
                  </div>
                  <div>
                    <label className="block font-medium text-[#334155]">Initial PIN (Optional)</label>
                    <input type="password" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} autoComplete="new-password" value={addAdminPin} onChange={e => setAddAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="4–6 digit PIN" className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg bg-white" />
                  </div>
                  <div>
                    <label className="block font-medium text-[#334155]">Email Address (Optional)</label>
                    <input
                      type="email"
                      value={addAdminEmail}
                      onChange={e => setAddAdminEmail(e.target.value)}
                      placeholder="admin@school.so"
                      className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#334155]">Phone Number *</label>
                    <input
                      type="tel"
                      required
                      value={addAdminPhone}
                      onChange={e => setAddAdminPhone(e.target.value)}
                      placeholder="+25261..."
                      className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none bg-white"
                    />
                  </div>
                </div>
                <div className="col-span-2 rounded-lg border border-teal-100 bg-teal-50 p-3 text-xs text-teal-800">
                  A short unique Admin ID (for example ADM001) is generated if you leave it blank. If you leave the PIN blank, a six-digit temporary PIN is generated. The administrator must change it at first sign-in. Admin ID works without Gmail.
                </div>
              </div>

              {/* Student Access Switch */}
              <div className="flex items-center justify-between p-3 bg-[#F0FDFA] rounded-lg border border-[#CCFBF1]">
                <div>
                  <p className="font-semibold text-[#132A29]">Enable Student Portal Access</p>
                  <p className="text-[11px] text-[#64748B]">Can be toggled anytime by Super Admin</p>
                </div>
                <input
                  type="checkbox"
                  checked={addStudentAccess}
                  onChange={e => setAddStudentAccess(e.target.checked)}
                  className="w-4 h-4 text-[#0F766E] rounded focus:ring-[#0F766E]"
                />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-[#334155] hover:bg-[#F8FAFC]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg font-semibold shadow-sm"
                >
                  {isSubmitting ? 'Onboarding...' : 'Create School & Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUBSCRIPTION MODIFIER DIALOG */}
      {showEditSchoolModal && selectedSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <h2 className="text-base font-bold text-[#132A29]">Edit School Details</h2>
                <p className="mt-1 text-[11px] text-[#64748B]">School code cannot be changed after registration.</p>
              </div>
              <button type="button" onClick={() => setShowEditSchoolModal(false)} className="text-[#64748B] hover:text-[#132A29]">
                <X className="h-5 w-5" />
              </button>
            </div>
            {editSchoolError && <div role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{editSchoolError}</div>}
            <form onSubmit={handleSaveSchoolDetails} className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              <label className="space-y-1">
                <span className="block font-medium text-[#334155]">School name</span>
                <input required minLength={2} maxLength={120} value={editSchoolForm.name} onChange={e => setEditSchoolForm({ ...editSchoolForm, name: e.target.value })} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2" />
              </label>
              <label className="space-y-1">
                <span className="block font-medium text-[#334155]">School email</span>
                <input required type="email" maxLength={254} value={editSchoolForm.email} onChange={e => setEditSchoolForm({ ...editSchoolForm, email: e.target.value })} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2" />
              </label>
              <label className="space-y-1">
                <span className="block font-medium text-[#334155]">Address</span>
                <input required minLength={2} maxLength={240} value={editSchoolForm.address} onChange={e => setEditSchoolForm({ ...editSchoolForm, address: e.target.value })} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2" />
              </label>
              <label className="space-y-1">
                <span className="block font-medium text-[#334155]">City</span>
                <input required minLength={2} maxLength={100} value={editSchoolForm.city} onChange={e => setEditSchoolForm({ ...editSchoolForm, city: e.target.value })} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2" />
              </label>
              <label className="space-y-1">
                <span className="block font-medium text-[#334155]">Country</span>
                <input maxLength={80} value={editSchoolForm.country} onChange={e => setEditSchoolForm({ ...editSchoolForm, country: e.target.value })} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2" />
              </label>
              <label className="space-y-1">
                <span className="block font-medium text-[#334155]">Region</span>
                <input maxLength={100} value={editSchoolForm.region} onChange={e => setEditSchoolForm({ ...editSchoolForm, region: e.target.value })} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2" />
              </label>
              <label className="space-y-1">
                <span className="block font-medium text-[#334155]">School type</span>
                <select value={editSchoolForm.schoolType} onChange={e => setEditSchoolForm({ ...editSchoolForm, schoolType: e.target.value as 'primary' | 'secondary' | 'combined' })} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2">
                  <option value="primary">Primary</option><option value="secondary">Secondary</option><option value="combined">Combined</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="block font-medium text-[#334155]">Phone</span>
                <input required minLength={7} maxLength={30} value={editSchoolForm.phone} onChange={e => setEditSchoolForm({ ...editSchoolForm, phone: e.target.value })} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2" />
              </label>
              <label className="space-y-1">
                <span className="block font-medium text-[#334155]">WhatsApp phone</span>
                <input required minLength={7} maxLength={30} value={editSchoolForm.whatsappPhone} onChange={e => setEditSchoolForm({ ...editSchoolForm, whatsappPhone: e.target.value })} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2" />
              </label>
              <label className="space-y-1">
                <span className="block font-medium text-[#334155]">Currency</span>
                <select value={editSchoolForm.currency} onChange={e => setEditSchoolForm({ ...editSchoolForm, currency: e.target.value as SchoolCurrency })} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2">
                  <option value="ETB">ETB</option><option value="USD">USD</option><option value="SOS">SOS</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="block font-medium text-[#334155]">Language</span>
                <select value={editSchoolForm.language} onChange={e => setEditSchoolForm({ ...editSchoolForm, language: e.target.value as SchoolLanguage })} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2">
                  <option value="en">English</option><option value="so">Somali</option>
                </select>
              </label>
              <label className="flex items-center gap-3 sm:col-span-2">
                <span className="font-medium text-[#334155]">Brand color</span>
                <input type="color" value={editSchoolForm.brandColor} onChange={e => setEditSchoolForm({ ...editSchoolForm, brandColor: e.target.value })} className="h-9 w-14 rounded border border-[#CBD5E1] bg-white p-1" />
                <span className="font-mono text-[#64748B]">{editSchoolForm.brandColor}</span>
              </label>
              <div className="flex justify-end gap-2 border-t border-[#E2E8F0] pt-4 sm:col-span-2">
                <button type="button" onClick={() => setShowEditSchoolModal(false)} className="rounded-lg border border-[#CBD5E1] px-4 py-2 text-[#334155]">Cancel</button>
                <button type="submit" disabled={isSavingSchoolDetails} className="rounded-lg bg-[#0F766E] px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {isSavingSchoolDetails ? 'Saving…' : 'Save School Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSubModal && selectedSchool && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-[#E2E8F0]">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
              <h2 className="text-base font-bold text-[#132A29]">
                Modify Subscription: {selectedSchool.school.name}
              </h2>
              <button onClick={() => setShowSubModal(false)} className="text-[#64748B] hover:text-[#132A29]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-[#334155]">Plan Tier</label>
                <select
                  value={subPlan}
                  onChange={e => setSubPlan(e.target.value as PlanTier)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                >
                  <option value="basic">Basic</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium Enterprise</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#334155]">Subscription Status</label>
                <select
                  value={subStatus}
                  onChange={e => setSubStatus(e.target.value as SubscriptionStatus)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                >
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                  <option value="grace">Grace Period</option>
                  <option value="read_only">Read-Only (Expired)</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#334155]">Add Validity (Months)</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={subMonthsToAdd}
                  onChange={e => setSubMonthsToAdd(parseInt(e.target.value, 10) || 0)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-[#334155]">Grace Period Allowance (Days)</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={subGraceDays}
                  onChange={e => setSubGraceDays(parseInt(e.target.value, 10) || 7)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg font-mono"
                />
              </div>

              {/* Reactive Live Preview of New Valid Until */}
              <div className="p-3 bg-[#F0FDFA] rounded-lg border border-[#CCFBF1]">
                <p className="text-[11px] text-[#64748B]">Live Reactive Date Preview:</p>
                <p className="text-sm font-bold font-mono text-[#0F766E] mt-0.5">
                  New Valid Until: {calculateNewValidUntil()}
                </p>
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2">
                <button
                  onClick={() => setShowSubModal(false)}
                  className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-[#334155] hover:bg-[#F8FAFC]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateSubscription}
                  disabled={isUpdatingSubscription}
                  className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isUpdatingSubscription ? 'Saving…' : 'Save & Apply Live'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
