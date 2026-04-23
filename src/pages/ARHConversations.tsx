/**
 * ARHConversations — CLINIcare Intra-System Conversation Hub
 * Inbox of threads + real-time-style chat panel.
 * Reads/writes only to arh_threads, arh_messages, arh_notifications.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Zap, ArrowLeft, MessageSquare, Send, X, CheckCheck,
  Clock, Circle, Home, Bell, BellOff, Search, ChevronRight
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { getAuthSession, fetchWithAuth } from '../lib/authSession';

interface Thread {
  id: string; subject: string; status: string;
  requester_user_id: string; requester_name: string;
  primary_contact_user_id: string; contact_name: string;
  category_name: string; category_color: string;
  message_count: number; unread_count: number;
  updated_at: string; created_at: string;
}

interface Message {
  id: string; thread_id: string; sender_id: string;
  sender_name: string; sender_photo: string;
  body: string; is_system: boolean; sent_at: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Avatar({ name, photo, size = 'md' }: { name: string; photo?: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'w-10 h-10 text-xs' : size === 'lg' ? 'w-16 h-16 text-lg' : 'w-12 h-12 text-sm';
  if (photo) return <img src={photo} className={cn(s, 'rounded-2xl object-cover border-2 border-white/20 shrink-0')} alt={name} />;
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <div className={cn(s, 'rounded-2xl bg-gradient-to-br from-[#2960DC] to-[#1a3fa0] flex items-center justify-center font-bold text-white shrink-0')}>
      {initials}
    </div>
  );
}

export function ARHConversations() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const session = getAuthSession();
  const userId = session?.userId || '';

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<(Thread & { messages: Message[] }) | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThreads = async () => {
    setLoadingThreads(true);
    try {
      const data = await fetchWithAuth(`/api/arh/conversations?userId=${userId}`).then(r => r.json());
      setThreads(data || []);
    } finally { setLoadingThreads(false); }
  };

  const loadNotifications = async () => {
    const data = await fetchWithAuth(`/api/arh/notifications?userId=${userId}`).then(r => r.json()).catch(() => []);
    setNotifications(data || []);
  };

  const openThread = async (threadId: string) => {
    setLoadingChat(true);
    try {
      const data = await fetchWithAuth(`/api/arh/conversations/${threadId}`).then(r => r.json());
      setActiveThread(data);
      // Mark notifications read for this thread
      await fetchWithAuth('/api/arh/notifications/mark-read', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      loadNotifications();
    } finally {
      setLoadingChat(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const sendReply = async () => {
    if (!reply.trim() || !activeThread) return;
    setSending(true);
    try {
      await fetchWithAuth(`/api/arh/conversations/${activeThread.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: userId, body: reply.trim() })
      });
      setReply('');
      await openThread(activeThread.id);
      loadThreads();
    } finally { setSending(false); }
  };

  useEffect(() => {
    loadThreads();
    loadNotifications();
    // Open thread from URL param
    const tid = searchParams.get('thread');
    if (tid) setTimeout(() => openThread(tid), 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages]);

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const filtered = threads.filter(t =>
    t.subject.toLowerCase().includes(search.toLowerCase()) ||
    t.requester_name?.toLowerCase().includes(search.toLowerCase()) ||
    t.contact_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* ── Header ── */}
      <header className="bg-[#2960DC] px-6 py-4 flex items-center gap-4 shrink-0 shadow-xl z-50">
        <button onClick={() => navigate('/action-hub')} className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-white">CLINIcare Conversations</h1>
          <p className="text-xs text-blue-200 mt-0.5">Intra-system communication channel</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Notifications bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(v => !v)}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors relative"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifs && (
              <div className="absolute right-0 top-10 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 z-[100] max-h-80 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Notifications</p>
                  <button onClick={() => setShowNotifs(false)} className="p-1 rounded text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-slate-400 text-sm">No notifications yet</div>
                ) : notifications.slice(0, 10).map(n => (
                  <button key={n.id} onClick={() => { openThread(n.thread_id); setShowNotifs(false); }}
                    className={cn('w-full text-left px-4 py-3 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors', !n.is_read && 'bg-blue-50/50 dark:bg-blue-900/10')}>
                    <div className="flex items-start gap-2.5">
                      {!n.is_read && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{n.thread_subject}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.preview}</p>
                        <p className="text-[9px] text-slate-300 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Navigate to master */}
          <button onClick={() => navigate('/')} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors">
            <Home className="w-4 h-4" /> Master Portal
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Thread List Sidebar ── */}
        <aside className={cn(
          'flex flex-col border-r border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 transition-all',
          activeThread ? 'w-[360px] hidden md:flex' : 'w-full md:w-[420px]'
        )}>
          {/* Search */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text" placeholder="Search conversations…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#2960DC]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingThreads ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <div className="w-5 h-5 border-2 border-[#2960DC] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 px-4 text-slate-400">
                <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-semibold">No conversations yet</p>
                <p className="text-xs mt-1">Start one from the ARH results page.</p>
              </div>
            ) : filtered.map(t => {
              const isMe = t.requester_user_id === userId;
              const otherName = isMe ? t.contact_name : t.requester_name;
              const isActive = activeThread?.id === t.id;
              return (
                <button key={t.id} onClick={() => openThread(t.id)}
                  className={cn(
                    'w-full text-left px-5 py-4 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors',
                    isActive && 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-[#2960DC]',
                    t.unread_count > 0 && !isActive && 'bg-blue-50/30 dark:bg-blue-900/10'
                  )}>
                  <div className="flex items-start gap-4">
                    <Avatar name={otherName || '?'} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className={cn('text-sm font-bold truncate', t.unread_count > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300')}>
                          {t.subject}
                        </p>
                        {t.unread_count > 0 && (
                          <span className="shrink-0 w-5 h-5 rounded-full bg-[#2960DC] text-white text-[10px] font-extrabold flex items-center justify-center">
                            {t.unread_count}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{otherName}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {t.category_name && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                            style={{ color: t.category_color, borderColor: t.category_color + '40', background: t.category_color + '15' }}>
                            {t.category_name}
                          </span>
                        )}
                        <span className={cn('text-[10px] font-semibold ml-auto', t.status === 'Closed' ? 'text-slate-300' : 'text-slate-400')}>
                          {timeAgo(t.updated_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Chat Panel ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!activeThread ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <MessageSquare className="w-14 h-14 mx-auto mb-4 opacity-20" />
                <p className="font-semibold text-base">Select a conversation</p>
                <p className="text-sm mt-1">or start one from the Action Routing Hub results.</p>
                <button onClick={() => navigate('/action-hub')}
                  className="mt-6 flex items-center gap-2 mx-auto px-5 py-2.5 bg-[#2960DC] text-white font-bold rounded-xl text-sm hover:bg-[#1a4bb3] transition-colors shadow-sm">
                  <Zap className="w-4 h-4" /> Open Action Hub
                </button>
              </div>
            </div>
          ) : loadingChat ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-[#2960DC] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center gap-4 shrink-0">
                <button onClick={() => setActiveThread(null)} className="p-2 md:hidden rounded-xl text-slate-500 hover:bg-slate-100">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 dark:text-white text-lg truncate">{activeThread.subject}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    {activeThread.messages?.length || 0} message{activeThread.messages?.length !== 1 ? 's' : ''}
                    {activeThread.category_name && ` · ${activeThread.category_name}`}
                  </p>
                </div>
                {activeThread.status === 'Open' && (
                  <button
                    onClick={async () => {
                      await fetchWithAuth(`/api/arh/conversations/${activeThread.id}/close`, { method: 'PATCH' });
                      setActiveThread(t => t ? { ...t, status: 'Closed' } : null);
                      loadThreads();
                    }}
                    className="px-3 py-1.5 text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-500 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Close Thread
                  </button>
                )}
                {activeThread.status === 'Closed' && (
                  <span className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-400 rounded-full border border-slate-200">
                    Closed
                  </span>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-slate-50 dark:bg-slate-900/50">
                {(activeThread.messages || []).length === 0 && (
                  <div className="text-center py-10 text-slate-400 text-base">No messages yet. Send the first one.</div>
                )}
                {(activeThread.messages || []).map(msg => {
                  const isMine = msg.sender_id === userId;
                  return (
                    <div key={msg.id} className={cn('flex items-end gap-3', isMine ? 'flex-row-reverse' : 'flex-row')}>
                      {!isMine && <Avatar name={msg.sender_name || '?'} size="sm" />}
                      <div className={cn(
                        'max-w-[70%] px-5 py-3.5 rounded-2xl text-base shadow-sm',
                        isMine
                          ? 'bg-[#2960DC] text-white rounded-br-sm'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-sm'
                      )}>
                        {!isMine && (
                          <p className="text-[11px] font-bold uppercase tracking-widest mb-1.5 opacity-60">{msg.sender_name}</p>
                        )}
                        <p className="leading-relaxed">{msg.body}</p>
                        <p className={cn('text-[10px] mt-1.5 text-right', isMine ? 'text-blue-200' : 'text-slate-400')}>
                          {new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {isMine && <CheckCheck className="w-3.5 h-3.5 inline ml-1.5 opacity-70" />}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Compose */}
              {activeThread.status === 'Open' ? (
                <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-4 shrink-0">
                  <div className="flex items-end gap-4">
                    <textarea
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendReply(); }}
                      placeholder="Type a message… (Ctrl+Enter to send)"
                      rows={2}
                      className="flex-1 resize-none px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-base text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-[#2960DC] placeholder-slate-400"
                    />
                    <button onClick={sendReply} disabled={!reply.trim() || sending}
                      className="w-12 h-12 rounded-2xl bg-[#2960DC] text-white flex items-center justify-center hover:bg-[#1a4bb3] disabled:opacity-40 transition-all shadow-sm shrink-0">
                      {sending ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-6 py-4 shrink-0 text-center text-sm text-slate-400 font-semibold">
                  This conversation is closed.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
