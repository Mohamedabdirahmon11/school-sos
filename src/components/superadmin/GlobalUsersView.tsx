/**
 * Global User Directory for Super Admin
 * Search, filter by role, block/unblock, reset password, view active sessions
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { User, UserRole } from '../../types/index.ts';
import { Users, Search, ShieldCheck, KeyRound, Ban, CheckCircle, ShieldAlert, Monitor } from 'lucide-react';
import { SessionsModal } from './SessionsModal.tsx';

export const GlobalUsersView: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sessionsModalOpen, setSessionsModalOpen] = useState(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await ApiClient.getGlobalUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setLoadError(err.message || 'Unable to load global users.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleBlock = async (user: User) => {
    const isBlocked = user.isBlocked;
    const confirmMsg = isBlocked 
      ? `Unblock user "${user.fullName}"?`
      : `Block user "${user.fullName}" from accessing the platform?`;
    if (!confirm(confirmMsg)) return;

    try {
      await ApiClient.toggleUserBlock(user.id, !isBlocked);
      setNotice(`User ${user.fullName} ${isBlocked ? 'unblocked' : 'blocked'}.`);
      await fetchUsers();
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResetPassword = async (user: User) => {
    if (!confirm(`Generate a temporary password for ${user.fullName}? They must change it at their next sign-in.`)) return;
    try {
      const result = await ApiClient.resetUserPassword(user.id);
      window.alert(`Temporary password for ${user.fullName}:\n\n${result.temporaryPassword}\n\nThis is shown once. The user must change it at next sign-in.`);
      setNotice(`Temporary password generated for ${user.fullName}.`);
      await fetchUsers();
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filteredUsers = users.filter(u => {
    // Student identities belong in each school's student directory, not the platform staff directory.
    if (u.role === 'student') return false;
    const matchSearch = 
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(search.toLowerCase())) ||
      (u.phone && u.phone.includes(search)) ||
      (u.studentId && u.studentId.includes(search.toUpperCase()));
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  if (isLoading) return <div role="status" aria-busy="true" className="p-6 text-sm text-[#64748B]">Loading user directory…</div>;
  if (loadError) return (
    <div role="alert" className="m-6 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
      <p className="font-semibold">Platform users could not be loaded.</p>
      <p className="mt-1">{loadError}</p>
      <button type="button" onClick={() => void fetchUsers()} className="mt-3 font-semibold underline">Retry loading</button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Global User Management & Security
          </h1>
          <p className="text-xs text-[#64748B]">
            Platform staff and administrator accounts across all schools
          </p>
        </div>
        <button
          onClick={() => setSessionsModalOpen(true)}
          className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
        >
          <Monitor className="w-3.5 h-3.5 text-[#0F766E]" />
          <span>Active Sessions</span>
        </button>
      </div>

      <SessionsModal
        isOpen={sessionsModalOpen}
        onClose={() => setSessionsModalOpen(false)}
      />

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-white p-3 rounded-xl border border-[#E2E8F0]">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by name, email, phone, or staff ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg w-full md:w-auto overflow-x-auto text-xs">
          {[
            { id: 'all', label: 'All Roles' },
            { id: 'super_admin', label: 'Super Admin' },
            { id: 'school_admin', label: 'School Admin' },
            { id: 'teacher', label: 'Teacher' },
            { id: 'parent', label: 'Parent' },
          ].map(r => (
            <button
              key={r.id}
              onClick={() => setRoleFilter(r.id)}
              className={`px-3 py-1 font-medium rounded transition-colors whitespace-nowrap ${
                roleFilter === r.id
                  ? 'bg-white text-[#132A29] shadow-xs font-semibold'
                  : 'text-[#64748B] hover:text-[#132A29]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
              <tr>
                <th className="px-4 py-3">Full Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Identifier (Email / Phone / ID)</th>
                <th className="px-4 py-3">Failed Logins</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Active</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[#64748B]">
                    No users matching criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-4 py-3 font-semibold text-[#132A29]">{u.fullName}</td>
                    <td className="px-4 py-3">
                      <span className="capitalize font-mono text-[11px] text-[#0F766E]">
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[#64748B]">
                      {u.email || u.phone || u.studentId || '-'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#64748B]">
                      {u.failedLoginAttempts || 0} / 5
                    </td>
                    <td className="px-4 py-3">
                      {u.isBlocked ? (
                        <span className="text-red-700 font-semibold text-[11px]">BLOCKED</span>
                      ) : u.lockedUntil && new Date(u.lockedUntil) > new Date() ? (
                        <span className="text-amber-700 font-semibold text-[11px]">LOCKED (15m)</span>
                      ) : (
                        <span className="text-emerald-700 font-semibold text-[11px]">ACTIVE</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#64748B]">
                      {u.lastLoginAt ? u.lastLoginAt.split('T')[0] : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {['school_admin', 'accountant', 'teacher'].includes(u.role) && <button
                          onClick={() => handleResetPassword(u)}
                          className="p-1 text-[#0F766E] hover:bg-[#E2E8F0] rounded"
                          title="Reset Password"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>}
                        {u.role !== 'super_admin' && (
                          <button
                            onClick={() => handleToggleBlock(u)}
                            className={`p-1 rounded ${
                              u.isBlocked
                                ? 'text-emerald-700 hover:bg-emerald-50'
                                : 'text-red-700 hover:bg-red-50'
                            }`}
                            title={u.isBlocked ? 'Unblock User' : 'Block User'}
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
