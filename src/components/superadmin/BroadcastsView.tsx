/**
 * Platform Broadcasts Composer & Delivery History for Super Admin
 * Sends system-wide announcements marked "From platform" to target tenant audiences
 */

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api.ts';
import { PlatformBroadcast, School } from '../../types/index.ts';
import { Radio, Send, Clock, CheckCircle2, Building2 } from 'lucide-react';

export const BroadcastsView: React.FC = () => {
  const [broadcasts, setBroadcasts] = useState<PlatformBroadcast[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<any>('all_schools');
  const [targetSchoolId, setTargetSchoolId] = useState('');
  const [sendOption, setSendOption] = useState<'now' | 'schedule'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBroadcasts = async () => {
    setIsLoading(true);
    try {
      const [bData, sData] = await Promise.all([
        ApiClient.getBroadcasts(),
        ApiClient.getSchools()
      ]);
      setBroadcasts(bData);
      setSchools(sData);
      if (sData.length > 0) setTargetSchoolId(sData[0].id);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  if (isLoading) return <div role="status" aria-busy="true" className="p-6 text-sm text-[#64748B]">Loading broadcasts…</div>;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !message) return;

    setIsSubmitting(true);
    try {
      await ApiClient.sendBroadcast({
        title,
        message,
        audience,
        targetSchoolId: audience === 'one_school' ? targetSchoolId : undefined,
        sendNow: sendOption === 'now',
        scheduledFor: sendOption === 'schedule' ? scheduledFor : undefined
      });

      setTitle('');
      setMessage('');
      setNotice(sendOption === 'now' ? 'Broadcast dispatched to target schools.' : 'Broadcast scheduled.');
      await fetchBroadcasts();
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
          Platform Broadcasts & Announcements
        </h1>
        <p className="text-xs text-[#64748B]">
          Dispatch system messages to schools, administrators, and faculties marked "From platform"
        </p>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Composer Form */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs lg:col-span-1">
          <h2 className="text-sm font-bold text-[#132A29] mb-3 flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#0F766E]" />
            <span>Compose Broadcast</span>
          </h2>

          <form onSubmit={handleSend} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-[#334155]">Broadcast Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Scheduled Maintenance Notice"
                className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-medium text-[#334155]">Target Audience</label>
              <select
                value={audience}
                onChange={e => setAudience(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
              >
                <option value="all_schools">All Schools & Communities</option>
                <option value="school_admins">School Administrators Only</option>
                <option value="teachers">Teaching Staff Only</option>
                <option value="one_school">Specific Tenant School</option>
              </select>
            </div>

            {audience === 'one_school' && (
              <div>
                <label className="block font-medium text-[#334155]">Select School</label>
                <select
                  value={targetSchoolId}
                  onChange={e => setTargetSchoolId(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                >
                  {schools.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block font-medium text-[#334155]">Message Body</label>
              <textarea
                rows={4}
                required
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Compose announcement contents..."
                className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="block font-medium text-[#334155]">Delivery Schedule</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="schedule"
                    checked={sendOption === 'now'}
                    onChange={() => setSendOption('now')}
                    className="text-[#0F766E]"
                  />
                  <span>Send Immediately</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="schedule"
                    checked={sendOption === 'schedule'}
                    onChange={() => setSendOption('schedule')}
                    className="text-[#0F766E]"
                  />
                  <span>Schedule for Later</span>
                </label>
              </div>

              {sendOption === 'schedule' && (
                <input
                  type="datetime-local"
                  required
                  value={scheduledFor}
                  onChange={e => setScheduledFor(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-[#CBD5E1] rounded-lg"
                />
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2 px-4 bg-[#0F766E] hover:bg-[#0D655E] text-white rounded-lg font-semibold shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sendOption === 'now' ? 'Dispatch Broadcast Now' : 'Save Scheduled Broadcast'}</span>
            </button>
          </form>
        </div>

        {/* History Table */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs lg:col-span-2">
          <div className="px-5 py-4 border-b border-[#E2E8F0]">
            <h2 className="text-sm font-bold text-[#132A29]">Broadcast History & Queue</h2>
            <p className="text-[11px] text-[#64748B]">All sent and queued platform announcements</p>
          </div>

          <div className="divide-y divide-[#E2E8F0]">
            {broadcasts.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B]">
                No broadcasts sent yet.
              </div>
            ) : (
              broadcasts.map(b => (
                <div key={b.id} className="p-4 hover:bg-[#F8FAFC] transition-colors space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#132A29] text-sm">{b.title}</span>
                    <span className={`text-[11px] font-semibold ${
                      b.status === 'sent' ? 'text-emerald-700' : 'text-amber-700'
                    }`}>
                      {b.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[#334155] leading-relaxed">{b.message}</p>
                  <div className="flex items-center gap-3 text-[11px] text-[#64748B] pt-1">
                    <span>Audience: <strong className="capitalize">{b.audience.replace(/_/g, ' ')}</strong></span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">
                      {b.sentAt ? `Dispatched ${b.sentAt.split('T')[0]}` : `Scheduled for ${b.scheduledFor}`}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
