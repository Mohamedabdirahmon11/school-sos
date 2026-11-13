/**
 * Parents & Contacts Directory for School Admin
 * One row per unique guardian phone number, with school-scoped linked children.
 */

import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { PaginationControls, PageInfo } from '../common/PaginationControls.tsx';
import { Search, ExternalLink, Phone, MessageSquare, Users } from 'lucide-react';

type ParentContact = {
  id: string;
  phone: string;
  relationships: string[];
  students: Array<{ id: string; studentId: string; fullName: string; className: string }>;
};

export const ParentsView: React.FC = () => {
  const { school } = useAuth();
  const [contacts, setContacts] = useState<ParentContact[]>([]);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [classes, setClasses] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!school) {
      setClasses([]);
      return;
    }
    let active = true;
    ApiClient.getClasses()
      .then(rows => { if (active) setClasses(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (active) setClasses([]); });
    return () => { active = false; };
  }, [school?.id]);

  useEffect(() => {
    if (!school) {
      setContacts([]);
      setPageInfo(null);
      setIsLoading(false);
      return;
    }
    let active = true;
    setIsLoading(true);
    setLoadError(null);
    ApiClient.getParentContacts({ page, pageSize: 50, search, classId: classFilter })
      .then((rows: ParentContact[]) => {
        if (!active) return;
        setContacts(Array.isArray(rows) ? rows : []);
        setPageInfo((rows as any).pagination || null);
      })
      .catch((error: any) => {
        if (!active) return;
        setLoadError(error?.message || 'Could not load parent contacts.');
        setContacts([]);
        setPageInfo(null);
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [school?.id, page, search, classFilter, reloadCount]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const contactActions = (phone: string) => {
    const value = phone.trim();
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
        <p className="text-xs text-[#64748B]">One contact per unique guardian phone number, with linked enrolled children</p>
      </div>

      <div className="bg-white p-3 rounded-xl border border-[#E2E8F0] flex flex-wrap items-center gap-3">
        <select aria-label="Filter by class" value={classFilter} onChange={e => { setClassFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-xs bg-white text-[#334155]">
          <option value="">All classes</option>
          {[...classes].sort((a, b) => (Number(a.gradeLevel) || 0) - (Number(b.gradeLevel) || 0) || String(a.section || '').localeCompare(String(b.section || ''))).map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.section ? ` · ${c.section}` : ''}</option>
          ))}
        </select>
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
          <input type="search" placeholder="Search parent phone or linked student..." value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none" />
        </div>
        <span className="ml-auto text-xs text-slate-500">{pageInfo?.total ?? contacts.length} unique contacts</span>
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
                    <th className="px-4 py-3 w-12">No.</th>
                    <th className="px-4 py-3">Parent Contact</th>
                    <th className="px-4 py-3">Relationship</th>
                    <th className="px-4 py-3">Linked Children</th>
                    <th className="px-4 py-3">Children</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {contacts.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-[#64748B]">No parent contacts found for this school and class.</td></tr>
                  ) : contacts.map((contact, rowIndex) => (
                    <tr key={contact.id} className="align-top hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3 text-slate-400">{((pageInfo?.page || page) - 1) * (pageInfo?.pageSize || 50) + rowIndex + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-[#132A29]">{contact.phone}</span>
                        {contactActions(contact.phone)}
                      </td>
                      <td className="px-4 py-3 text-[#334155]">{contact.relationships.join(' / ')}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1.5">
                          {contact.students.map(student => (
                            <div key={student.id}>
                              <span className="font-semibold text-[#132A29]">{student.fullName}</span>
                              <span className="ml-2 font-mono text-[10px] text-[#64748B]">{student.studentId}</span>
                              <p className="text-[10px] text-slate-500">{student.className}</p>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">
                          <Users className="h-3 w-3" /> {contact.students.length}
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
