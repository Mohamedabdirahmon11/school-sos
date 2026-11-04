/**
 * Support Ticket Desk & Security Audit Log Viewer for Super Admin
 * Reply to school tickets, adjust priority/status, inspect security events, and export audit CSV
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { SupportTicket, AuditLog } from '../../types/index.ts';
import { PaginationControls, PageInfo } from '../common/PaginationControls.tsx';
import { LifeBuoy, ShieldAlert, MessageSquare, Download, Search, CheckCircle2, Send, X } from 'lucide-react';

export const SupportAuditView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tickets' | 'audit'>('tickets');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [ticketPageInfo, setTicketPageInfo] = useState<PageInfo | null>(null);
  const [auditPageInfo, setAuditPageInfo] = useState<PageInfo | null>(null);
  const [ticketPage, setTicketPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState<any>('resolved');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditCategory, setAuditCategory] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [tData, lData] = await Promise.all([
        ApiClient.getTickets({ page: ticketPage, pageSize: 20 }),
        ApiClient.getAuditLogs({ search: auditSearch, category: auditCategory, page: auditPage, pageSize: 20 })
      ]);
      setTickets(tData);
      setLogs(lData);
      setTicketPageInfo((tData as any).pagination || null);
      setAuditPageInfo((lData as any).pagination || null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [auditSearch, auditCategory, ticketPage, auditPage]);

  const handleReplyTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;

    try {
      const updated = await ApiClient.replyTicket(selectedTicket.id, {
        content: replyText,
        status: replyStatus
      });
      setReplyText('');
      setSelectedTicket(updated);
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleExportAuditCSV = () => {
    let csv = 'ID,Timestamp,Action,Category,School,User,Role,Details,Severity\n';
    for (const l of logs) {
      csv += `"${l.id}","${l.timestamp}","${l.action}","${l.category}","${l.schoolName || ''}","${l.userName}","${l.userRole}","${l.details.replace(/"/g, '""')}","${l.severity}"\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schoolos_audit_log_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (isLoading) return <div role="status" aria-busy="true" className="p-6 text-sm text-[#64748B]">Loading support and security records…</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Support Desk & Security Audit Log
          </h1>
          <p className="text-xs text-[#64748B]">
            Resolve tenant tickets and monitor immutable system security events
          </p>
        </div>

        {/* Segmented Top Switcher */}
        <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg self-start sm:self-auto text-xs">
          <button
            onClick={() => setActiveTab('tickets')}
            className={`px-3 py-1.5 font-medium rounded transition-colors ${
              activeTab === 'tickets' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
            }`}
          >
            Support Tickets Desk
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 font-medium rounded transition-colors ${
              activeTab === 'audit' ? 'bg-white text-[#132A29] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#132A29]'
            }`}
          >
            Security Audit Trail
          </button>
        </div>
      </div>

      {/* TICKETS TAB */}
      {activeTab === 'tickets' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden lg:col-span-2 shadow-xs">
            <div className="px-5 py-4 border-b border-[#E2E8F0]">
              <h2 className="text-sm font-bold text-[#132A29]">Tenant Support Inquiries</h2>
              <p className="text-[11px] text-[#64748B]">Tickets opened directly by school administrators</p>
            </div>

            <div className="divide-y divide-[#E2E8F0]">
              {tickets.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#64748B]">
                  No tickets opened yet. All school inquiries resolved.
                </div>
              ) : (
                tickets.map(t => {
                  const isSelected = selectedTicket?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTicket(t)}
                      className={`p-4 cursor-pointer transition-colors text-xs ${
                        isSelected ? 'bg-[#F0FDFA]' : 'hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#0F766E]">{t.ticketNumber}</span>
                          <span className="font-semibold text-[#132A29]">{t.subject}</span>
                        </div>
                        <span className={`text-[10px] font-bold uppercase ${
                          t.status === 'open' ? 'text-amber-700' :
                          t.status === 'resolved' ? 'text-emerald-700' :
                          'text-slate-600'
                        }`}>
                          {t.status}
                        </span>
                      </div>
                      <p className="text-[#64748B] mt-1 line-clamp-1">{t.description}</p>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-[#64748B]">
                        <span>School: <strong>{t.schoolName || 'General'}</strong></span>
                        <span aria-hidden="true">·</span>
                        <span>By: {t.createdByName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{t.createdAt.split('T')[0]}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <PaginationControls info={ticketPageInfo} onPage={setTicketPage} />
          </div>

          {/* Ticket Response Panel */}
          {selectedTicket ? (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4 shadow-xs lg:col-span-1">
              <div className="flex items-start justify-between pb-3 border-b border-[#E2E8F0]">
                <div>
                  <span className="text-xs font-mono font-bold text-[#0F766E]">{selectedTicket.ticketNumber}</span>
                  <h3 className="text-sm font-bold text-[#132A29] mt-0.5">{selectedTicket.subject}</h3>
                  <p className="text-[11px] text-[#64748B]">{selectedTicket.schoolName} · {selectedTicket.createdByName}</p>
                </div>
                <button onClick={() => setSelectedTicket(null)} className="text-[#64748B] hover:text-[#132A29]">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Messages Thread */}
              <div className="space-y-3 max-h-64 overflow-y-auto text-xs pr-1">
                {selectedTicket.messages.map(m => (
                  <div
                    key={m.id}
                    className={`p-3 rounded-lg border ${
                      m.senderRole === 'super_admin'
                        ? 'bg-[#F0FDFA] border-[#CCFBF1] text-[#132A29]'
                        : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
                      <span>{m.senderName} ({m.senderRole})</span>
                      <span className="font-mono font-normal text-[#64748B]">{m.timestamp.split('T')[1].slice(0, 5)}</span>
                    </div>
                    <p className="leading-relaxed">{m.content}</p>
                  </div>
                ))}
              </div>

              {/* Reply Form */}
              <form onSubmit={handleReplyTicket} className="space-y-3 pt-3 border-t border-[#E2E8F0] text-xs">
                <div>
                  <label className="block font-medium text-[#334155]">Super Admin Reply</label>
                  <textarea
                    rows={3}
                    required
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Type official response..."
                    className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={replyStatus}
                    onChange={e => setReplyStatus(e.target.value)}
                    className="w-1/2 px-2.5 py-1.5 border border-[#CBD5E1] rounded-lg text-xs"
                  >
                    <option value="resolved">Mark Resolved</option>
                    <option value="in_progress">Keep In Progress</option>
                    <option value="closed">Close Ticket</option>
                  </select>

                  <button
                    type="submit"
                    className="w-1/2 py-1.5 bg-[#0F766E] hover:bg-[#0D655E] text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Reply</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-8 text-center text-xs text-[#64748B] flex flex-col items-center justify-center shadow-xs">
              <MessageSquare className="w-8 h-8 text-[#0F766E]/40 mb-2" />
              <p className="font-semibold text-[#132A29]">Select a Ticket</p>
              <p className="text-[11px] mt-0.5">Click any ticket to view conversation and reply</p>
            </div>
          )}
        </div>
      )}

      {/* AUDIT LOG TAB */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-3 rounded-xl border border-[#E2E8F0]">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search audit trail..."
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={auditCategory}
                onChange={e => setAuditCategory(e.target.value)}
                className="px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-xs bg-white text-[#334155]"
              >
                <option value="all">All Categories</option>
                <option value="auth">Authentication & Lockout</option>
                <option value="subscription">Subscriptions & Plans</option>
                <option value="school">School & Students</option>
                <option value="security">Security & Settings</option>
                <option value="finance">Finance & Fees</option>
              </select>

              <button
                onClick={handleExportAuditCSV}
                className="px-3 py-1.5 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Audit CSV</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] text-[#64748B] font-medium border-b border-[#E2E8F0]">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Tenant School</th>
                    <th className="px-4 py-3">Details</th>
                    <th className="px-4 py-3">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-[#64748B]">
                        No audit events recorded matching filter.
                      </td>
                    </tr>
                  ) : (
                    logs.map(l => (
                      <tr key={l.id} className="hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3 font-mono text-[#64748B] whitespace-nowrap">
                          {l.timestamp.replace('T', ' ').slice(0, 19)}
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-[#132A29]">
                          {l.action}
                        </td>
                        <td className="px-4 py-3 uppercase text-[10px] font-mono text-[#0F766E]">
                          {l.category}
                        </td>
                        <td className="px-4 py-3 text-[#334155]">
                          {l.userName} ({l.userRole})
                        </td>
                        <td className="px-4 py-3 text-[#64748B]">
                          {l.schoolName || '-'}
                        </td>
                        <td className="px-4 py-3 text-[#334155] max-w-md">
                          {l.details}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold uppercase ${
                            l.severity === 'critical' ? 'text-red-700' :
                            l.severity === 'warning' ? 'text-amber-700' :
                            'text-slate-600'
                          }`}>
                            {l.severity}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls info={auditPageInfo} onPage={setAuditPage} />
          </div>
        </div>
      )}
    </div>
  );
};
