/**
 * Parents & Contacts Directory for School Admin
 * Mapped enrolled children, father & mother contact numbers, WhatsApp direct communication link, and fee balances
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { PhoneCall, Search, MessageSquare, ExternalLink, GraduationCap } from 'lucide-react';

export const ParentsView: React.FC = () => {
  const { school } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!school) return;
    ApiClient.getAllSchoolStudents().then(setStudents).finally(() => setIsLoading(false));
  }, [school]);

  const filtered = students.filter(s => 
    s.fatherPhone?.includes(search) ||
    s.motherPhone?.includes(search) ||
    `${s.firstName} ${s.middleName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
          Parents & Guardian Directory
        </h1>
        <p className="text-xs text-[#64748B]">
          Direct contact directory, linked enrolled siblings, and communication channels
        </p>
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

      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
              <tr>
                <th className="px-4 py-3">Enrolled Child (Student)</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Father Phone</th>
                <th className="px-4 py-3">Mother Phone</th>
                <th className="px-4 py-3">Fee Status</th>
                <th className="px-4 py-3 text-right">Direct Communication</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[#64748B]">No parent records found.</td>
                </tr>
              ) : (
                filtered.map(s => (
                  <tr key={s.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-[#132A29] block">{s.firstName} {s.middleName} {s.lastName}</span>
                      <span className="font-mono text-[10px] text-[#64748B]">{s.studentId}</span>
                    </td>
                    <td className="px-4 py-3 text-[#334155]">{s.className}</td>
                    <td className="px-4 py-3 font-mono text-[#132A29] font-medium">{s.fatherPhone}</td>
                    <td className="px-4 py-3 font-mono text-[#132A29] font-medium">{s.motherPhone}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-bold uppercase ${
                        s.feeStatus === 'paid' ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        {s.feeStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => alert(`Initiating direct SMS/Call to father at ${s.fatherPhone}`)}
                          className="px-2.5 py-1 text-xs text-[#0F766E] bg-[#F0FDFA] hover:bg-[#CCFBF1] rounded border border-[#CCFBF1] transition-colors"
                        >
                          Call / SMS
                        </button>
                        <a
                          href={`https://wa.me/${s.fatherPhone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 transition-colors flex items-center gap-1"
                        >
                          <span>WhatsApp</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
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
