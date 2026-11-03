import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { SchoolEvent, SchoolNotice } from '../../types/index.ts';
import { ApiClient } from '../../services/api.ts';
import { PaginationControls, PageInfo } from '../common/PaginationControls.tsx';
import { 
  Calendar, 
  Bell, 
  Plus, 
  Trash2, 
  Pin, 
  Clock, 
  Sparkles, 
  AlertCircle, 
  CheckCircle, 
  Users,
  CalendarDays
} from 'lucide-react';

export const NoticesEventsView: React.FC = () => {
  const { school, user, t } = useAuth();
  const [activeTab, setActiveTab] = useState<'events' | 'notices'>('events');
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [notices, setNotices] = useState<SchoolNotice[]>([]);
  const [noticePageInfo, setNoticePageInfo] = useState<PageInfo | null>(null);
  const [noticePage, setNoticePage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Event form
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  const [eventType, setEventType] = useState<'event' | 'holiday' | 'exam' | 'meeting'>('event');

  // New Notice form
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeAudience, setNoticeAudience] = useState<SchoolNotice['audience']>('all');
  const [noticePinned, setNoticePinned] = useState(false);
  const [editingNotice, setEditingNotice] = useState<SchoolNotice | null>(null);
  const [noticeClassId, setNoticeClassId] = useState('');
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);

  const fetchData = async () => {
    if (!school) return;
    setLoading(true);
    try {
      const [eventsList, noticesList, classList] = await Promise.all([
        ApiClient.request<SchoolEvent[]>('/school/events').catch(() => []),
        ApiClient.getNotices({ page: noticePage, pageSize: 20 }).catch(() => []),
        ApiClient.request<Array<{ id: string; name: string }>>('/classes').catch(() => [])
      ]);
      setEvents(eventsList);
      setNotices(noticesList);
      setClasses(classList);
      setNoticePageInfo((noticesList as any).pagination || null);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch events and notices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [school, noticePage]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.request('/school/events', {
        method: 'POST',
        body: JSON.stringify({
          title: eventTitle,
          description: eventDescription,
          startDate: eventStartDate,
          endDate: eventEndDate,
          type: eventType
        })
      });

      setShowEventModal(false);
      setEventTitle('');
      setEventDescription('');
      setEventStartDate('');
      setEventEndDate('');
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try {
      await ApiClient.request(`/school/events/${id}`, {
        method: 'DELETE'
      });
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const noticePayload = {
        title: noticeTitle,
        content: noticeContent,
        audience: noticeAudience,
        classId: noticeAudience === 'class' ? noticeClassId : undefined,
        isPinned: noticePinned,
        publishDate: new Date().toISOString()
      };
      if (editingNotice) await ApiClient.updateNotice(editingNotice.id, noticePayload);
      else await ApiClient.createNotice(noticePayload);

      setShowNoticeModal(false);
      setEditingNotice(null);
      setNoticeTitle('');
      setNoticeContent('');
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const editNotice = (notice: SchoolNotice) => {
    setEditingNotice(notice);
    setNoticeTitle(notice.title);
    setNoticeContent(notice.content);
    setNoticeAudience(notice.audience);
    setNoticePinned(notice.isPinned);
    setNoticeClassId(notice.classId || '');
    setShowNoticeModal(true);
  };

  const handleArchiveNotice = async (notice: SchoolNotice) => {
    if (!confirm(t('archive_notice_confirm').replace('{title}', notice.title))) return;
    try { await ApiClient.archiveNotice(notice.id); await fetchData(); } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">
            Academic Calendar & School Announcements
          </h1>
          <p className="text-xs text-[#64748B]">
            Manage terms, official holidays, examination intervals, and targeted school broadcasts
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'notices' && user?.role === 'school_admin' && <button onClick={() => { setEditingNotice(null); setShowNoticeModal(true); }} className="px-3.5 py-2 bg-[#0F766E] text-white text-xs font-semibold rounded-lg"><Plus className="w-3.5 h-3.5 inline mr-1" />{t('add_notice')}</button>}
          <button
            onClick={() => setShowEventModal(true)}
            className="px-3.5 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Event / Holiday</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('events')}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'events'
              ? 'border-[#0F766E] text-[#0F766E]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Academic Calendar & Dates ({events.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('notices')}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'notices'
              ? 'border-[#0F766E] text-[#0F766E]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Announcements & Circulars ({notices.length})</span>
        </button>
      </div>

      {activeTab === 'events' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.length === 0 ? (
            <div className="col-span-full bg-white p-12 text-center rounded-xl border border-dashed border-slate-300">
              <CalendarDays className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs text-slate-600 font-medium">No calendar events or holidays posted yet.</p>
              <button
                onClick={() => setShowEventModal(true)}
                className="mt-3 px-3 py-1.5 bg-teal-50 text-[#0F766E] rounded-lg text-xs font-semibold"
              >
                Schedule First Event
              </button>
            </div>
          ) : (
            events.map(ev => {
              const badgeColors: Record<string, string> = {
                holiday: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                exam: 'bg-red-100 text-red-800 border-red-200',
                event: 'bg-blue-100 text-blue-800 border-blue-200',
                meeting: 'bg-purple-100 text-purple-800 border-purple-200'
              };

              return (
                <div
                  key={ev.id}
                  className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                          badgeColors[ev.type] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {ev.type}
                      </span>
                      <button
                        onClick={() => handleDeleteEvent(ev.id)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">{ev.title}</h3>
                    {ev.description && (
                      <p className="text-xs text-slate-600 line-clamp-3">{ev.description}</p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {ev.startDate} {ev.endDate && ev.endDate !== ev.startDate ? `to ${ev.endDate}` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {notices.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-xl border border-dashed border-slate-300">
              <Bell className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs text-slate-600">No notices posted for this school.</p>
            </div>
          ) : (
            notices.map(n => (
              <div
                key={n.id}
                className={`bg-white p-4 rounded-xl border ${
                  n.isPinned ? 'border-teal-300 bg-teal-50/20' : 'border-[#E2E8F0]'
                } shadow-xs space-y-2`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {n.isPinned && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
                        <Pin className="w-3 h-3 fill-amber-600" />
                        PINNED
                      </span>
                    )}
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      Audience: {n.audience}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(n.publishDate).toLocaleDateString()}
                  </span>
                  {user?.role === 'school_admin' && <span className="flex gap-2"><button onClick={() => editNotice(n)} aria-label={t('edit_notice')} className="text-xs text-teal-700">{t('edit_notice')}</button><button onClick={() => handleArchiveNotice(n)} aria-label={t('archive_notice')} className="text-xs text-red-600">{t('archive_notice')}</button></span>}
                </div>
                <h3 className="text-sm font-bold text-slate-900">{n.title}</h3>
                <p className="text-xs text-slate-700 whitespace-pre-wrap">{n.content}</p>
                <div className="text-[11px] text-slate-500 pt-1">
                  Issued by: <span className="font-semibold">{n.authorName}</span> ({n.authorRole})
                </div>
              </div>
            ))
          )}
          <PaginationControls info={noticePageInfo} onPage={setNoticePage} />
        </div>
      )}

      {/* Add Event Modal */}
      {showNoticeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-3">{editingNotice ? t('edit_notice') : t('add_notice')}</h3>
            <form onSubmit={handleCreateNotice} className="space-y-3">
              <input required value={noticeTitle} onChange={e => setNoticeTitle(e.target.value)} placeholder={t('notice_title')} className="w-full px-3 py-2 text-xs border rounded-lg" />
              <textarea required rows={5} value={noticeContent} onChange={e => setNoticeContent(e.target.value)} placeholder={t('notice_details')} className="w-full px-3 py-2 text-xs border rounded-lg" />
              <select value={noticeAudience} onChange={e => setNoticeAudience(e.target.value as any)} className="w-full px-3 py-2 text-xs border rounded-lg">
                <option value="all">{t('audience_everyone')}</option><option value="school">{t('audience_school')}</option><option value="class">{t('audience_class')}</option><option value="parents">{t('parent')}</option><option value="teachers">{t('teacher')}</option><option value="students">{t('student')}</option>
              </select>
              {noticeAudience === 'class' && <select required value={noticeClassId} onChange={e => setNoticeClassId(e.target.value)} className="w-full px-3 py-2 text-xs border rounded-lg"><option value="">{t('choose_class')}</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={noticePinned} onChange={e => setNoticePinned(e.target.checked)} />{t('pin_notice')}</label>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowNoticeModal(false)} className="px-3 py-2 text-xs">{t('cancel')}</button><button type="submit" className="px-4 py-2 bg-[#0F766E] text-white rounded-lg text-xs">{t('save')}</button></div>
            </form>
          </div>
        </div>
      )}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Add Calendar Event or Holiday</h3>
            <form onSubmit={handleCreateEvent} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Event Title</label>
                <input
                  type="text"
                  required
                  value={eventTitle}
                  onChange={e => setEventTitle(e.target.value)}
                  placeholder="e.g. Eid al-Fitr Holiday / Term 2 Final Exams"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Category / Type</label>
                <select
                  value={eventType}
                  onChange={e => setEventType(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                >
                  <option value="holiday">Official Holiday</option>
                  <option value="exam">Examination Period</option>
                  <option value="event">School Activity / Sports</option>
                  <option value="meeting">Parent-Teacher Meeting</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={eventStartDate}
                    onChange={e => setEventStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    value={eventEndDate}
                    onChange={e => setEventEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description / Notes</label>
                <textarea
                  rows={3}
                  value={eventDescription}
                  onChange={e => setEventDescription(e.target.value)}
                  placeholder="Additional guidance for teachers, parents, and students..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0F766E] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold rounded-lg"
                >
                  Save Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
