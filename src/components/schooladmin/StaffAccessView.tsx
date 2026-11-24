import React, { useState, useEffect } from 'react';
import './people-admin.css';
import { useAuth } from '../../context/AuthContext.tsx';
import { StaffMember } from '../../types/index.ts';
import { STAFF_PERMISSION_REGISTRY } from '../../lib/staff-permissions.ts';
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
  AlertCircle,
  X
} from 'lucide-react';

const AVAILABLE_PERMISSIONS = STAFF_PERMISSION_REGISTRY;
type CustomStaffRole = { id: string; name: string; description: string; permissions: string[] };

export const StaffAccessView: React.FC = () => {
  const { school, t } = useAuth();
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomStaffRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomStaffRole | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  // Form State
  const [fullName, setFullName] = useState('');
  const [roleTitle, setRoleTitle] = useState('School Accountant');
  const [email, setEmail] = useState('');
  const [staffPin, setStaffPin] = useState('');
  const [staffId, setStaffId] = useState('');
  const [phone, setPhone] = useState('');
  const [salary, setSalary] = useState('500');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(['fees_manage']);
  const [createLogin, setCreateLogin] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStaff = async () => {
    if (!school) return;
    setLoading(true);
    try {
      const [data, roles] = await Promise.all([
        ApiClient.request<StaffMember[]>('/school/staff'),
        ApiClient.request<CustomStaffRole[]>('/school/staff/roles')
      ]);
      setStaffList(data);
      setCustomRoles(roles);
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
            permissions: selectedPermissions,
            roleId: selectedRoleId || null
          })
        });
        setMessage('Staff profile and permissions updated successfully.');
      } else {
        const created = await ApiClient.request<StaffMember & { initialPin?: string }>('/school/staff', {
          method: 'POST',
          body: JSON.stringify({
            fullName,
            roleTitle,
            email,
            staffId,
            phone,
            monthlySalary: parseFloat(salary) || 0,
            permissions: selectedPermissions,
            pin: staffPin,
            createLogin,
            roleId: selectedRoleId || undefined
          })
        });
        if (created.initialPin) {
          window.alert(`Accountant sign-in created.\nStaff ID: ${created.staffId}\nInitial PIN (shown once): ${created.initialPin}\nShare it securely with the staff member.`);
        }
        setMessage(createLogin ? `Staff sign-in account created for ${fullName} (${created.staffId}).` : `Staff record created for ${fullName} (${created.staffId}) without login access.`);
      }

      setShowAddModal(false);
      setEditingStaff(null);
      setFullName('');
      setEmail('');
      setStaffPin('');
      setStaffId('');
      setPhone('');
      setCreateLogin(true);
      setSelectedRoleId('');
      await fetchStaff();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleRolePermission = (id: string) => setRolePermissions(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);

  const openRoleEditor = (role?: CustomStaffRole) => {
    setEditingRole(role || null);
    setRoleName(role?.name || '');
    setRoleDescription(role?.description || '');
    setRolePermissions(role?.permissions || []);
    setShowRoleModal(true);
    setError(null);
  };

  const saveCustomRole = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const body = { name: roleName.trim(), description: roleDescription.trim(), permissions: rolePermissions };
      if (editingRole) {
        await ApiClient.request(`/school/staff/roles/${editingRole.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setMessage('Custom role updated; assigned staff permissions were synchronized.');
      } else {
        await ApiClient.request('/school/staff/roles', { method: 'POST', body: JSON.stringify(body) });
        setMessage('Custom role created.');
      }
      setShowRoleModal(false);
      await fetchStaff();
    } catch (err: any) { setError(err.message || 'Could not save custom role.'); }
  };

  const deleteCustomRole = async (role: CustomStaffRole) => {
    if (!confirm(`Delete custom role "${role.name}"? Staff assigned to it must be reassigned first.`)) return;
    setError(null);
    try {
      await ApiClient.request(`/school/staff/roles/${role.id}`, { method: 'DELETE' });
      setCustomRoles(current => current.filter(item => item.id !== role.id));
      setMessage('Custom role deleted.');
    } catch (err: any) { setError(err.message || 'Could not delete custom role.'); }
  };

  const handleResetStaffPin = async (staff: StaffMember) => {
    if (!staff.userId) {
      setError('This staff record is not linked to a sign-in account.');
      return;
    }
    if (!confirm(`Generate a new PIN for ${staff.fullName}? It will be shown once.`)) return;
    setError(null);
    try {
      const result = await ApiClient.request<{ newPin: string; staff: { staffId: string; fullName: string } }>(`/school/staff/${staff.id}/reset-pin`, { method: 'POST' });
      window.alert(`Staff ID: ${result.staff.staffId}\nNew PIN: ${result.newPin}\nShare it securely.`);
      setMessage(`New PIN generated for ${staff.fullName}.`);
    } catch (err: any) {
      setError(err.message || 'Could not reset this staff PIN.');
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
    setSelectedRoleId(staff.roleId || '');
    setCreateLogin(!!staff.userId);
    setShowAddModal(true);
  };

  const filteredStaff = staffList.filter(
    s =>
      s.fullName.toLowerCase().includes(search.toLowerCase()) ||
      s.roleTitle.toLowerCase().includes(search.toLowerCase()) ||
      (s.email || '').toLowerCase().includes(search.toLowerCase())
      || (s.staffId || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="school-people-page school-people-staff-page mx-auto min-w-0 w-full max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Staff Roles & Permissions
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => openRoleEditor()} className="px-3.5 py-2 border border-[#0F766E] text-[#0F766E] text-xs font-semibold rounded-lg flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />Manage Custom Roles</button>
        <button
          onClick={() => {
            setEditingStaff(null);
            setFullName('');
            setEmail('');
            setStaffId('');
            setPhone('');
            setSelectedPermissions(['fees_manage']);
            setSelectedRoleId('');
            setRoleTitle('School Accountant');
            setCreateLogin(true);
            setShowAddModal(true);
          }}
          className="px-3.5 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Add Staff Member</span>
        </button>
        </div>
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

      <section className="bg-white rounded-xl border border-[#E2E8F0] p-4">
        <div className="flex items-center justify-between gap-3 mb-3"><div><h2 className="text-sm font-bold text-[#132A29]">Custom roles</h2><p className="text-[11px] text-slate-500">School-scoped permission bundles used by staff sign-ins.</p></div><button type="button" onClick={() => openRoleEditor()} className="text-xs font-semibold text-[#0F766E]">+ New role</button></div>
        {customRoles.length ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">{customRoles.map(role => <div key={role.id} className="rounded-lg border border-slate-200 p-3"><div className="flex justify-between gap-2"><b className="text-xs text-slate-800">{role.name}</b><span className="text-[10px] text-slate-500">{role.permissions.length} permissions</span></div><p className="text-[11px] text-slate-500 mt-1">{role.description || 'No description'}</p><div className="flex gap-3 mt-2"><button type="button" onClick={() => openRoleEditor(role)} className="text-[11px] text-[#0F766E] font-semibold">Edit</button><button type="button" onClick={() => void deleteCustomRole(role)} className="text-[11px] text-rose-600 font-semibold">Delete</button></div></div>)}</div> : <p className="text-xs text-slate-400">No custom roles created yet.</p>}
      </section>

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
          <table className="w-full min-w-[760px] text-left text-xs">
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
                      <div>{st.email || 'No login account'}</div>
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
                        {st.userId && <button type="button" onClick={() => handleResetStaffPin(st)} className="px-2.5 py-1 text-xs text-[#0F766E] bg-teal-50 hover:bg-teal-100 font-semibold rounded flex items-center gap-1">
                          <KeyRound className="w-3 h-3" /><span>Reset PIN</span>
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
                    onChange={e => { setRoleTitle(e.target.value); if (e.target.value === 'Driver') { setCreateLogin(false); setSelectedPermissions([]); } else { setCreateLogin(true); } }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  >
                    <option value="Driver">Driver</option>
                    <option value="School Accountant">School Accountant</option>
                    <option value="Admissions Registrar">Admissions Registrar</option>
                    <option value="Head Librarian">Head Librarian</option>
                    <option value="IT & Records Clerk">IT & Records Clerk</option>
                    <option value="Administrative Assistant">Administrative Assistant</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Saved Custom Role (optional)</label>
                  <select value={selectedRoleId} onChange={e => { const id = e.target.value; setSelectedRoleId(id); const role = customRoles.find(item => item.id === id); if (role) { setRoleTitle(role.name); setSelectedPermissions(role.permissions); } }} className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
                    <option value="">Use manual permissions</option>
                    {customRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contact Email (optional)</label>
                  <input
                    type="email"
                    required={false}
                    disabled={!createLogin}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Optional contact email"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
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

              {createLogin && !editingStaff && <div><label className="block text-xs font-medium text-slate-700 mb-1">Initial Accountant PIN (4–6 digits)</label><input type="password" inputMode="numeric" maxLength={6} required value={staffPin} onChange={e => setStaffPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter 4–6 digit PIN" className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg" /></div>}
              <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={createLogin} onChange={e => setCreateLogin(e.target.checked)} disabled={!!editingStaff || roleTitle === 'Driver'} /> Create a system login for this staff member</label>
              {!createLogin && <p className="text-[11px] text-slate-500">This person is recorded in Staff & Access only. No username, password or separate portal is created.</p>}

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
      {showRoleModal && <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
        <form onSubmit={saveCustomRole} className="bg-white rounded-xl shadow-xl max-w-xl w-full p-5 max-h-[90vh] overflow-y-auto space-y-3">
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">{editingRole ? 'Edit Custom Role' : 'Create Custom Role'}</h3><button type="button" onClick={() => setShowRoleModal(false)}><X className="w-4 h-4" /></button></div>
          <input required minLength={2} maxLength={100} value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Role name (e.g. Admissions Officer)" className="w-full px-3 py-2 text-xs border rounded-lg" />
          <textarea maxLength={500} value={roleDescription} onChange={e => setRoleDescription(e.target.value)} placeholder="Short description (optional)" className="w-full px-3 py-2 text-xs border rounded-lg" rows={2} />
          <div><p className="text-xs font-semibold text-slate-700 mb-2">Permission areas</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 border rounded-lg p-3">{AVAILABLE_PERMISSIONS.map(permission => <label key={permission.id} className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={rolePermissions.includes(permission.id)} onChange={() => toggleRolePermission(permission.id)} />{permission.label}</label>)}</div></div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowRoleModal(false)} className="px-3 py-2 text-xs border rounded-lg">Cancel</button><button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0F766E] text-white rounded-lg">Save role</button></div>
        </form>
      </div>}
    </div>
  );
};
