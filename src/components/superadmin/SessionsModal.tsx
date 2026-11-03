import React, { useState, useEffect } from 'react';
import { ShieldCheck, Monitor, Clock, X, AlertTriangle, UserX, RefreshCw } from 'lucide-react';
import { UserSession } from '../../types/index.ts';
import { ApiClient } from '../../services/api.ts';

interface SessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SessionsModal: React.FC<SessionsModalProps> = ({ isOpen, onClose }) => {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const data = await ApiClient.request<UserSession[]>('/superadmin/sessions');
      setSessions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    }
  }, [isOpen]);

  const handleRevoke = async (sessionId: string) => {
    setRevokingId(sessionId);
    try {
      await ApiClient.request('/superadmin/sessions/revoke', {
        method: 'POST',
        body: JSON.stringify({ sessionId })
      });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      console.error(err);
    } finally {
      setRevokingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 border border-slate-200 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
              <Monitor className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Active User Sessions & Security Tokens</h3>
              <p className="text-[11px] text-slate-500">Inspect concurrent logins and revoke access remotely</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchSessions}
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-100"
              title="Refresh sessions"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading active sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No active external sessions found.</div>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-800">{s.id}</span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-teal-100 text-[#0F766E]">
                      {s.userRole}
                    </span>
                    <span className="text-[11px] text-slate-500">User: {s.userId}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-3">
                    <span>IP: {s.ipAddress}</span>
                    <span>•</span>
                    <span className="truncate max-w-[200px]" title={s.userAgent}>
                      {s.userAgent}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      Started {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleRevoke(s.id)}
                  disabled={revokingId === s.id}
                  className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-md border border-red-200 flex items-center gap-1 transition-colors shrink-0"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>{revokingId === s.id ? 'Revoking...' : 'Revoke'}</span>
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Total tracked sessions: {sessions.length}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
