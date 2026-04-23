import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MessageSquare, ShieldAlert, ClipboardCheck, X, Check, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { getAuthSession, fetchWithAuth } from '../lib/authSession';

type NotificationItem = {
  id: string;
  type: string;
  sender_name?: string;
  thread_id?: string;
  thread_subject?: string;
  preview?: string;
  is_read: boolean;
  created_at: string;
};

export function GlobalNotificationWidget() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('');
  
  // Dragging state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const initialPosition = useRef({ x: 0, y: 0 });
  
  const session = getAuthSession();
  const navigate = useNavigate();
  const widgetRef = useRef<HTMLDivElement>(null);

  // Poll for full notifications
  useEffect(() => {
    if (!session?.userId) return;
    const fetchNotifs = () => {
      fetchWithAuth(`/api/arh/notifications?userId=${session.userId}`)
        .then(r => r.ok ? r.json() : Promise.resolve([]))
        .then(d => setNotifications(d || []))
        .catch(() => {});
    };
    fetchNotifs();
    const iv = setInterval(fetchNotifs, 10000); // Poll every 10s
    return () => clearInterval(iv);
  }, [session?.userId]);

  // Click away listener and toggle event
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleToggle = () => setIsOpen(prev => !prev);
    
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('toggle-global-notifications', handleToggle);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('toggle-global-notifications', handleToggle);
    };
  }, [isOpen]);

  // Auto-select first available tab when popover opens or notifications change
  useEffect(() => {
    if (!isOpen) return;
    const keys = Object.keys(
      notifications.reduce<Record<string, boolean>>((acc, n) => {
        acc[n.type in { new_message:1, cdss_alarm:1, approval_request:1 } ? n.type : 'default'] = true;
        return acc;
      }, {})
    );
    if (keys.length > 0 && (!activeCategory || !keys.includes(activeCategory))) {
      setActiveCategory(keys[0]);
    }
  }, [isOpen, notifications]);

  if (!session) return null;

  const totalUnread = notifications.filter(n => !n.is_read).length;

  // Grouping configuration
  const CATEGORY_MAP: Record<string, { label: string; icon: any; color: string; bg: string }> = {
    'new_message': { label: 'Conversations', icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
    'cdss_alarm': { label: 'Clinical Alerts', icon: ShieldAlert, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' },
    'approval_request': { label: 'Approvals', icon: ClipboardCheck, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
    'default': { label: 'System', icon: Bell, color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200' }
  };

  // Process and group notifications
  const groups: Record<string, NotificationItem[]> = {};
  notifications.forEach(n => {
    const key = CATEGORY_MAP[n.type] ? n.type : 'default';
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  });

  // Only show tabs for groups that actually have notifications
  const activeKeys = Object.keys(groups);

  const markAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await fetchWithAuth(`/api/arh/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await fetchWithAuth('/api/arh/notifications/mark-read', { method: 'PATCH' });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {}
  };

  const handleNotificationClick = (notif: NotificationItem) => {
    if (!notif.is_read) markAsRead(notif.id);
    setIsOpen(false);
    
    // Routing logic based on type
    if (notif.thread_id) {
      navigate(`/action-hub/conversations?threadId=${notif.thread_id}`);
    } else if (notif.type === 'approval_request') {
      navigate(`/action-hub/results`);
    } else {
      // Default fallback
      navigate(`/notifications`);
    }
  };

  const activeNotifications = groups[activeCategory] || [];

  // Drag Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only left click drag
    
    dragStart.current = { x: e.clientX, y: e.clientY };
    initialPosition.current = { ...position };
    let hasDragged = false;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - dragStart.current.x;
      const dy = ev.clientY - dragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasDragged = true;
        setIsDragging(true);
      }
      setPosition({ x: initialPosition.current.x + dx, y: initialPosition.current.y + dy });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      // Give onClick time to read the dragging state before resetting
      if (hasDragged) {
         setTimeout(() => setIsDragging(false), 50);
      } else {
         setIsDragging(false);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div 
      ref={widgetRef} 
      className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3 pointer-events-none"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      
      {/* ── FLYOUT WINDOW ── */}
      {isOpen && (
        <div className="pointer-events-auto w-[380px] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 fade-in origin-bottom-right duration-200 mb-2">
          
          {/* Header */}
          <div className="px-5 py-4 bg-[#2960DC] text-white flex justify-between items-center shrink-0 rounded-t-3xl">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-white/20 rounded-lg">
                <Bell className="w-4 h-4 text-white" />
              </div>
              <h3 className="font-extrabold text-[15px]">Notification Center</h3>
            </div>
            <div className="flex items-center gap-2">
              {totalUnread > 0 && (
                <button onClick={markAllRead} className="text-[10px] uppercase font-bold tracking-wider text-blue-100 hover:text-white transition-colors bg-black/10 hover:bg-black/20 px-2 py-1 rounded">
                  Mark all read
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="text-blue-200 hover:text-white p-1 rounded-full hover:bg-black/10 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Category Tabs */}
          {activeKeys.length > 0 ? (
            <>
              <div className="flex overflow-x-auto hide-scrollbar bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 p-2 gap-2 shrink-0">
                {activeKeys.map(key => {
                  const cat = CATEGORY_MAP[key] || CATEGORY_MAP['default'];
                  const Icon = cat.icon;
                  const unreadInCat = groups[key].filter(n => !n.is_read).length;
                  const isActive = activeCategory === key;

                  return (
                    <button
                      key={key}
                      onClick={() => setActiveCategory(key)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 border",
                        isActive 
                          ? cn("bg-white dark:bg-slate-700 shadow-sm", cat.color, "border-slate-200 dark:border-slate-600") 
                          : "bg-transparent text-slate-500 border-transparent hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {cat.label}
                      {unreadInCat > 0 && (
                        <span className={cn("px-1.5 py-0.5 rounded-md text-[9px] text-white", isActive ? "bg-[#2960DC]" : "bg-slate-400")}>
                          {unreadInCat}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Notification List Scroll Area */}
              <div className="flex-1 overflow-y-auto max-h-[400px] p-2 space-y-2 bg-slate-50/50 dark:bg-slate-900/50">
                {activeNotifications.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm">No notifications here.</div>
                ) : (
                  activeNotifications.map(notif => {
                    const cat = CATEGORY_MAP[notif.type] || CATEGORY_MAP['default'];
                    const Icon = cat.icon;
                    return (
                      <div 
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={cn(
                          "relative p-3.5 rounded-2xl border transition-all cursor-pointer group flex gap-3",
                          !notif.is_read 
                            ? "bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-900/50 shadow-sm hover:border-[#2960DC]/40 hover:shadow" 
                            : "bg-transparent border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800 opacity-70 hover:opacity-100"
                        )}
                      >
                        {/* Status dot */}
                        {!notif.is_read && <div className="absolute top-4 left-3 w-1.5 h-1.5 rounded-full bg-[#2960DC] shadow-[0_0_8px_rgba(41,96,220,0.6)]" />}

                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 ml-2 border", cat.bg)}>
                          <Icon className={cn("w-4 h-4", cat.color)} />
                        </div>

                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex justify-between items-start mb-1">
                            <p className={cn("text-[13px] leading-tight truncate pr-2", !notif.is_read ? "font-bold text-slate-800 dark:text-slate-100" : "font-semibold text-slate-600 dark:text-slate-300")}>
                              {notif.thread_subject || cat.label}
                            </p>
                            <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap shrink-0 mt-0.5">
                              {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(notif.created_at))}
                            </span>
                          </div>
                          
                          {(notif.sender_name || notif.preview) && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                              {notif.sender_name && <span className="font-semibold text-slate-700 dark:text-slate-300 mr-1">{notif.sender_name}:</span>}
                              {notif.preview}
                            </p>
                          )}
                        </div>

                        {/* Quick Action overlay on hover */}
                        {!notif.is_read && (
                          <button 
                            onClick={(e) => markAsRead(notif.id, e)}
                            title="Mark as read"
                            className="absolute bottom-2 right-3 p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-400 hover:text-[#2960DC] hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="flex bg-slate-50 dark:bg-slate-900/50 flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-slate-300 dark:text-slate-600" />
              </div>
              <p className="text-slate-800 dark:text-slate-200 font-extrabold text-sm relative z-10">You're all caught up!</p>
              <p className="text-slate-500 text-xs mt-1 max-w-[220px]">You have no active notifications or pending approvals.</p>
            </div>
          )}
        </div>
      )}

      {/* ── NOTIFICATION BELL BUTTON ── */}
      <button
        onPointerDown={handlePointerDown}
        onClick={() => { if (!isDragging) setIsOpen(!isOpen); }}
        onDoubleClick={() => { if (!isDragging) navigate('/notifications'); }}
        title="Open Notification Center"
        className={cn(
          "pointer-events-auto flex items-center justify-center w-14 h-14 rounded-full shadow-xl transition-all hover:scale-105 group relative border",
          isDragging ? "cursor-grabbing duration-0" : "cursor-pointer duration-300 active:scale-95",
          isOpen ? "bg-[#2960DC] border-[#2960DC] text-white shadow-2xl" :
          totalUnread > 0 
            ? "bg-red-500 hover:bg-red-600 border-transparent text-white" 
            : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-300"
        )}
      >
        {isOpen ? (
          <X className="w-6 h-6 animate-in spin-in-90 duration-200 text-white" />
        ) : (
          <Bell className={cn("w-6 h-6", totalUnread > 0 ? "animate-pulse" : "")} />
        )}
        
        {!isOpen && totalUnread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[24px] h-[24px] px-1 rounded-full bg-[#2960DC] border-2 border-white text-white text-[10px] font-extrabold flex items-center justify-center shadow-md animate-in zoom-in-50">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>
    </div>
  );
}
