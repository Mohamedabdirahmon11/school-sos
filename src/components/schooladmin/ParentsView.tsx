/**
 * Parents & Contacts Directory for School Admin
 * Mapped enrolled children, father & mother contact numbers, WhatsApp direct communication link, and fee balances
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { Search } from 'lucide-react';

export const ParentsView: React.FC = () => {
  const { school } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!school) return;
    ApiClient.getSchoolStudents({ schoolId: school.id }).then(setStudents).catch((error: any) => setLoadError(error?.message || 'Could not load parent contacts.')).finally(() => setIsLoading(false));
  }, [school]);

  const parentRows = students.reduce((groups: Array<{ phone: string; children: Set<string>; classes: Set<string> }>, student) => {
    const child = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ');
    const contacts = [student.fatherPhone, student.motherPhone].filter((phone: string | undefined) => Boolean(phone));
    contacts.forEach((phone: string) => {
      const normalized = phone.replace(/\\s+/g, '').trim();
      if (!normalized) return;
      let group = groups.find(item => item.phone === normalized);
      if (!group) { group = { phone: normalized, children: new Set<string>(), classes: new Set<string>() }; groups.push(group); }
      if (child) group.children.add(child);
      if (student.className) group.classes.add(student.className);
    });
    return groups;
  }, []);
  const filtered = parentRows.filter(row =>
    row.phone.includes(search.trim()) ||
    Array.from(row.children).some(child => child.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-5 md:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[#102522]">
          Parents & Contacts
        </h1>
      </div>

      <div className="bg-white p-3 rounded-xl border border-[#E2E8F0]">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by student name or parent phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#dce7e4] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="bg-[#f6faf8] text-[#71817d] font-semibold border-b border-[#e6efec]">
              <tr>
                <th className="px-4 py-3">Parent</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Children</th>
                <th className="px-4 py-3">Class</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {isLoading ? (
                <tr><td colSpan={4} className="p-8 text-center text-[#64748B]">Loading parent contacts...</td></tr>
              ) : loadError ? (
                <tr><td colSpan={4} className="p-8 text-center text-rose-700">{loadError}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-[#64748B]">No parent records found.</td></tr>
              ) : filtered.map(row => (
                <tr key={row.phone} className="hover:bg-[#F8FAFC]">
                  <td className="px-4 py-3 font-medium text-[#132A29]">Parent</td>
                  <td className="px-4 py-3 font-mono text-[#132A29]">{row.phone}</td>
                  <td className="px-4 py-3 text-[#334155]">{Array.from(row.children).join(', ')}</td>
                  <td className="px-4 py-3 text-[#334155]">{Array.from(row.classes).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
