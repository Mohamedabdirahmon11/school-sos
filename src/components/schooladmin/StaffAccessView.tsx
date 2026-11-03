import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { StaffMember } from '../../types/index.ts';
import { ApiClient } from '../../services/api.ts';
import { 
  Users, 
  ShieldCheck, 
  Plus, 
  Search, 
  CheckSquare, 
  Square, 
  KeyRound, 
  Edit, 
  UserPlus, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';

const AVAILABLE_PERMISSIONS = [
  { id: 'fees_manage', label: 'Fees & Finance Ledger (Record payments, issue receipts)' },
  { id: 'admissions_manage', label: 'Student Admissions (Review and admit new applicants)' },
  { id: 'attendance_manage', label: 'Attendance Management (Mark and override records)' },
  { id: 'grades_manage', label: 'Exam Grades & Report Cards (Enter & lock exam marks)' },
  { id: 'library_manage', label: 'Library Catalog & Loans' },
  { id: 'transport_manage', label: 'Transport Fleet & Student Routes' },
  { id: 'inventory_manage', label: 'School Inventory & Asset Registry' },
  { id: 'reports_export', label: 'Export Reports & Financial CSVs' }
];

export const StaffAccessView: React.FC = () => {
  const { school, t } = useAuth();
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  // Form State
  const [fullName, setFullName] = useState('');
  const [roleTitle, setRoleTitle] = useState('Accountant');
  const [email, setEmail] = useState('');
  const [staffId, setStaffId] = useState('');
  const [phone, setPhone] = useState('');
  const [salary, setSalary] = useState('500');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(['fees_manage']);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStaff = async () => {
    if (!school) return;
    setLoading(true);
    try {
      const data = await ApiClient.request<StaffMember[]>('/school/staff');
      setStaffList(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [school]);

  const handleTogglePermission = (id: string) => {
    setSelectedPermissions(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    try {
      if (editingStaff) {
        await ApiClient.request(`/school/staff/${editingStaff.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            fullName,
            roleTitle,
            email,
            staffId,
            phone,
            monthlySalary: parseFloat(salary) || 0,
            permissions: selectedPermissions
          })
        });
        setMessage('Staff profile and permissions updated successfully.');
      } else {
        const created = await ApiClient.request<StaffMember & { initialPassword?: string }>('/school/staff', {
          method: 'POST',
          body: JSON.stringify({
            fullName,
            roleTitle,
            email,
            staffId,
            phone,
            monthlySalary: parseFloat(salary) || 0,
            permissions: selectedPermissions
          })
        });
        if (created.initialPassword) {
          window.alert(`Sign-in account created for ${created.email}.\nTemporary password (shown once):\n${created.initialPassword}\nThe staff member must change it after signing in.`);
        }
        setMessage(`Staff sign-in account created for ${fullName} (${created.staffId}).`);
      }

      setShowAddModal(false);
      setEditingStaff(null);
      setFullName('');
      setEmail('');
      setStaffId('');
      setPhone('');
      await fetchStaff();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetStaffPassword = async (staff: StaffMember) => {
    if (!staff.userId) {
      setError('This staff record is not linked to a sign-in account.');
      return;
    }
    if (!confirm(`Generate a temporary password for ${staff.fullName}? They must change it at next sign-in.`)) return;
    setError(null);
    try {
      const result = await ApiClient.resetUserPassword(staff.userId);
      window.alert(`Temporary password for ${staff.fullName}:\n\n${result.temporaryPassword}\n\nThis is shown once. The user must change it at next sign-in.`);
      setMessage(`Temporary password generated for ${staff.fullName}.`);
    } catch (err: any) {
      setError(err.message || 'Could not reset this staff password.');
    }
  };

  const openEditModal = (staff: StaffMember) => {
    setEditingStaff(staff);
    setFullName(staff.fullName);
    setRoleTitle(staff.roleTitle);
    setEmail(staff.email);
    setStaffId(staff.staffId || '');
    setPhone(staff.phone);
    setSalary(staff.monthlySalary.toString());
    setSelectedPermissions(staff.permissions || []);
    setShowAddModal(true);
  };

  const filteredStaff = staffList.filter(
    s =>
      s.fullName.toLowerCase().includes(search.toLowerCase()) ||
      s.roleTitle.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
      || (s.staffId || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Staff Directory & Assigned Work Areas
          </h1>
          <p className="text-xs text-[#64748B]">
            Configure roles for Accountants, Registrars, and Clerks with custom capability switches
          </p>
        </div>
        <button
          onClick={() => {
            setEditingStaff(null);
            setFullName('');
            setEmail('');
            setStaffId('');
            setPhone('');
            setSelectedPermissions(['fees_manage']);
            setShowAddModal(true);
          }}
          className="px-3.5 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Add Staff Member</span>
        </button>
      </div>

      {message && (
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-[#0F766E] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Staff Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="relative w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search staff members..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            />
          </div>
          <span className="text-xs text-slate-500 font-medium">Total: {staffList.length} staff</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold">
              <tr>
                <th className="py-2.5 px-4">Staff Member</th>
                <th className="py-2.5 px-4">Role Title</th>
                <th className="py-2.5 px-4">Contact</th>
                <th className="py-2.5 px-4">Recorded Work Areas</th>
                <th className="py-2.5 px-4">Monthly Salary</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No staff records found. Click &quot;Add Staff Member&quot; to create the first staff record.
                  </td>
                </tr>
              ) : (
                filteredStaff.map(st => (
                  <tr key={st.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{st.fullName}</div>
                      <div className="text-[11px] font-mono text-[#0F766E]">{st.staffId || '—'}</div>
                      <div className="text-[11px] text-slate-500">Joined {st.joinedDate}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-800 px-2 py-0.5 rounded bg-slate-100 text-[11px]">
                        {st.roleTitle}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>{st.email}</div>
                      <div className="text-[11px] font-mono text-slate-500">{st.phone}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {st.permissions && st.permissions.length > 0 ? (
                          st.permissions.map(p => (
                            <span
                              key={p}
                              className="text-[10px] font-medium bg-teal-50 text-[#0F766E] px-1.5 py-0.5 rounded border border-teal-100"
                            >
                              {p.replace('_manage', '').replace('_', ' ')}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400">No work areas recorded</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-800">
                      ${st.monthlySalary} / mo
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        {st.userId && <button type="button" onClick={() => handleResetStaffPassword(st)} className="px-2.5 py-1 text-xs text-[#0F766E] bg-teal-50 hover:bg-teal-100 font-semibold rounded flex items-center gap-1">
                          <KeyRound className="w-3 h-3" /><span>Reset password</span>
                        </button>}
                        <button
                          onClick={() => openEditModal(st)}
                          className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded flex items-center gap-1"
                        >
                          <Edit className="w-3 h-3 text-slate-600" />
                          <span>Edit</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              {editingStaff ? `Edit Staff: ${editingStaff.fullName}` : 'Add New Staff Member'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Maintain staff details and assigned scope records
            </p>

            <form onSubmit={handleSaveStaff} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Sahra Ali Warsame"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t('staff_id')}</label>
                  <input type="text" value={staffId} onChange={e => setStaffId(e.target.value.toUpperCase())} placeholder={editingStaff?.staffId || t('staff_id_generated_hint')} maxLength={40} className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Role Designation</label>
                  <select
                    value={roleTitle}
                    onChange={e => setRoleTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  >
                    <option value="School Accountant">School Accountant</option>
                    <option value="Admissions Registrar">Admissions Registrar</option>
                    <option value="Head Librarian">Head Librarian</option>
                    <option value="IT & Records Clerk">IT & Records Clerk</option>
                    <option value="Administrative Assistant">Administrative Assistant</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Monthly Salary ($)</label>
                  <input
                    type="number"
                    value={salary}
                    onChange={e => setSalary(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email (Login ID)</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="staff@school.so"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+25261..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  />
                </div>
              </div>

              {/* Granular Permissions Section */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  Record the staff member&apos;s assigned work areas:
                </label>
                <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  {AVAILABLE_PERMISSIONS.map(p => {
                    const isChecked = selectedPermissions.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleTogglePermission(p.id)}
                        className="flex items-center gap-2 cursor-pointer text-xs"
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-[#0F766E] shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className={isChecked ? 'font-semibold text-slate-900' : 'text-slate-600'}>
                          {p.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  {editingStaff ? 'Update Staff Record' : 'Create Staff Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
