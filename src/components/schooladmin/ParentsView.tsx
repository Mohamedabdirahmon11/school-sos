/**
 * Parents & Contacts Directory for School Admin
 * Shows every enrolled family page-by-page and provides real call, SMS and WhatsApp links.
 */

import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { PaginationControls, PageInfo } from '../common/PaginationControls.tsx';
import { Search, ExternalLink, Phone, MessageSquare } from 'lucide-react';

export const ParentsView: React.FC = () => {
  const { school } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!school) {
      setStudents([]);
      setPageInfo(null);
      setIsLoading(false);
      return;
    }
    let active = true;
    setIsLoading(true);
    setLoadError(null);
    ApiClient.getSchoolStudents({ schoolId: school.id, page, pageSize: 20, search })
      .then((rows: any[]) => {
        if (!active) return;
        setStudents(Array.isArray(rows) ? rows : []);
        setPageInfo((rows as any).pagination || null);
      })
      .catch((error: any) => {
        if (!active) return;
        setLoadError(error?.message || 'Could not load parent contacts.');
        setStudents([]);
        setPageInfo(null);
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [school?.id, page, search, reloadCount]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const contactActions = (phone?: string) => {
    const value = typeof phone === 'string' ? phone.trim() : '';
    if (!value) return <span className="text-slate-400">No phone</span>;
    const digits = value.replace(/\D/g, '');
    return (
      <div className="flex flex-wrap gap-1.5 mt-1">
        <a href={`tel:${value}`} aria-label={`Call ${value}`}
          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50">
          <Phone className="h-3 w-3" /> Call
        </a>
        <a href={`sms:${value}`} aria-label={`Send SMS to ${value}`}
          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50">
          <MessageSquare className="h-3 w-3" /> SMS
        </a>
        {digits && <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer"
          aria-label={`WhatsApp ${value}`}
          className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100">
          WhatsApp <ExternalLink className="h-3 w-3" />
        </a>}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#132A29]">Parents & Guardian Directory</h1>
        <p className="text-xs text-[#64748B]">Parent contact details and linked enrolled children</p>
      </div>

      <div className="bg-white p-3 rounded-xl border border-[#E2E8F0]">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
          <input type="search" placeholder="Search student name or parent phone..." value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500" role="status">Loading parent contacts…</div>
        ) : loadError ? (
          <div className="p-8 text-center text-sm text-rose-700" role="alert">
            {loadError}
            <button type="button" onClick={() => setReloadCount(count => count + 1)} className="ml-3 underline">Retry</button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                  <tr>
                    <th className="px-4 py-3">Enrolled Child (Student)</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Father Contact</th>
                    <th className="px-4 py-3">Mother Contact</th>
                    <th className="px-4 py-3">Fee Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {students.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-[#64748B]">No parent records found.</td></tr>
                  ) : students.map(student => (
                    <tr key={student.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-[#132A29] block">{student.firstName} {student.middleName} {student.lastName}</span>
                        <span className="font-mono text-[10px] text-[#64748B]">{student.studentId}</span>
                      </td>
                      <td className="px-4 py-3 text-[#334155]">{student.className || '—'}</td>
                      <td className="px-4 py-3 font-mono text-[#132A29] font-medium">
                        {student.fatherPhone || '—'}{contactActions(student.fatherPhone)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#132A29] font-medium">
                        {student.motherPhone || '—'}{contactActions(student.motherPhone)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold uppercase ${student.feeStatus === 'paid' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {student.feeStatus || 'unknown'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls info={pageInfo} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
};
