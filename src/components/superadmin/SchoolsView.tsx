/**
 * Super Admin Schools Directory, Add School Modal, School Detail, and Subscription Modifier Dialog
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { School, PlanTier, SubscriptionCadence, SubscriptionStatus } from '../../types/index.ts';
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
  const [isLoading, setIsLoading] = useState(true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [showEraseModal, setShowEraseModal] = useState(false);
  const [eraseConfirmation, setEraseConfirmation] = useState('');
  const [isErasing, setIsErasing] = useState(false);

  // Add School Form State
  const [addName, setAddName] = useState('');
  const [addCode, setAddCode] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPlan, setAddPlan] = useState<PlanTier>('standard');
  const [addCadence, setAddCadence] = useState<SubscriptionCadence>('monthly');
  const [addAdminName, setAddAdminName] = useState('');
  const [addAdminEmail, setAddAdminEmail] = useState('');
  const [addAdminPhone, setAddAdminPhone] = useState('');
  const [addAdminPass, setAddAdminPass] = useState('');
  const [addStudentAccess, setAddStudentAccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Subscription Modifier Form State
  const [subMonthsToAdd, setSubMonthsToAdd] = useState(1);
  const [subGraceDays, setSubGraceDays] = useState(7);
  const [subPlan, setSubPlan] = useState<PlanTier>('standard');
  const [subStatus, setSubStatus] = useState<SubscriptionStatus>('active');

  const fetchSchools = async () => {
    setIsLoading(true);
    try {
      const list = await ApiClient.getSchools({ search, status: statusFilter });
      setSchools(list);
      if (initialSchoolId) {
        const found = list.find(s => s.id === initialSchoolId);
        if (found) loadSchoolDetail(found.id);
      }
    } catch (err: any) {
      console.error(err);
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
        setSubPlan(detail.school.subscription?.plan || 'plan-standard');
        setSubGraceDays(detail.school.subscription?.graceDays || 7);
        setSubStatus(detail.school.subscription?.status || 'active');
      }
    } catch (err: any) {
      alert(err.message);
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
        plan: addPlan,
        cadence: addCadence,
        adminName: addAdminName,
        adminEmail: addAdminEmail,
        adminPhone: addAdminPhone,
        adminPassword: addAdminPass,
        studentAccessEnabled: addStudentAccess
      });

      setShowAddModal(false);
      setActionNotice(`School "${res.school.name}" onboarded successfully.`);
      // Reset form
      setAddName('');
      setAddCode('');
      setAddEmail('');
      setAddAdminName('');
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

  const handleUpdateSubscription = async () => {
    if (!selectedSchool) return;
    try {
      const updated = await ApiClient.updateSubscription(selectedSchool.school.id, {
        plan: subPlan,
        monthsToAdd: subMonthsToAdd,
        graceDays: subGraceDays,
        status: subStatus
      });
      setShowSubModal(false);
      setActionNotice('Subscription updated successfully.');
      await fetchSchools();
      loadSchoolDetail(selectedSchool.school.id);
    } catch (err: any) {
      alert(err.message);
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

  const handleEraseSchoolData = async () => {
    if (!selectedSchool || eraseConfirmation.trim().toUpperCase() !== selectedSchool.school.code.toUpperCase()) return;
    setIsErasing(true);
    try {
      await ApiClient.eraseSchoolData(selectedSchool.school.id, eraseConfirmation.trim());
      const erasedName = selectedSchool.school.name;
      setShowEraseModal(false);
      setEraseConfirmation('');
      setSelectedSchool(null);
      setActionNotice(`All data for "${erasedName}" was permanently erased.`);
      await fetchSchools();
    } catch (err: any) {
      setModalError(err.message || 'School data could not be erased.');
    } finally {
      setIsErasing(false);
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
                        <td className="px-4 py-3 font-semibold text-[#132A29]">{s.name}</td>
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
                <h2 className="text-base font-bold text-[#132A29] mt-1">
                  {selectedSchool.school.name}
                </h2>
                <p className="text-xs text-[#64748B]">{selectedSchool.school.email}</p>
              </div>
              <button
                onClick={() => setSelectedSchool(null)}
                className="text-[#64748B] hover:text-[#132A29] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

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
              {selectedSchool.admins.map((adm: any) => (
                <div key={adm.id} className="p-2.5 bg-[#F8FAFC] rounded border border-[#E2E8F0] flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#132A29]">{adm.fullName}</p>
                    <p className="text-[11px] text-[#64748B]">{adm.email || adm.phone}</p>
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
                onClick={() => { setEraseConfirmation(''); setModalError(null); setShowEraseModal(true); }}
                className="w-full py-2 px-3 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Erase All School Data</span>
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

              <div>
                <label className="block font-medium text-[#334155]">School Email *</label>
                <input type="email" required value={addEmail} onChange={e => setAddEmail(e.target.value)} placeholder="office@school.so" className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#334155]">Plan Tier</label>
                  <select
                    value={addPlan}
                    onChange={e => setAddPlan(e.target.value as PlanTier)}
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  >
                    <option value="basic">Basic ($39/mo)</option>
                    <option value="standard">Standard ($89/mo)</option>
                    <option value="premium">Premium Enterprise ($179/mo)</option>
                  </select>
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
                    <label className="block font-medium text-[#334155]">Email Address *</label>
                    <input
                      type="email"
                      required
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
                <div>
                  <label className="block font-medium text-[#334155]">Initial Password</label>
                  <PasswordInput
                    label="initial administrator password"
                    required
                    value={addAdminPass}
                    onChange={e => setAddAdminPass(e.target.value)}
                    className="mt-1 w-full px-3 py-2 font-mono border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none bg-white"
                  />
                  <p className="text-[11px] text-[#64748B] mt-0.5">Admin will be forced to set their own password on first login.</p>
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

      {/* PERMANENT SCHOOL DATA ERASURE CONFIRMATION */}
      {showEraseModal && selectedSchool && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="erase-school-title" className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-red-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 pb-4 border-b border-red-100">
              <div className="p-2 rounded-lg bg-red-50 text-red-700"><Trash2 className="w-5 h-5" /></div>
              <div className="flex-1">
                <h2 id="erase-school-title" className="text-base font-bold text-red-800">Permanently erase this school?</h2>
                <p className="text-xs text-slate-600 mt-1">This action cannot be undone. The school and its administrator accounts will be removed.</p>
              </div>
              <button type="button" onClick={() => setShowEraseModal(false)} disabled={isErasing} className="text-slate-500 hover:text-slate-800"><X className="w-5 h-5" /></button>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-900 space-y-2">
              <p className="font-semibold">The following school-owned records will be erased:</p>
              <p>Students ({selectedSchool.studentCount || 0}), teachers, staff and logins, classes, attendance, exams and results, fees and payments, payroll, admissions, notices, messages, transport, library, inventory, and other school modules.</p>
              <p className="font-semibold">Platform-wide settings, plans, other schools, and Super Admin accounts are not deleted. Security audit history is retained.</p>
            </div>
            {modalError && <p role="alert" className="mt-3 p-2 rounded bg-red-50 text-red-700 text-xs">{modalError}</p>}
            <label className="block mt-4 text-xs font-semibold text-slate-700">
              Type school code <span className="font-mono text-red-700">{selectedSchool.school.code}</span> to confirm
              <input autoFocus value={eraseConfirmation} onChange={e => setEraseConfirmation(e.target.value)} disabled={isErasing} className="mt-1 w-full px-3 py-2 border border-red-200 rounded-lg font-mono uppercase focus:outline-none focus:ring-2 focus:ring-red-500" placeholder="Enter exact school code" />
            </label>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setShowEraseModal(false)} disabled={isErasing} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">Cancel</button>
              <button type="button" onClick={() => void handleEraseSchoolData()} disabled={isErasing || eraseConfirmation.trim().toUpperCase() !== selectedSchool.school.code.toUpperCase()} className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold disabled:opacity-40">{isErasing ? 'Erasing school data…' : 'Permanently Erase School'}</button>
            </div>
          </section>
        </div>
      )}

      {/* SUBSCRIPTION MODIFIER DIALOG */}
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
                  min="0"
                  max="36"
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
                  max="30"
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
                  className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg font-semibold"
                >
                  Save & Apply Live
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
