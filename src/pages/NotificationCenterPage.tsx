import React, { useState, useEffect, useMemo } from 'react';
import { Bell, Settings, BellOff, ArrowUpCircle, Check, X, ShieldAlert, Activity, MessageSquare } from 'lucide-react';
import { fetchWithAuth, getAuthSession } from '../lib/authSession';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
interface Notification {
  id: string;
  user_id: string;
  sender_id: string;
  sender_name: string;
  type: string;
  module_id: string | null;
  thread_id: string | null;
  thread_subject: string | null;
  preview: string;
  is_read: boolean;
  created_at: string;
}

interface UserSettings {
  muted_module_ids: string[];
  high_priority_module_ids: string[];
}

export const NotificationCenterPage = () => {
  const session = getAuthSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [modules, setModules] = useState<{ id: string; title: string; icon: string }[]>([]);
  const [settings, setSettings] = useState<UserSettings>({ muted_module_ids: [], high_priority_module_ids: [] });
  const [activeTab, setActiveTab] = useState<string>('All');
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    if (!session?.userId) return;
    try {
      setIsLoading(true);
      const [notifsRes, modsRes, settsRes] = await Promise.all([
        fetchWithAuth(`/api/arh/notifications?userId=${session.userId}`),
        fetchWithAuth(`/api/config/modules_tree`),
        fetchWithAuth(`/api/arh/notifications/settings?userId=${session.userId}`)
      ]);
      if (notifsRes.ok) setNotifications(await notifsRes.json());
      if (modsRes.ok) {
        const treeData = await modsRes.json();
        const tree = treeData.value || [];
        const flat: any[] = [];
        const flatten = (nodes: any[]) => {
          for (let n of nodes) {
            flat.push(n);
            if (n.submodules) flatten(n.submodules);
          }
        };
        flatten(tree);
        setModules(flat);
      }
      if (settsRes.ok) setSettings(await settsRes.json());
    } catch(e) {
      console.error("Failed to load notification center", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [session?.userId]);

  const toggleSetting = async (moduleId: string, type: 'mute' | 'priority') => {
    const s = { ...settings };
    if (type === 'mute') {
      if (s.muted_module_ids.includes(moduleId)) s.muted_module_ids = s.muted_module_ids.filter(id => id !== moduleId);
      else {
        s.muted_module_ids.push(moduleId);
        s.high_priority_module_ids = s.high_priority_module_ids.filter(id => id !== moduleId); // can't be both
      }
    } else {
      if (s.high_priority_module_ids.includes(moduleId)) s.high_priority_module_ids = s.high_priority_module_ids.filter(id => id !== moduleId);
      else {
        s.high_priority_module_ids.push(moduleId);
        s.muted_module_ids = s.muted_module_ids.filter(id => id !== moduleId); // can't be both
      }
    }
    setSettings(s);
    // sync to backend
    await fetchWithAuth('/api/arh/notifications/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: session?.userId, mutedModuleIds: s.muted_module_ids, highPriorityModuleIds: s.high_priority_module_ids })
    });
    // Let global widget refresh
    document.dispatchEvent(new CustomEvent('toggle-global-notifications'));
  };

  const markAsRead = async (id: string) => {
    await fetchWithAuth(`/api/arh/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    document.dispatchEvent(new CustomEvent('toggle-global-notifications'));
  };

  // Grouping logic
  const moduleTabs = useMemo(() => {
    const tabs: { id: string; label: string; count: number }[] = [
      { id: 'All', label: 'All Notifications', count: notifications.filter(n => !n.is_read).length },
      { id: 'messages', label: 'Direct Messages', count: notifications.filter(n => n.thread_id && !n.is_read).length },
      { id: 'system', label: 'System / General', count: notifications.filter(n => !n.module_id && !n.thread_id && !n.is_read).length }
    ];
    modules.forEach(m => {
      const ms = notifications.filter(n => n.module_id === m.id && !n.thread_id);
      if (ms.length > 0 || settings.muted_module_ids.includes(m.id) || settings.high_priority_module_ids.includes(m.id)) {
         tabs.push({ id: m.id, label: m.title, count: ms.filter(n => !n.is_read).length });
      }
    });
    return tabs;
  }, [notifications, modules, settings]);

  const filteredNotifications = useMemo(() => {
    let list = notifications.filter(n => 
      activeTab === 'All' ? true : 
      activeTab === 'messages' ? !!n.thread_id :
      activeTab === 'system' ? (!n.module_id && !n.thread_id) : 
      (n.module_id === activeTab && !n.thread_id)
    );
    
    // Sort by priority first if in 'All' tab, then created_at
    if (activeTab === 'All') {
      list.sort((a, b) => {
        const aPri = a.module_id && settings.high_priority_module_ids.includes(a.module_id);
        const bPri = b.module_id && settings.high_priority_module_ids.includes(b.module_id);
        if (aPri && !bPri) return -1;
        if (!aPri && bPri) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    return list;
  }, [notifications, activeTab, settings]);

  const navigate = useNavigate();

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-[#0B1120]">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
               <Bell className="w-4 h-4"/>
            </div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">Notification Center</h1>
          </div>
        </div>
      </header>
      
      <div className="flex-1 overflow-hidden flex max-w-6xl w-full mx-auto p-4 gap-6">
        
        {/* Sidebar / Tabs */}
        <div className="w-64 shrink-0 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm pb-4">
           <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 rounded-t-xl">
             <h2 className="font-bold text-slate-800 dark:text-slate-200">Categories</h2>
             <button onClick={() => setShowSettings(true)} className="p-1.5 hover:bg-slate-200 rounded-md text-slate-500 transition-colors" title="Settings">
               <Settings className="w-4 h-4" />
             </button>
           </div>
           <div className="flex-1 overflow-y-auto p-2 space-y-1">
             {moduleTabs.map(tab => (
               <button 
                 key={tab.id}
                 onClick={() => setActiveTab(tab.id)}
                 className={cn(
                   "w-full text-left flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors",
                   activeTab === tab.id ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-50"
                 )}
               >
                 <span className="truncate pr-2">{tab.label}</span>
                 {tab.count > 0 && <span className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold", activeTab === tab.id ? "bg-blue-200/50 text-blue-800" : "bg-slate-100 text-slate-500")}>{tab.count}</span>}
               </button>
             ))}
           </div>
        </div>

        {/* Main List */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
           <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
             <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
               {moduleTabs.find(t => t.id === activeTab)?.label}
             </h2>
             <span className="text-sm text-slate-500">{filteredNotifications.length} Notifications</span>
           </div>
           
           <div className="flex-1 overflow-y-auto p-4 space-y-3">
             {isLoading ? (
               <div className="text-center p-8 text-slate-400">Loading notifications...</div>
             ) : filteredNotifications.length === 0 ? (
               <div className="text-center p-12 text-slate-400">
                  <Bell className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>You have no notifications in this category.</p>
               </div>
             ) : (
               filteredNotifications.map(n => {
                 const isPriority = n.module_id && settings.high_priority_module_ids.includes(n.module_id);
                 const isMuted = n.module_id && settings.muted_module_ids.includes(n.module_id);
                 return (
                   <div key={n.id} 
                     onClick={() => {
                        if (n.thread_id) navigate(`/action-hub/conversations?threadId=${n.thread_id}`);
                     }}
                     className={cn(
                     "relative p-4 rounded-xl border flex gap-4 transition-all group",
                     n.thread_id ? "cursor-pointer hover:shadow-md" : "",
                     !n.is_read ? "bg-blue-50/50 border-blue-200 shadow-sm" : "bg-white border-slate-200 opacity-80",
                     isPriority ? "border-amber-300 bg-amber-50/30" : ""
                   )}>
                     {!n.is_read && <div className={cn("absolute top-5 left-3 w-2 h-2 rounded-full", isPriority ? "bg-amber-500" : "bg-blue-500")} />}
                     
                     <div className="w-10 h-10 rounded-full border bg-slate-50 flex items-center justify-center shrink-0 ml-2">
                       {n.type === 'cdss_alarm' ? <ShieldAlert className="w-5 h-5 text-rose-500" /> :
                        n.type === 'clinical_inquiry' ? <Activity className="w-5 h-5 text-indigo-500" /> :
                        <MessageSquare className="w-5 h-5 text-slate-400" />}
                     </div>
                     
                     <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between mb-1">
                          <h4 className={cn("text-sm truncate pr-2", !n.is_read ? "font-bold text-slate-900" : "font-semibold text-slate-700")}>
                            {n.thread_subject || 'System Notification'}
                          </h4>
                          <span className="text-[11px] font-medium text-slate-400 shrink-0 mt-0.5">
                            {new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 line-clamp-2">
                           {n.sender_name && <span className="font-semibold text-slate-800 mr-1">{n.sender_name}:</span>}
                           {n.preview}
                        </p>
                        
                        <div className="flex items-center gap-2 mt-2">
                          {n.module_id && (
                             <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md">
                               {modules.find(m => m.id === n.module_id)?.title || 'Unknown Module'}
                             </span>
                          )}
                          {isPriority && (
                             <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md flex items-center gap-1">
                               <ArrowUpCircle className="w-3 h-3"/> High Priority
                             </span>
                          )}
                          {isMuted && (
                             <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 text-slate-400 rounded-md flex items-center gap-1">
                               <BellOff className="w-3 h-3"/> Muted
                             </span>
                          )}
                        </div>
                     </div>
                     
                     {!n.is_read && (
                       <button onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }} className="absolute right-4 bottom-4 p-2 bg-slate-100 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all font-semibold text-[11px] flex items-center gap-1">
                         <Check className="w-3 h-3"/> Mark Read
                       </button>
                     )}
                   </div>
                 );
               })
             )}
           </div>
        </div>

        {/* Settings Modal overlay */}
        {showSettings && (
          <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold flex items-center gap-2"><Settings className="w-5 h-5 text-blue-600"/> Notification Preferences</h3>
                <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-slate-200 rounded text-slate-500"><X className="w-5 h-5"/></button>
              </div>
              <div className="overflow-y-auto p-4 space-y-4">
                <p className="text-sm text-slate-500">Customize how notifications from each module are handled. Muted modules will not increment your unread badge or show popups, but will still appear in this center. High Priority will push them to the top.</p>
                
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-2 text-[10px] font-bold uppercase text-slate-400">
                    <div>Module Category</div>
                    <div className="text-center">Mute</div>
                    <div className="text-center">Priority</div>
                  </div>
                  
                  {[...modules].map(m => {
                    const isMuted = settings.muted_module_ids.includes(m.id);
                    const isPri = settings.high_priority_module_ids.includes(m.id);
                    return (
                      <div key={m.id} className="grid grid-cols-[1fr_80px_80px] items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="font-semibold text-sm text-slate-800">{m.title}</div>
                        <button onClick={() => toggleSetting(m.id, 'mute')} className={cn("h-8 rounded-lg flex items-center justify-center transition-colors border", isMuted ? "bg-slate-200 border-slate-300 text-slate-600" : "bg-white border-slate-200 text-slate-300 hover:text-slate-500")}>
                           <BellOff className="w-4 h-4"/>
                        </button>
                        <button onClick={() => toggleSetting(m.id, 'priority')} className={cn("h-8 rounded-lg flex items-center justify-center transition-colors border", isPri ? "bg-amber-100 border-amber-300 text-amber-600" : "bg-white border-slate-200 text-slate-300 hover:text-amber-500")}>
                           <ArrowUpCircle className="w-4 h-4"/>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
