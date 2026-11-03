import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { DirectMessage, User } from '../../types/index.ts';
import { ApiClient } from '../../services/api.ts';
import { PaginationControls, PageInfo } from '../common/PaginationControls.tsx';
import { 
  MessageSquare, 
  Send, 
  Search, 
  User as UserIcon, 
  Check, 
  CheckCheck, 
  RefreshCw,
  Clock,
  Sparkles
} from 'lucide-react';

export const MessagesView: React.FC = () => {
  const { user, school } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [page, setPage] = useState(1);
  const [contacts, setContacts] = useState<User[]>([]);
  const [selectedContact, setSelectedContact] = useState<User | null>(null);
  const [inputText, setInputText] = useState('');
  const [searchContact, setSearchContact] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!school || !user) return;
    setLoading(true);
    try {
      const [msgData, uData] = await Promise.all([
        ApiClient.getMessages({ page, pageSize: 20 }).catch(() => []),
        ApiClient.getMessageContacts().catch(() => [])
      ]);

      setMessages(msgData);
      setPageInfo((msgData as any).pagination || null);

      const permittedContacts = uData as User[];
      setContacts(permittedContacts);
      if (!permittedContacts.some((contact: User) => contact.id === selectedContact?.id)) {
        setSelectedContact(permittedContacts[0] || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [school, user, page]);

  useEffect(() => {
    if (!selectedContact || !user) return;
    void ApiClient.markMessagesRead(selectedContact.id).then(() => {
      setMessages(current => current.map(message => message.senderId === selectedContact.id && message.recipientId === user.id ? { ...message, isRead: true } : message));
    }).catch(() => undefined);
  }, [selectedContact?.id, user?.id]);

  const activeThread = messages.filter(
    m =>
      selectedContact &&
      ((m.senderId === user?.id && m.recipientId === selectedContact.id) ||
        (m.senderId === selectedContact.id && m.recipientId === user?.id))
  );

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedContact) return;

    try {
      const newMsg = await ApiClient.sendMessage(
        selectedContact.id,
        selectedContact.fullName,
        selectedContact.role,
        inputText.trim()
      );

      if (newMsg) {
        setMessages(prev => [...prev, newMsg]);
        setInputText('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredContacts = contacts.filter(
    c =>
      c.fullName.toLowerCase().includes(searchContact.toLowerCase()) ||
      c.role.toLowerCase().includes(searchContact.toLowerCase()) ||
      (c.phone && c.phone.includes(searchContact))
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#132A29]">Direct Communications</h1>
          <p className="text-xs text-[#64748B]">
            Real-time internal messaging between administration, teachers, and parents
          </p>
        </div>
        <button
          onClick={fetchData}
          className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1.5 hover:bg-slate-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="flex-1 bg-white rounded-xl border border-[#E2E8F0] overflow-hidden flex flex-col md:flex-row shadow-xs">
        {/* Contact List */}
        <div className="w-full md:w-80 border-r border-slate-200 flex flex-col bg-slate-50/50">
          <div className="p-3 border-b border-slate-200 bg-white">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search staff, parents, teachers..."
                value={searchContact}
                onChange={e => setSearchContact(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredContacts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No contacts available.</div>
            ) : (
              filteredContacts.map(c => {
                const isSelected = selectedContact?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedContact(c)}
                    className={`p-3 cursor-pointer transition-colors flex items-center gap-3 ${
                      isSelected ? 'bg-teal-50 border-l-4 border-l-[#0F766E]' : 'hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                      {c.fullName.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-900 truncate">{c.fullName}</span>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-slate-500">{c.role}</span>
                    </div>
                    {messages.some(message => message.senderId === c.id && message.recipientId === user?.id && !message.isRead) && <span className="min-w-5 h-5 px-1 rounded-full bg-teal-700 text-white text-[10px] flex items-center justify-center">{messages.filter(message => message.senderId === c.id && message.recipientId === user?.id && !message.isRead).length}</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 flex flex-col bg-white">
          {selectedContact ? (
            <>
              {/* Thread Header */}
              <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-teal-100 text-[#0F766E] flex items-center justify-center font-bold text-xs uppercase">
                    {selectedContact.fullName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">{selectedContact.fullName}</h3>
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">
                      {selectedContact.role} • {selectedContact.email || selectedContact.phone}
                    </p>
                  </div>
                </div>
              </div>

              {/* Chat history */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#F8FAFC]">
                {activeThread.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                    <MessageSquare className="w-8 h-8 mb-2 text-slate-300" />
                    <span>No messages yet. Send a greeting or notice below.</span>
                  </div>
                ) : (
                  activeThread.map(m => {
                    const isMe = m.senderId === user?.id;
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[75%] p-3 rounded-xl text-xs ${
                            isMe
                              ? 'bg-[#0F766E] text-white rounded-br-xs'
                              : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs shadow-2xs'
                          }`}
                        >
                          <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400 px-1">
                          <span>
                            {new Date(m.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          {isMe && <CheckCheck className="w-3 h-3 text-teal-600" />}
                        </div>
                      </div>
                    );
                  })
                )}
                <PaginationControls info={pageInfo} onPage={setPage} />
              </div>

              {/* Chat Input */}
              <form
                onSubmit={handleSendMessage}
                className="p-3 border-t border-slate-200 bg-white flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder={`Write message to ${selectedContact.fullName}...`}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <span>Send</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
              Select a conversation to start messaging.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
