/**
 * School Support & Help Desk
 * Opens tickets directly to the Super Admin platform desk and displays replies
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { SupportTicket } from '../../types/index.ts';
import { PaginationControls, PageInfo } from '../common/PaginationControls.tsx';
import { LifeBuoy, Plus, MessageSquare, Send, CheckCircle2, Clock, X } from 'lucide-react';

export const SchoolSupportView: React.FC = () => {
  const { school } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<any>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchTickets = async () => {
    if (!school) return;
    try {
      const all = await ApiClient.getTickets({ page, pageSize: 20 });
      setPageInfo((all as any).pagination || null);
      setTickets(all.filter(t => t.schoolId === school.id));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [school, page]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !description) return;
    setIsSubmitting(true);
    try {
      await ApiClient.createTicket({ subject, description, priority }, school?.id);
      setShowCreateModal(false);
      setSubject('');
      setDescription('');
      setNotice('Support ticket submitted to Platform Super Administration.');
      await fetchTickets();
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto min-w-0 w-full max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Help Desk & Platform Support
          </h1>
          <p className="text-xs text-[#64748B]">
            Submit direct technical assistance requests and licensing tickets to Super Admin
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg shadow-sm transition-colors flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Open Support Ticket</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Tickets List */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
        <div className="divide-y divide-[#E2E8F0]">
          {tickets.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              <LifeBuoy className="w-8 h-8 text-[#0F766E]/40 mx-auto mb-2" />
              <p className="font-semibold text-[#132A29]">No active tickets</p>
              <p className="text-[11px] mt-0.5">Need assistance? Open a support ticket to platform engineers.</p>
            </div>
          ) : (
            tickets.map(t => (
              <div key={t.id} className="p-4 hover:bg-[#F8FAFC] transition-colors text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#0F766E]">{t.ticketNumber}</span>
                    <span className="font-bold text-[#132A29]">{t.subject}</span>
                  </div>
                  <span className={`text-[10px] font-bold uppercase ${
                    t.status === 'open' ? 'text-amber-700' :
                    t.status === 'resolved' ? 'text-emerald-700' :
                    'text-slate-600'
                  }`}>
                    {t.status}
                  </span>
                </div>
                <p className="text-[#334155]">{t.description}</p>
                
                {/* Thread replies if any */}
                {t.messages.length > 1 && (
                  <div className="mt-2 pl-3 border-l-2 border-[#0F766E] space-y-1.5 pt-1">
                    {t.messages.slice(1).map(m => (
                      <div key={m.id} className="p-2 bg-[#F0FDFA] rounded border border-[#CCFBF1]">
                        <p className="font-semibold text-[#132A29] text-[11px]">{m.senderName} ({m.senderRole}):</p>
                        <p className="text-[#334155] mt-0.5">{m.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <PaginationControls info={pageInfo} onPage={setPage} />
      </div>

      {/* CREATE TICKET MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-[#E2E8F0]">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
              <h2 className="text-base font-bold text-[#132A29]">Open Support Request</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-[#64748B] hover:text-[#132A29]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-[#334155]">Subject *</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Invoicing Inquiry or Question"
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-[#334155]">Priority</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#334155]">Description *</label>
                <textarea
                  rows={4}
                  required
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe your issue or request in detail..."
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border rounded-lg text-[#334155]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg font-semibold shadow-sm"
                >
                  {isSubmitting ? 'Sending...' : 'Submit to Super Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
