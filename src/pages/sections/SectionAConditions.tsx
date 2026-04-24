import { useState, useEffect, useCallback } from "react";
import { fetchWithAuth } from '../../lib/authSession';
import { Plus, Search, CheckCircle2, XCircle, Clock, AlertTriangle, ArrowLeft, Trash2, Edit2, ChevronDown, ChevronRight, FileText, Activity, Server, User, MapPin, Shield, Briefcase, MessageSquare, Phone, Mail } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { SnomedBrowser } from "../SnomedBrowser";
import { getAuthSession } from '../../lib/authSession';

const TimelineLogItem = ({ log, logViewTab, flyoutCondition, patientId }: any) => {
  const [showMetadata, setShowMetadata] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState('');
  const [isNotifying, setIsNotifying] = useState(false);
  const [notifySuccess, setNotifySuccess] = useState(false);
  const [showTicketBox, setShowTicketBox] = useState(false);

  const sysDateStr = log.system_date ? new Date(log.system_date).toLocaleString() : new Date(log.date).toLocaleString();
  const userStr = (log.user && typeof log.user === 'string') ? log.user : 'Clinician';
  const roleMatch = userStr.match(/\(([^)]+)\)/);
  const uRole = roleMatch ? roleMatch[1] : 'Clinician';
  const uName = roleMatch ? userStr.split(' (')[0] : userStr;

  const handleProfileClick = useCallback(async () => {
    if (uName === 'Clinician' || uName === 'System') return;
    if (showProfile) { setShowProfile(false); return; }
    setShowProfile(true);
    if (profileData) return; // already fetched
    setIsLoadingProfile(true);
    try {
      const res = await fetchWithAuth(`/api/users/profile-by-name/${encodeURIComponent(uName)}`);
      if (res.ok) {
        setProfileData(await res.json());
      }
    } catch { /* silent fail */ }
    setIsLoadingProfile(false);
  }, [uName, showProfile, profileData]);

  return (
    <div className="relative pl-8">
      <div className={cn("absolute left-0 top-1 w-[24px] h-[24px] border-[3px] border-white rounded-full z-10 flex items-center justify-center", logViewTab === 'chronological' ? "bg-indigo-50" : "bg-slate-100")}>
        {logViewTab === 'chronological' ? (
           <div className={cn("w-2 h-2 rounded-full scale-125", 
              log.severity === "Severe" ? "bg-red-500" :
              log.severity === "Moderate" ? "bg-orange-500" :
              log.severity === "Mild" ? "bg-blue-500" :
              "bg-slate-400"
           )} />
        ) : (
           <div className={cn("w-2 h-2 rounded-full", log.isOnset ? "bg-indigo-600 scale-125" : log.action?.includes('Active') ? "bg-emerald-500" : log.action?.includes('Deactivate') ? "bg-amber-500" : "bg-blue-500")} />
        )}
      </div>
      <div className="text-[10px] text-slate-400 mb-0.5 flex items-center gap-1.5">
        {logViewTab === 'chronological' ? new Date(log.date).toLocaleString([], { dateStyle: 'medium'}) : sysDateStr}
        {!log.isOnset && (
          <button onClick={() => setShowMetadata(!showMetadata)} className="text-blue-500 hover:text-blue-700 hover:bg-blue-100 bg-blue-50 w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px] transition-colors" title="View Source Metadata">!</button>
        )}
      </div>
      {showMetadata && (
        <div className="mt-1.5 mb-2.5 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-600 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700">Account:</span>
            {uName !== 'Clinician' && uName !== 'System' ? (
              <button
                onClick={handleProfileClick}
                className="text-blue-600 hover:text-blue-800 font-medium hover:underline cursor-pointer transition-colors flex items-center gap-1"
              >
                <User className="w-3 h-3" /> {uName}
              </button>
            ) : (
              <span>{uName}</span>
            )}
          </div>

          <div className="flex items-center justify-between"><span className="font-semibold text-slate-700">System Log Time:</span> <span>{sysDateStr}</span></div>

          {/* User Profile Card */}
          {showProfile && (
            <div className="mt-2 border-t border-slate-200 pt-3">
              {isLoadingProfile ? (
                <div className="flex items-center gap-2 py-3 justify-center text-slate-400">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span>Loading profile...</span>
                </div>
              ) : profileData ? (
                <div className="bg-gradient-to-br from-blue-50 via-indigo-50/50 to-slate-50 border border-blue-100 rounded-xl p-3.5 space-y-3 shadow-sm">
                  {/* Header */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md shrink-0">
                      {profileData.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col min-w-0">
                          <div className="text-sm font-bold text-slate-900 leading-tight truncate">{profileData.fullName}</div>
                          <div className="text-[10px] text-slate-500 truncate">@{profileData.loginId}</div>
                        </div>
                        {uName !== 'System' && (
                          <div className="flex items-center gap-1.5 ml-2 relative">
                            <a href={`mailto:${profileData.loginId}@clinicare.com`} title="Email" className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"><Mail className="w-3.5 h-3.5"/></a>
                            <a href={`https://wa.me/1234567890`} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="p-1 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded transition-colors"><Phone className="w-3.5 h-3.5"/></a>
                            <button onClick={() => setShowTicketBox(!showTicketBox)} title="Send clinical ticket" className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors relative"><MessageSquare className="w-3.5 h-3.5"/></button>
                            
                            {showTicketBox && (
                               <div className="absolute top-8 right-0 w-[280px] bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-30 animate-in fade-in slide-in-from-top-2">
                                  <h4 className="text-xs font-bold text-slate-800 mb-2">Send clinical ticket</h4>
                                  <textarea 
                                     value={notifyMsg}
                                     onChange={(e) => setNotifyMsg(e.target.value)}
                                     placeholder={`Ask ${uName.split(' ')[0]} a question...`}
                                     className="text-[11px] p-2 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full resize-none h-[4rem] bg-slate-50 text-slate-700"
                                  />
                                  <div className="flex justify-end gap-2 mt-2">
                                     <button 
                                        onClick={() => setShowTicketBox(false)}
                                        className="text-[10px] px-2 py-1 text-slate-500 hover:bg-slate-100 rounded transition-colors"
                                     >
                                        Cancel
                                     </button>
                                     <button 
                                        disabled={!notifyMsg.trim() || isNotifying}
                                        onClick={async () => {
                                           if (!notifyMsg.trim() || !profileData?.id) return;
                                           setIsNotifying(true);
                                           try {
                                             const session = getAuthSession();
                                             await fetchWithAuth('/api/arh/conversations', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                   requesterId: session?.userId,
                                                   contactUserId: profileData.id,
                                                   subject: `Clinical Inquiry: ${log.condition_term || 'Patient Record'}`,
                                                   moduleId: 'M-MTM',
                                                   initialMessage: notifyMsg
                                                })
                                             });
                                             setNotifySuccess(true);
                                             setNotifyMsg("");
                                             setTimeout(() => {
                                                setNotifySuccess(false);
                                                setShowTicketBox(false);
                                             }, 1500);
                                           } catch (e) {
                                             console.error(e);
                                           } finally {
                                             setIsNotifying(false);
                                           }
                                        }}
                                        className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-3 py-1 rounded disabled:opacity-50 transition-colors shadow-sm"
                                     >
                                       {isNotifying ? "Sending..." : notifySuccess ? "Sent!" : "Send"}
                                     </button>
                                  </div>
                               </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Role */}
                  <div className="flex items-start gap-2">
                    <Shield className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-indigo-800">{profileData.roleName}</div>
                      {profileData.roleDescription && (
                        <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{profileData.roleDescription}</div>
                      )}
                    </div>
                  </div>

                  {/* Sites */}
                  {profileData.sites?.length > 0 && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                      <div className="flex flex-wrap gap-1">
                        {profileData.sites.map((site: string, i: number) => (
                          <span key={i} className="inline-block bg-white border border-emerald-200 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm">{site}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Scope Badge */}
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                      profileData.roleScope === 'Global' ? "bg-purple-100 text-purple-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {profileData.roleScope} Scope
                    </span>
                  </div>

                </div>
              ) : (
                <div className="text-center text-[10px] text-slate-400 italic py-2">Profile not found in the system.</div>
              )}
            </div>
          )}
        </div>
      )}
      {log.condition_term ? (
        <div className="flex flex-col">
          <div className={cn("text-[11px] uppercase mt-0.5", 
             log.condition_code === flyoutCondition?.snomed_code ? "text-blue-600 font-bold" : 
             (logViewTab === 'chronological' ? (
                log.severity === "Severe" ? "text-red-700 font-bold" :
                log.severity === "Moderate" ? "text-orange-700 font-bold" :
                log.severity === "Mild" ? "text-blue-700 font-bold" :
                "font-bold text-slate-400"
             ) : "font-bold text-slate-400")
          )}>
            {log.condition_term}
          </div>
          <div className="text-[13px] font-semibold text-slate-800 leading-tight mt-0.5">{log.action}</div>
          {(logViewTab === 'chronological') && (
             <div className="flex items-center gap-2 mt-2 opacity-90">
               {log.acuity && log.acuity !== "Unknown" && (
                  <span className={cn("px-1.5 py-0.5 rounded text-[9px] uppercase font-bold flex items-center gap-1 border", 
                      log.acuity === 'Acute' ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"
                  )}>
                     <div className={cn("w-1 h-1 rounded-full", log.acuity === 'Acute' ? "bg-red-500" : "bg-blue-500")} /> {log.acuity}
                  </span>
               )}
               {log.severity && log.severity !== "Unknown" && (
                  <span className={cn("px-1.5 py-0.5 rounded text-[9px] uppercase font-bold flex items-center gap-1 border", 
                      log.severity === "Severe" ? "bg-red-50 text-red-700 border-red-200" : 
                      log.severity === "Moderate" ? "bg-orange-50 text-orange-700 border-orange-200" : 
                      log.severity === "Mild" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-50 text-slate-500 border-slate-200"
                  )}>
                     <AlertTriangle className="w-2.5 h-2.5" /> {log.severity}
                  </span>
               )}
             </div>
          )}
        </div>
      ) : (
         <div className="text-[13px] font-semibold text-slate-800 leading-tight">{log.action}</div>
      )}
      {log.note && <div className="text-sm text-slate-600 mt-1 italic whitespace-pre-wrap">"{log.note}"</div>}
    </div>
  );
};

export function SectionAConditions({ patientId, activeSessionId, isHistoricalSession }: { patientId: string, activeSessionId?: string | null, isHistoricalSession?: boolean }) {
  const [activeTab, setActiveTab] = useState("active");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [conditions, setConditions] = useState<any[]>([]);
  const isAdmin = true; // Hardcoded to true for testing, will connect to auth context later

  // Add Workflow States
  const [addStep, setAddStep] = useState<1 | 2>(1);
  const [selectedConcept, setSelectedConcept] = useState<{ conceptId: string, term: string, fsn: string } | null>(null);
  const [editConditionId, setEditConditionId] = useState<string | null>(null);
  const [onsetDate, setOnsetDate] = useState("");
  const [severity, setSeverity] = useState("Moderate");
  const [status, setStatus] = useState("Active");
  const [source, setSource] = useState("SNOMED CT Browser");
  const [acuity, setAcuity] = useState("Unknown");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [severityLocked, setSeverityLocked] = useState(false);
  const [acuityLocked, setAcuityLocked] = useState(false);
  const [flyoutCondition, setFlyoutCondition] = useState<any | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedConditionId, setExpandedConditionId] = useState<string | null>(null);
  const [expandedConditionLogs, setExpandedConditionLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteBody, setNewNoteBody] = useState("");
  const [newNoteDate, setNewNoteDate] = useState(new Date().toISOString().split("T")[0]);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [hierarchyConflict, setHierarchyConflict] = useState<{ type: 'child' | 'parent' | 'sibling', conflictingCodes: string[], conflictingTerms: string, conflictingConditions: any[] } | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [isCheckingHierarchy, setIsCheckingHierarchy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("All");
  const [groupBy, setGroupBy] = useState<"None" | "Severity" | "Source" | "System" | "Tag">("None");
  const [viewLayout, setViewLayout] = useState<"List" | "Kanban">("List");
  const [logViewTab, setLogViewTab] = useState<'chronological' | 'audit'>('chronological');
  
  const getUserIdentity = () => {
    const session = getAuthSession();
    return session ? `${session.fullName} (${session.roleName || session.roleId})` : 'Clinician';
  };
  
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  
  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const toggleAllGroups = (collapse: boolean) => {
    if (!collapse) {
      setCollapsedGroups({});
    } else {
      const generatedGroups = Array.from(new Set(conditions.map(c => {
         if (groupBy === "Severity") return c.severity || "Unknown";
         if (groupBy === "Source") return c.source || "Unknown";
         if (groupBy === "System") return c.body_system || "Unknown System";
         if (groupBy === "Tag") return c.semantic_tag || "Unknown Tag";
         if (groupBy === "Acuity") return c.acuity || "Unknown";
         return "All Conditions";
      })));
      const allGroups: Record<string, boolean> = {};
      generatedGroups.forEach((g: string) => allGroups[g] = true);
      setCollapsedGroups(allGroups);
    }
  };

  const fetchConditions = () => {
    fetchWithAuth(`/api/patients/${patientId}/conditions`)
      .then(res => res.json())
      .then(data => setConditions(data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchConditions();
  }, [patientId]);

  const filteredConditions = conditions.filter(c => {
    if (isHistoricalSession && activeSessionId && c.session_id !== activeSessionId) return false;
    const matchesTab = activeTab === "active" ? c.status === "Active" : (c.status === "Inactive" || c.status === "Superseded");
    const queryStr = searchQuery.toLowerCase();
    const systemGrp = c.body_system?.toLowerCase() || "";
    const severityGrp = c.severity?.toLowerCase() || "";
    
    const matchesSearch = c.term.toLowerCase().includes(queryStr) || 
                          (c.snomed_code && c.snomed_code.includes(queryStr)) ||
                          systemGrp.includes(queryStr) || 
                          severityGrp.includes(queryStr) ||
                          (c.onset && c.onset.includes(queryStr)) ||
                          (c.status && c.status.toLowerCase().includes(queryStr));
                          
    const matchesTag = tagFilter === "All" || (c.semantic_tag && c.semantic_tag === tagFilter);
                          
    return matchesTab && matchesSearch && matchesTag;
  });

  const getRelativeOnset = (dateStr: string) => {
    if (!dateStr) return "Unknown Onset";
    const onsetDate = new Date(dateStr);
    if (isNaN(onsetDate.getTime())) return dateStr;
    
    const now = new Date();
    const monthsDiff = (now.getFullYear() - onsetDate.getFullYear()) * 12 + now.getMonth() - onsetDate.getMonth();
    
    if (monthsDiff <= 0) return "This month";
    if (monthsDiff < 12) return `${monthsDiff} month${monthsDiff > 1 ? 's' : ''} ago`;
    const yearsDiff = Math.floor(monthsDiff / 12);
    return `${yearsDiff} year${yearsDiff > 1 ? 's' : ''} ago`;
  };

  const availableTags = Array.from(new Set(conditions.map(c => c.semantic_tag).filter(Boolean)));

  const handleDelete = async (conditionId: string) => {
    try {
      const res = await fetchWithAuth(`/api/patients/${patientId}/conditions/${conditionId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Delete failed: ${err.error || res.statusText}`);
        return;
      }
      setConfirmDeleteId(null);
      fetchConditions();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete condition.');
    }
  };

  const openEditModal = (condition: any) => {
    setEditConditionId(condition.id);
    setSelectedConcept({ conceptId: condition.snomed_code, term: condition.term, fsn: condition.term });
    setOnsetDate(condition.onset);
    setSeverity(condition.severity);
    setAcuity(condition.acuity || "Unknown");
    
    const termLower = condition.term.toLowerCase();
    setSeverityLocked(termLower.includes('mild') || termLower.includes('moderate') || termLower.includes('severe') || termLower.includes('major'));
    setAcuityLocked(termLower.includes('acute') || termLower.includes('sudden') || termLower.includes('chronic') || termLower.includes('persistent') || termLower.includes('recurrent'));

    setStatus(condition.status);
    setSource(condition.source || "SNOMED CT Browser");
    setDescription(condition.notes || "");
    setAddStep(2);
    setIsAddModalOpen(true);
  };

  const openConditionDetails = (condition: any) => {
    setFlyoutCondition(condition);
    setIsLoadingLogs(true);
    setExpandedConditionLogs([]);
    if (condition.snomed_code) {
      fetchWithAuth(`/api/patients/${patientId}/conditions/${condition.snomed_code}/cluster-logs`)
        .then(res => res.json())
        .then(data => {
          setExpandedConditionLogs(Array.isArray(data) ? data : []);
          setIsLoadingLogs(false);
        })
        .catch(() => setIsLoadingLogs(false));
    } else {
      setIsLoadingLogs(false);
    }
  };

  const handleAddTimelineNote = () => {
    if (!newNoteTitle.trim() || !newNoteBody.trim() || !newNoteDate) return;
    setIsAddingNote(true);
    
    const isToday = newNoteDate === new Date().toISOString().split("T")[0];
    const logDate = isToday ? new Date().toISOString() : new Date(newNoteDate).toISOString();

    const newLog = {
      date: logDate,
      system_date: new Date().toISOString(),
      action: newNoteTitle.trim(),
      note: newNoteBody.trim(),
      user: getUserIdentity()
    };

    const updatedCond = { ...flyoutCondition, logs: [...(flyoutCondition.logs || []), newLog] };
    
    fetchWithAuth(`/api/patients/${patientId}/conditions/${flyoutCondition.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedCond)
    })
    .then(res => res.json())
    .then(() => {
      setFlyoutCondition(updatedCond);
      setNewNoteTitle("");
      setNewNoteBody("");
      setNewNoteDate(new Date().toISOString().split("T")[0]);
      setIsAddingNote(false);
      openConditionDetails(updatedCond);
      fetchConditions();
    })
    .catch(err => {
      console.error(err);
      setIsAddingNote(false);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Medical History</h2>
          <p className="text-sm text-slate-500">Structured problem list for MTM review</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search conditions..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-64"
            />
          </div>
          {availableTags.length > 0 && (
             <select 
               value={tagFilter}
               onChange={e => setTagFilter(e.target.value)}
               className="text-sm bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 max-h-12"
             >
                <option value="All">All Tags</option>
                {availableTags.map((tag: any) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
             </select>
          )}
          <button 
            disabled={!activeSessionId || isHistoricalSession}
            onClick={() => {
              setSeverityLocked(false);
              setAcuityLocked(false);
              setSeverity("Moderate");
              setAcuity("Unknown");
              setIsAddModalOpen(true);
            }}
            className={cn(
               "px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shadow-sm",
               activeSessionId ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-slate-300 text-slate-500 cursor-not-allowed"
            )}
            title={!activeSessionId ? "Please Start a Visit to document clinical changes" : isHistoricalSession ? "Cannot edit during an archived session view" : "Add Condition"}
          >
            <Plus className="w-4 h-4" />
            Add Condition
          </button>
        </div>
      </div>

      {/* Tabs & Controls */}
      <div className="flex justify-between items-end border-b border-slate-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("active")}
            className={cn(
              "pb-3 px-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === "active" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            Active ({conditions.filter(c => c.status === "Active").length})
          </button>
          <button
            onClick={() => setActiveTab("inactive")}
            className={cn(
              "pb-3 px-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === "inactive" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            Inactive ({conditions.filter(c => c.status === "Inactive").length})
          </button>
        </div>
        <div className="flex items-center gap-4 pb-2">
           {groupBy !== "None" && (
             <div className="flex items-center bg-slate-100 rounded-lg p-1">
               <button 
                 onClick={() => setViewLayout("List")}
                 className={cn("px-3 py-1 text-xs font-medium rounded-md transition-colors", viewLayout === "List" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}
               >
                 List
               </button>
               <button 
                 onClick={() => setViewLayout("Kanban")}
                 className={cn("px-3 py-1 text-xs font-medium rounded-md transition-colors", viewLayout === "Kanban" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}
               >
                 Kanban
               </button>
             </div>
           )}
           <div className="flex items-center gap-2">
             {groupBy !== "None" && viewLayout === "List" && (
                <button 
                  onClick={() => {
                     const isAllExpanded = Object.keys(collapsedGroups).length === 0 || Object.values(collapsedGroups).every(v => !v);
                     toggleAllGroups(isAllExpanded);
                  }}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded-md transition-colors whitespace-nowrap border border-blue-100 mr-2"
                >
                  {Object.values(collapsedGroups).some(v => v) ? "Expand All" : "Collapse All"}
                </button>
             )}
             <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Group By:</span>
           <select 
             value={groupBy} 
             onChange={e => setGroupBy(e.target.value as any)}
             className="text-sm border-slate-200 border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 max-h-8 bg-white cursor-pointer"
           >
             <option value="None">None</option>
             <option value="System">Body System</option>
             <option value="Tag">SNOMED Tag</option>
             <option value="Severity">Severity</option>
             <option value="Acuity">Acuity</option>
             <option value="Source">Source</option>
           </select>
           </div>
        </div>
      </div>

      {/* Condition Cards */}
      <div className={cn(
        "pb-4", 
        viewLayout === "Kanban" && groupBy !== "None" ? "flex gap-6 overflow-x-auto items-start min-h-[400px]" : "space-y-6"
      )}>
        {Object.entries(
          filteredConditions.reduce((acc, condition) => {
            let group = "All Conditions";
            if (groupBy === "Severity") group = condition.severity || "Unknown";
            else if (groupBy === "Source") group = condition.source || "Unknown";
            else if (groupBy === "System") group = condition.body_system || "Unknown System";
            else if (groupBy === "Tag") group = condition.semantic_tag || "Unknown Tag";
            else if (groupBy === "Acuity") group = condition.acuity || "Unknown";
            if (!acc[group]) acc[group] = [];
            acc[group].push(condition);
            return acc;
          }, {} as Record<string, any[]>)
        ).map(([groupName, groupConds]: [string, any[]]) => (
          <div key={groupName} className={cn(
            viewLayout === "Kanban" && groupBy !== "None" ? "flex-shrink-0 w-80 bg-slate-50/50 rounded-xl border border-slate-200/60 p-4" : ""
          )}>
            {groupBy !== "None" && (
              <h3 
                className={cn(
                  "text-sm font-semibold text-slate-800 uppercase tracking-wider mb-4 px-1 pb-1",
                  viewLayout === "List" ? "border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors group" : "flex items-center justify-between"
                )}
                onClick={() => viewLayout === "List" && toggleGroupCollapse(groupName)}
              >
                <div className="flex items-center gap-1.5">
                   {viewLayout === "List" && (
                     collapsedGroups[groupName] ? <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" /> : <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                   )}
                   {groupName}
                </div>
                {viewLayout === "Kanban" && (
                   <span className="bg-white text-slate-500 text-xs px-2 py-0.5 rounded-full border border-slate-200 shadow-sm">{groupConds.length}</span>
                )}
              </h3>
            )}
            
            {!(viewLayout === "List" && collapsedGroups[groupName]) && (
              <div className={cn(
                 viewLayout === "Kanban" && groupBy !== "None" ? "space-y-3" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              )}>
                {groupConds.map((condition) => (
                <div 
                  key={condition.id} 
                  onClick={() => {
                     if (viewLayout === "Kanban") {
                       setExpandedConditionId(expandedConditionId === condition.id ? null : condition.id);
                     } else {
                       openConditionDetails(condition);
                     }
                  }}
                  className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative group cursor-pointer"
                >
                  <div className={cn("flex justify-between items-start gap-2", (viewLayout === "Kanban" && expandedConditionId === condition.id) ? "mb-4" : "mb-2")}>
                    <div className="flex-1 min-w-0 pr-1">
                      <h3 className="font-semibold text-slate-900 leading-tight break-words">{condition.term}</h3>
                      {!(viewLayout === "Kanban" && expandedConditionId === condition.id) && (
                         <div className="flex items-center gap-3 mt-1.5">
                           {(condition.acuity && condition.acuity !== "Unknown") && (
                              <span className={cn("flex items-center gap-1 text-[10px] uppercase font-bold", condition.acuity === "Acute" ? "text-red-500" : "text-blue-500")}>
                                 <div className={cn("w-1.5 h-1.5 rounded-full", condition.acuity === "Acute" ? "bg-red-500" : "bg-blue-500")} /> {condition.acuity}
                              </span>
                           )}
                           {condition.severity && (
                              <span className={cn(
                                "flex items-center gap-1 text-[10px] uppercase font-bold", 
                                condition.severity === "Severe" ? "text-red-500" : 
                                condition.severity === "Moderate" ? "text-amber-500" : 
                                condition.severity === "Mild" ? "text-emerald-500" : "text-slate-400"
                              )}>
                                 <AlertTriangle className="w-3 h-3" /> {condition.severity}
                              </span>
                           )}
                           {condition.onset && (
                              <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-slate-400 border-l border-slate-200 pl-3">
                                <Clock className="w-3 h-3" /> {getRelativeOnset(condition.onset)}
                              </span>
                           )}
                         </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0",
                        condition.status === "Active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                      )}>
                        {condition.status}
                      </span>
                      
                      {isAdmin && (
                        <div className="absolute right-3 top-3 z-20">
                          {confirmDeleteId === condition.id ? (
                            <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1 shadow-md animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
                              <span className="text-[10px] font-bold text-red-700 mr-1">Delete?</span>
                              <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDelete(condition.id); }} className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded transition-colors">
                                Yes
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); setConfirmDeleteId(null); }} className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-600 text-[10px] font-bold rounded border border-slate-200 transition-colors">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex bg-white/80 rounded-md p-0.5 shadow-sm border border-slate-200/60 opacity-40 hover:opacity-100 transition-opacity">
                              <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); openEditModal(condition); }} className="p-1.5 hover:bg-blue-50 rounded text-slate-400 hover:text-blue-600 transition-colors" title="Edit">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); setConfirmDeleteId(condition.id); }} className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-600 transition-colors" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {(viewLayout === "Kanban" && expandedConditionId === condition.id) && (
                     <div className="animate-in fade-in slide-in-from-top-2 duration-200 cursor-default" onClick={e => e.stopPropagation()}>
                        <div className="grid grid-cols-2 gap-4 mb-4 text-sm mt-2 border-t border-slate-100/80 pt-4">
                           <div className="flex flex-col gap-1 text-slate-600">
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Onset Date</span>
                              <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-400" /> {condition.onset}</div>
                           </div>
                           <div className="flex flex-col gap-1 text-slate-600">
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Severity</span>
                              <div className={cn(
                                "flex items-center gap-1.5 font-medium",
                                condition.severity === "Severe" ? "text-red-500" : 
                                condition.severity === "Moderate" ? "text-amber-500" : 
                                condition.severity === "Mild" ? "text-emerald-500" : "text-slate-400"
                              )}>
                                <AlertTriangle className="w-3.5 h-3.5" /> {condition.severity || "Unknown"}
                              </div>
                           </div>
                           {(condition.acuity && condition.acuity !== "Unknown") && (
                               <div className="flex flex-col gap-1 text-slate-600">
                                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Acuity</span>
                                  <div className="flex items-center gap-1.5">
                                    <span className={cn(
                                      "px-1.5 py-0.5 rounded text-[11px] font-medium border flex items-center gap-1",
                                      condition.acuity === "Acute" ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"
                                    )}>
                                      <div className={cn("w-1.5 h-1.5 rounded-full", condition.acuity === "Acute" ? "bg-red-500" : "bg-blue-500")} /> {condition.acuity}
                                    </span>
                                  </div>
                               </div>
                           )}
                        </div>
                        
                        <div className="border-t border-slate-100/80 pt-3 pb-1">
                           <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex justify-between items-center">
                              <span>Clinical Notes</span>
                              {condition.semantic_tag && <span className="text-slate-400 font-medium normal-case bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">Tag: {condition.semantic_tag}</span>}
                           </div>
                           <p className="text-[13.5px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                              {condition.notes ? condition.notes : <span className="italic text-slate-400">No additional description or notes provided for this condition.</span>}
                           </p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-3">
                          <div className="flex justify-between items-center w-full">
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="text-slate-400 font-bold uppercase">SRC:</span>
                              <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider", condition.source === "HIS" ? "bg-blue-50 text-blue-700 border border-blue-200/50" : "bg-purple-50 text-purple-700 border border-purple-200/50")}>{condition.source}</span>
                            </div>
                            <div className="text-slate-400 font-mono text-[10px]">
                              SCT: {condition.snomed_code}
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); openConditionDetails(condition); }}
                            className="w-full bg-blue-50/50 border border-blue-200/60 shadow-sm hover:bg-blue-100 hover:border-blue-300 text-blue-700 px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-xs"
                          >
                             <Clock className="w-4 h-4 shrink-0" /> View Full Clinical Timeline
                          </button>
                        </div>
                     </div>
                  )}
                </div>
              ))}
            </div>
            )}
          </div>
        ))}
      </div>

      {/* Condition Details Flyout Slide-over */}
      {flyoutCondition && (
         <>
           <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity" onClick={() => setFlyoutCondition(null)} />
           <div className="fixed inset-y-0 right-0 w-full md:w-[600px] lg:w-[800px] bg-white shadow-2xl z-50 animate-in slide-in-from-right duration-300 border-l border-slate-200 flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50 shrink-0">
                 <h2 className="text-lg font-semibold text-slate-900">Condition Details</h2>
                 <button onClick={() => setFlyoutCondition(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"><XCircle className="w-5 h-5"/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                 <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0",
                        flyoutCondition.status === "Active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                      )}>
                        {flyoutCondition.status}
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 leading-tight mb-1">{flyoutCondition.term}</h3>
                    {flyoutCondition.semantic_tag && <div className="text-slate-500 text-sm">SNOMED Tag: <span className="font-medium bg-slate-100 px-1 py-0.5 rounded">{flyoutCondition.semantic_tag}</span></div>}
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div>
                       <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Onset Date</div>
                       <div className="flex items-center gap-2 font-medium text-slate-800 text-sm"><Clock className="w-3.5 h-3.5 text-slate-400" /> {flyoutCondition.onset}</div>
                    </div>
                    <div>
                       <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Severity</div>
                       <div className={cn(
                         "flex items-center gap-2 text-sm font-bold",
                         flyoutCondition.severity === "Severe" ? "text-red-600" : 
                         flyoutCondition.severity === "Moderate" ? "text-amber-600" : 
                         flyoutCondition.severity === "Mild" ? "text-emerald-600" : "text-slate-500 font-medium"
                       )}>
                         <AlertTriangle className="w-3.5 h-3.5" /> {flyoutCondition.severity || "Unknown"}
                       </div>
                    </div>
                    {(flyoutCondition.acuity && flyoutCondition.acuity !== "Unknown") && (
                       <div>
                          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Acuity</div>
                          <div className="flex items-center">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-xs font-bold border flex items-center gap-1.5",
                              flyoutCondition.acuity === "Acute" ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"
                            )}>
                              <div className={cn("w-2 h-2 rounded-full", flyoutCondition.acuity === "Acute" ? "bg-red-500" : "bg-blue-500")} /> {flyoutCondition.acuity}
                            </span>
                          </div>
                       </div>
                    )}
                 </div>
                 
                 <div>
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-slate-400"/> Clinical Notes</h4>
                    <div className="bg-white border text-sm border-slate-200 rounded-xl p-4 leading-relaxed text-slate-700 whitespace-pre-wrap shadow-sm">
                       {flyoutCondition.notes ? flyoutCondition.notes : <span className="italic text-slate-400">No clinical narrative provided.</span>}
                    </div>
                 </div>

                 <div className="border-t border-slate-100 pt-6">
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-slate-400"/> Aggregated Disease Timeline</span>
                    </h4>
                    
                    <div className="bg-slate-50/50 border border-slate-200 rounded-xl p-4 mb-4">
                       <h5 className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Document Clinical Note</h5>
                       <div className="space-y-3">
                         <div className="flex gap-3">
                           <input 
                             type="text" 
                             placeholder="Note Title (e.g. Test Results)" 
                             value={newNoteTitle}
                             onChange={(e) => setNewNoteTitle(e.target.value)}
                             className="flex-1 text-sm border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                           />
                           <input 
                             type="date"
                             value={newNoteDate}
                             max={new Date().toISOString().split("T")[0]}
                             onChange={(e) => setNewNoteDate(e.target.value)}
                             className="w-40 text-sm border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-600 focus:text-slate-900 font-medium"
                             title="Note Date"
                           />
                         </div>
                         <textarea 
                           placeholder="Enter chronological update or clinical observation..." 
                           value={newNoteBody}
                           onChange={(e) => setNewNoteBody(e.target.value)}
                           className="w-full text-sm border-slate-300 rounded-lg px-3 py-2 min-h-[80px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                         />
                         <div className="flex justify-end">
                            <button 
                              onClick={handleAddTimelineNote}
                              disabled={!newNoteTitle.trim() || !newNoteBody.trim() || !newNoteDate || isAddingNote}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                            >
                              {isAddingNote ? "Saving..." : "Add to Timeline"}
                            </button>
                         </div>
                       </div>
                    </div>

                    <div className="bg-white border text-sm border-slate-200 rounded-xl p-4 shadow-sm relative flex flex-col">
                        <div className="flex bg-slate-100 p-1 rounded-lg mb-4 text-xs font-semibold">
                          <button onClick={() => setLogViewTab('chronological')} className={cn("flex-1 py-1.5 rounded-md flex justify-center items-center gap-2 transition-colors", logViewTab === 'chronological' ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                             <Activity className="w-3.5 h-3.5" /> History of Present Illness
                          </button>
                          <button onClick={() => setLogViewTab('audit')} className={cn("flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-colors", logViewTab === 'audit' ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                             <Server className="w-3.5 h-3.5" /> System Audit Log
                          </button>
                        </div>
                        {isLoadingLogs ? (
                          <div className="animate-pulse flex flex-col gap-4">
                            {[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded"></div>)}
                          </div>
                        ) : expandedConditionLogs.length > 0 ? (() => {
                          const sortedLogs = [...expandedConditionLogs].sort((a,b) => {
                             if (logViewTab === 'chronological') {
                               return new Date(b.date).getTime() - new Date(a.date).getTime();
                             } else {
                               return new Date(b.system_date || b.date).getTime() - new Date(a.system_date || a.date).getTime();
                             }
                          });
                          
                          const filteredLogs = logViewTab === 'chronological' 
                                ? sortedLogs.filter(log => log.action !== 'Added as Inactive')
                                : sortedLogs;

                          return filteredLogs.length > 0 ? (
                            <div className={cn("space-y-4 relative before:absolute before:inset-y-0 before:left-[11px] before:w-[2px]", logViewTab === 'chronological' ? "before:bg-indigo-100" : "before:bg-slate-100")}>
                              {filteredLogs.map((log: any, idx: number) => (
                                <TimelineLogItem key={idx} log={log} logViewTab={logViewTab} flyoutCondition={flyoutCondition} patientId={patientId} />
                              ))}
                            </div>
                          ) : (
                            <span className="italic text-slate-400 text-center py-4 block">No clinical observations found for biological timeline.</span>
                          );
                        })() : (
                          <span className="italic text-slate-400 text-center py-4 block">No activity logged for this disease cluster.</span>
                        )}
                     </div>
                  </div>

                 <div className="border-t border-slate-100 pt-6">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Metadata Source</h4>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between items-center"><span className="text-slate-500">Source System</span><span className="font-medium text-slate-800">{flyoutCondition.source}</span></div>
                      <div className="flex justify-between items-center"><span className="text-slate-500">Ontology Identifiers</span><span className="font-mono bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-700">{flyoutCondition.snomed_code}</span></div>
                    </div>
                 </div>
              </div>
              
              {isAdmin && (
                 <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0">
                    <button onClick={() => { setFlyoutCondition(null); openEditModal(flyoutCondition); }} className="w-full bg-white border border-slate-200 hover:border-blue-300 text-slate-700 font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"><Edit2 className="w-4 h-4"/> Edit Condition</button>
                 </div>
              )}
           </div>
         </>
      )}

      {/* Add Condition Workflow Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8">
          <div 
            className={cn(
              "bg-white rounded-2xl shadow-2xl flex flex-col transition-all duration-300 relative",
              addStep === 1 ? "w-[85vw] h-[85vh] min-w-[800px] min-h-[500px]" : "w-[600px]"
            )}
            style={addStep === 1 ? { resize: 'both', overflow: 'hidden' } : {}}
          >
            
            {/* Header */}
            <div className="p-4 md:p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                {addStep === 2 && !editConditionId && (
                   <button 
                     onClick={() => setAddStep(1)}
                     className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
                   >
                     <ArrowLeft className="w-5 h-5" />
                   </button>
                )}
                <div>
                   <h2 className="text-xl font-semibold text-slate-900">
                     {addStep === 1 
                       ? "Step 1: Pick Clinical Concept" 
                       : (editConditionId ? "Edit Condition Details" : "Step 2: Condition Details")}
                   </h2>
                   <p className="text-sm text-slate-500 mt-0.5">
                     {addStep === 1 
                       ? "Search the SNOMED CT terminology database." 
                       : "Update clinical tracking details for the patient's record."}
                   </p>
                </div>
              </div>
              <button 
                 onClick={() => {
                   setIsAddModalOpen(false);
                   setAddStep(1);
                   setSelectedConcept(null);
                 }} 
                 className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
                 disabled={isSaving}
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            {/* Body */}
            {addStep === 1 ? (
              <div className="flex-1 overflow-hidden relative flex flex-col">
                 {duplicateError && (
                    <div className="m-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm flex items-center justify-between shrink-0">
                       <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          <span>{duplicateError}</span>
                       </div>
                       <button onClick={() => setDuplicateError(null)}><XCircle className="w-4 h-4 opacity-50 hover:opacity-100"/></button>
                    </div>
                 )}
                 {isCheckingHierarchy && (
                    <div className="absolute inset-0 bg-white/60 z-50 flex items-center justify-center backdrop-blur-[2px]">
                       <div className="flex flex-col items-center gap-3 bg-white p-6 rounded-2xl shadow-xl border border-slate-100">
                           <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                           <span className="text-sm font-medium text-slate-700">Checking clinical ontology...</span>
                       </div>
                    </div>
                 )}
                <div className="flex-1 overflow-hidden relative">
                   <SnomedBrowser 
                      isModal={true} 
                      onSelect={(concept) => {
                        const isExactDup = conditions.some(c => c.snomed_code === concept.conceptId && c.status === "Active");
                        if (isExactDup) {
                          setDuplicateError("This patient already has this condition active.");
                          return;
                        }

                        setDuplicateError(null);
                        setIsCheckingHierarchy(true);

                        const termLower = concept.term.toLowerCase();
                        let targetAcuity = "Unknown";
                        let lockedAc = false;
                        if (termLower.includes('acute') || termLower.includes('sudden')) { targetAcuity = "Acute"; lockedAc = true; }
                        else if (termLower.includes('chronic') || termLower.includes('persistent') || termLower.includes('recurrent')) { targetAcuity = "Chronic"; lockedAc = true; }
                        
                        let targetSev = "Unknown";
                        let lockedSv = false;
                        if (termLower.includes('mild')) { targetSev = "Mild"; lockedSv = true; }
                        else if (termLower.includes('moderate')) { targetSev = "Moderate"; lockedSv = true; }
                        else if (termLower.includes('severe') || termLower.includes('major')) { targetSev = "Severe"; lockedSv = true; }

                        const processOutcome = (hierarchyData: any) => {
                             const existingInactive = conditions.find(c => c.snomed_code === concept.conceptId && c.status === "Inactive");
                             let isReactivating = false;

                             if (existingInactive) {
                                if (hierarchyData && hierarchyData.conflict !== 'none') {
                                   // Quietly Reactivate it to feed it into the Ontology Replacement engine smoothly without double-prompting!
                                   isReactivating = true;
                                } else {
                                   // Rule 4: Acute prevention for Exact Matches without hierarchy collisions
                                   if (targetAcuity === 'Acute') {
                                      window.alert("Acute conditions represent discrete biological episodes. This past condition cannot be simply reactivated; a new clinical entry will be created.");
                                   } else if (window.confirm("This condition is already in the patient's record but is marked as Inactive. Would you like to reactivate it instead of creating a new entry?")) {
                                      isReactivating = true;
                                   }
                                }
                             }

                             if (isReactivating && existingInactive) {
                                 openEditModal(existingInactive);
                                 setStatus("Active");
                             } else {
                                 setAcuity(targetAcuity);
                                 setAcuityLocked(lockedAc);
                                 setSeverity(targetSev);
                                 setSeverityLocked(lockedSv);
                                 setSelectedConcept(concept);
                                 setOnsetDate("");
                                 setStatus("Active");
                             }

                             if (hierarchyData && hierarchyData.conflict !== 'none') {
                               const conflictingConds = conditions.filter(c => hierarchyData.conflictingCodes && hierarchyData.conflictingCodes.includes(c.snomed_code) && c.status === "Active");
                               setHierarchyConflict({
                                 type: hierarchyData.conflict,
                                 conflictingCodes: hierarchyData.conflictingCodes,
                                 conflictingTerms: conflictingConds.map(c => c.term).join(', ') || 'Unknown Condition',
                                 conflictingConditions: conflictingConds
                               });
                               
                               if (conflictingConds.length > 0 && !isReactivating) {
                                 setOnsetDate(conflictingConds[0].onset || "");
                                 if (!lockedSv) setSeverity(conflictingConds[0].severity || "Moderate");
                                 if (!lockedAc) setAcuity(conflictingConds[0].acuity || "Unknown");
                               }
                             } else {
                               setHierarchyConflict(null);
                             }
                             setAddStep(2);
                             setIsCheckingHierarchy(false);
                        };

                        const activeCodes = conditions.filter(c => c.status === "Active").map(c => c.snomed_code).join(',');
                        if (!activeCodes) {
                           processOutcome(null);
                           return;
                        }

                        fetchWithAuth(`/api/snomed/check-hierarchy?targetCode=${concept.conceptId}&existingCodes=${activeCodes}`)
                          .then(res => res.json())
                          .then(data => processOutcome(data))
                          .catch(() => processOutcome(null));
                      }} 
                   />
                 </div>
               </div>
             ) : (
               <div className="p-6 md:p-8 flex flex-col gap-6 bg-white overflow-y-auto max-h-[75vh]">
                 
                 {/* Selected Concept Banner */}
                 <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                   <div className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1">Selected Condition</div>
                   <h3 className="text-lg font-semibold text-blue-900">{selectedConcept?.term}</h3>
                   <p className="text-xs text-blue-600 font-mono mt-1">SCTID: {selectedConcept?.conceptId}</p>
                 </div>

                 {hierarchyConflict && (
                    <div className={cn(
                      "border rounded-xl p-4 shadow-sm relative overflow-hidden shrink-0 transition-colors", 
                      hierarchyConflict.type === 'parent' 
                        ? (status === 'Inactive' ? "bg-blue-50 border-blue-200/60 text-blue-900" : "bg-red-50 border-red-200/60 text-red-900") 
                        : "bg-amber-50 border-amber-200/60 text-amber-900"
                    )}>
                      <div className="absolute right-0 top-0 opacity-10 pointer-events-none translate-x-4 -translate-y-4">
                         <AlertTriangle className={cn("w-24 h-24", hierarchyConflict.type === 'parent' ? (status === 'Inactive' ? "text-blue-500" : "text-red-500") : "text-amber-500")} />
                     </div>
                     <div className="flex items-start gap-3 relative z-10">
                        <AlertTriangle className={cn("w-5 h-5 shrink-0 mt-0.5 transition-colors", hierarchyConflict.type === 'parent' ? (status === 'Inactive' ? "text-blue-600" : "text-red-600") : "text-amber-600")} />
                        <div>
                           <h4 className={cn("font-semibold mb-1 transition-colors", hierarchyConflict.type === 'parent' ? (status === 'Inactive' ? "text-blue-800" : "text-red-800") : "text-amber-800")}>
                              {hierarchyConflict.type === 'parent' && status === 'Inactive' ? "History of Present Illness (HPI)" : "Hierarchical Duplicate Detected"}
                           </h4>
                           {hierarchyConflict.type === 'child' ? (
                              <p className="text-[13px] text-amber-700/90 leading-relaxed mb-3">
                                 The patient already has a broader condition active (<strong>{hierarchyConflict.conflictingTerms}</strong>). Adding this highly specific sub-condition creates clinical redundancy. It is recommended to deactivate the broader condition(s).
                              </p>
                           ) : hierarchyConflict.type === 'sibling' ? (
                              <p className="text-[13px] text-amber-700/90 leading-relaxed mb-3">
                                 A related condition (<strong>{hierarchyConflict.conflictingTerms}</strong>) sharing the same category is already active. You can choose to replace it to maintain a precise list, or keep both if clinically appropriate.
                              </p>
                           ) : hierarchyConflict.type === 'parent' && status === 'Inactive' ? (
                              <p className="text-[13px] text-blue-700/90 leading-relaxed mb-3">
                                 The patient already has a highly specific condition active (<strong>{hierarchyConflict.conflictingTerms}</strong>). This broader history will be safely documented as historical clinical context within its timeline.
                                 {!(onsetDate && hierarchyConflict.conflictingConditions.every((c: any) => new Date(onsetDate) < new Date(c.onset))) && <span className="block mt-2 font-bold text-red-600">However, the Onset Date must be strictly older than the active child condition(s) to be valid as past history.</span>}
                              </p>
                           ) : (
                              <p className="text-[13px] text-red-700/90 leading-relaxed mb-3">
                                 A more specific condition already exists (<strong>{hierarchyConflict.conflictingTerms}</strong>). Adding a broader term is restricted to preserve clinical data quality.
                              </p>
                           )}
                           <div className={cn("bg-white/60 rounded p-2 text-xs font-mono inline-block shadow-sm border transition-colors", hierarchyConflict.type === 'parent' ? (status === 'Inactive' ? "text-blue-800 border-blue-200/50" : "text-red-800 border-red-200/50") : "text-amber-800 border-amber-200/50")}>
                             Active Record(s): {hierarchyConflict.conflictingTerms}
                           </div>
                        </div>
                     </div>
                   </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {/* Onset Date */}
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1.5 focus:text-blue-600">Onset Date <span className="text-red-500">*</span></label>
                     <input 
                       type="date"
                       required
                       max={new Date().toISOString().split("T")[0]}
                       value={onsetDate}
                       onChange={(e) => setOnsetDate(e.target.value)}
                       className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-700"
                     />
                   </div>

                   {/* Severity */}
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center justify-between">
                       <span>Severity <span className="text-red-500">*</span></span>
                       {severityLocked && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">AUTO-DETECTED</span>}
                     </label>
                     <select 
                       value={severity}
                       disabled={severityLocked}
                       onChange={(e) => setSeverity(e.target.value)}
                       className={cn("w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-700", severityLocked ? "bg-slate-50 border-slate-200 cursor-not-allowed opacity-80" : "bg-white border-slate-300")}
                     >
                       <option value="Unknown">Unknown</option>
                       <option value="Mild">Mild</option>
                       <option value="Moderate">Moderate</option>
                       <option value="Severe">Severe</option>
                     </select>
                   </div>
                   
                   {/* Status */}
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1.5">Status <span className="text-red-500">*</span></label>
                     <select 
                       value={status}
                       onChange={(e) => setStatus(e.target.value)}
                       className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-700"
                     >
                       <option value="Active">Active</option>
                       <option value="Inactive">Inactive</option>
                     </select>
                   </div>

                   {/* Source */}
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1.5">Source <span className="text-red-500">*</span></label>
                     <select 
                       value={source}
                       onChange={(e) => setSource(e.target.value)}
                       className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-700"
                     >
                       <option value="SNOMED CT Browser">SNOMED CT Browser</option>
                       <option value="HIS">HIS</option>
                     </select>
                   </div>
                   
                   {/* Acuity */}
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center justify-between">
                       <span>Acuity</span>
                       {acuityLocked && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">AUTO-DETECTED</span>}
                     </label>
                     <select 
                       value={acuity}
                       disabled={acuityLocked}
                       onChange={(e) => setAcuity(e.target.value)}
                       className={cn("w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-700", acuityLocked ? "bg-slate-50 border-slate-200 cursor-not-allowed opacity-80" : "bg-white border-slate-300")}
                     >
                       <option value="Unknown">Unknown</option>
                       <option value="Acute">Acute</option>
                       <option value="Chronic">Chronic</option>
                     </select>
                   </div>
                </div>

                {/* Description/Notes */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Description / Notes <span className="text-slate-400 font-normal ml-1">(Optional)</span></label>
                  <textarea 
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add any clinical context or observations..."
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm resize-none"
                  />
                  <p className="text-xs text-slate-500 mt-1.5">This note will be visible in the patient's medical summary.</p>
                </div>

                {/* Actions */}
                <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
                  <button 
                    onClick={() => {
                       setIsAddModalOpen(false);
                       setAddStep(1);
                       setSelectedConcept(null);
                       setDuplicateError(null);
                       setHierarchyConflict(null);
                    }}
                    disabled={isSaving}
                    className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  
                  {hierarchyConflict && (hierarchyConflict.type === 'child' || hierarchyConflict.type === 'sibling') ? (
                     <>
                       {hierarchyConflict.type === 'sibling' && (
                         <button 
                           onClick={async () => {
                              if (!onsetDate) return alert("Onset date is required");
                              setIsSaving(true);
                              try {
                                let finalLogs = [{
                                    date: new Date().toISOString(),
                                    system_date: new Date().toISOString(),
                                    action: status === 'Active' ? 'Added & Activated' : 'Added as Inactive',
                                    note: description || 'Initial condition entry',
                                    user: getUserIdentity()
                                  }];
                                  
                                if (editConditionId) {
                                  const existingCond = conditions.find(c => c.id === editConditionId);
                                  finalLogs = [...(existingCond?.logs || []), {
                                     date: new Date().toISOString(),
                                     system_date: new Date().toISOString(),
                                     action: status === 'Active' ? 'Reactivated' : 'Status Updated',
                                     note: `Condition activated dynamically. ${description || ''}`.trim(),
                                     user: getUserIdentity()
                                  }];
                                }

                                const payload = {
                                  term: selectedConcept?.term,
                                  snomed_code: selectedConcept?.conceptId,
                                  onset: onsetDate,
                                  severity: severity,
                                  status: status,
                                  source: source,
                                  acuity: acuity,
                                  notes: description,
                                  logs: finalLogs,
                                  session_id: activeSessionId
                                };
                                await fetchWithAuth(editConditionId ? `/api/patients/${patientId}/conditions/${editConditionId}` : `/api/patients/${patientId}/conditions`, {
                                  method: editConditionId ? 'PUT' : 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(payload)
                                });
                                setIsAddModalOpen(false);
                                setAddStep(1);
                                setEditConditionId(null);
                                setOnsetDate("");
                                setDescription("");
                                setAcuity("Unknown");
                                setHierarchyConflict(null);
                                setDuplicateError(null);
                                fetchConditions();
                              } catch (err) {
                                console.error(err);
                              } finally {
                                setIsSaving(false);
                              }
                           }}
                           disabled={isSaving || !onsetDate}
                           className="px-6 py-2.5 bg-white border border-blue-200 text-blue-700 font-medium hover:bg-blue-50 rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                         >
                           Save & Keep Both
                         </button>
                       )}
                       <button 
                         onClick={async () => {
                            if (!onsetDate) return alert("Onset date is required");
                            setIsSaving(true);
                            
                            try {
                              const deactivatePromises = hierarchyConflict.conflictingConditions.map((cond: any) => {
                                 const updatedLogs = [...(cond.logs || []), {
                                   date: new Date().toISOString(),
                                   action: 'Deactivated',
                                   note: `Deactivated automatically due to clinical escalation replacement with: ${selectedConcept?.term}`,
                                   user: getUserIdentity()
                                 }];
                                 return fetchWithAuth(`/api/patients/${patientId}/conditions/${cond.id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ ...cond, status: hierarchyConflict.type === 'child' ? 'Superseded' : 'Inactive', logs: updatedLogs })
                                 });
                              });
                              await Promise.all(deactivatePromises);

                              const payload: any = {
                                term: selectedConcept?.term,
                                snomed_code: selectedConcept?.conceptId,
                                onset: onsetDate,
                                severity: severity,
                                status: status,
                                source: source,
                                acuity: acuity,
                                notes: description,
                                session_id: activeSessionId
                              };
                              if (!editConditionId) {
                                 payload.logs = [{
                                   date: new Date().toISOString(),
                                   system_date: new Date().toISOString(),
                                   action: status === 'Active' ? 'Added & Activated' : 'Added as Inactive',
                                   note: `Clinically escalated/linked from previous diagnosis. ${description || ''}`.trim(),
                                   user: getUserIdentity()
                                 }];
                              } else {
                                 const existingCond = conditions.find(c => c.id === editConditionId);
                                 let currentLogs = existingCond?.logs || [];
                                 payload.logs = [...currentLogs, {
                                   date: new Date().toISOString(),
                                   system_date: new Date().toISOString(),
                                   action: status === 'Active' ? 'Reactivated' : 'Status Updated',
                                   note: `Condition activated dynamically during clinical replacement. ${description || ''}`.trim(),
                                   user: getUserIdentity()
                                 }];
                              }
                              await fetchWithAuth(editConditionId ? `/api/patients/${patientId}/conditions/${editConditionId}` : `/api/patients/${patientId}/conditions`, {
                                method: editConditionId ? 'PUT' : 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                              });
                              
                              setIsAddModalOpen(false);
                              setAddStep(1);
                              setEditConditionId(null);
                              setOnsetDate("");
                              setDescription("");
                              setAcuity("Unknown");
                              setHierarchyConflict(null);
                              setDuplicateError(null);
                              fetchConditions(); // Refresh UI
                            } catch (err) {
                               console.error(err);
                            } finally {
                               setIsSaving(false);
                            }
                         }}
                         disabled={isSaving || !onsetDate}
                         className={cn(
                           "px-6 py-2.5 text-white font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2",
                           hierarchyConflict.type === 'sibling' ? "bg-amber-600 hover:bg-amber-700" : "bg-amber-600 hover:bg-amber-700"
                         )}
                       >
                         {isSaving ? "Replacing..." : "Replace & Deactivate Old"}
                       </button>
                      </>
                   ) : (() => {
                     const isParentExceptionMet = hierarchyConflict && hierarchyConflict.type === 'parent' && 
                                                 status === 'Inactive' && 
                                                 onsetDate && 
                                                 hierarchyConflict.conflictingConditions.every((c: any) => new Date(onsetDate) < new Date(c.onset));
                     const hideSave = hierarchyConflict && hierarchyConflict.type === 'parent' && !isParentExceptionMet;
                     return hideSave ? null : (
                       <button 
                    onClick={() => {
                       if (!onsetDate) return alert("Onset date is required");
                       
                         const savePayload = () => {
                           setIsSaving(true);
                           
                           let newLogs = undefined;
                           if (editConditionId) {
                             const existingCond = conditions.find(c => c.id === editConditionId);
                             let currentLogs = existingCond?.logs || [];
                             let logAppended = false;
                             
                             if (existingCond && status !== existingCond.status) {
                               currentLogs = [...currentLogs, {
                                 date: new Date().toISOString(),
                                 system_date: new Date().toISOString(),
                                 action: status === 'Active' ? 'Reactivated' : 'Deactivated',
                                 note: description || (status === 'Active' ? 'Reactivated condition manually' : 'Deactivated condition manually'),
                                 user: getUserIdentity()
                               }];
                               logAppended = true;
                             } else if (existingCond && description !== existingCond.notes && description.trim() !== "") {
                               currentLogs = [...currentLogs, {
                                  date: new Date().toISOString(),
                                  system_date: new Date().toISOString(),
                                  action: 'Clinical Note Added',
                                  note: description,
                                  user: getUserIdentity()
                               }];
                               logAppended = true;
                             }
                             if (logAppended) newLogs = currentLogs;
                           }

                           const payload: any = {
                             term: selectedConcept?.term,
                             snomed_code: selectedConcept?.conceptId,
                             onset: onsetDate,
                             severity: severity,
                             status: status,
                             source: source,
                             acuity: acuity,
                             notes: description,
                             session_id: activeSessionId
                           };
                           if (newLogs) {
                             payload.logs = newLogs;
                           } else if (!editConditionId) {
                             // Initialize logs for creating a brand new condition with real user
                             payload.logs = [{
                               date: new Date().toISOString(),
                               system_date: new Date().toISOString(),
                               action: status === 'Active' ? 'Added & Activated' : 'Added as Inactive',
                               note: description || 'Initial condition entry',
                               user: getUserIdentity()
                             }];
                           }
  
                         fetchWithAuth(editConditionId ? `/api/patients/${patientId}/conditions/${editConditionId}` : `/api/patients/${patientId}/conditions`, {
                           method: editConditionId ? 'PUT' : 'POST',
                           headers: { 'Content-Type': 'application/json' },
                           body: JSON.stringify(payload)
                         })
                         .then(res => res.json())
                         .then(() => {
                           setIsAddModalOpen(false);
                           setAddStep(1);
                           setEditConditionId(null);
                           setOnsetDate("");
                           setDescription("");
                           setAcuity("Unknown");
                           setHierarchyConflict(null);
                           setDuplicateError(null);
                           fetchConditions(); // Refresh UI
                         })
                         .catch(err => console.error(err))
                         .finally(() => setIsSaving(false));
                       };

                       if (editConditionId && status === "Active") {
                          const activeCodesWithoutCurrent = conditions
                            .filter(c => c.status === "Active" && c.id !== editConditionId)
                            .map(c => c.snomed_code)
                            .join(',');
                          
                          if (activeCodesWithoutCurrent && selectedConcept?.conceptId) {
                             setIsSaving(true);
                             fetchWithAuth(`/api/snomed/check-hierarchy?targetCode=${selectedConcept.conceptId}&existingCodes=${activeCodesWithoutCurrent}`)
                               .then(res => res.json())
                               .then(data => {
                                   if (data.conflict !== 'none') {
                                      setIsSaving(false);
                                      const conflictingConds = conditions.filter(c => data.conflictingCodes && data.conflictingCodes.includes(c.snomed_code) && c.status === "Active");
                                      setHierarchyConflict({
                                        type: data.conflict,
                                        conflictingCodes: data.conflictingCodes,
                                        conflictingTerms: conflictingConds.map(c => c.term).join(', ') || 'Unknown Condition',
                                        conflictingConditions: conflictingConds
                                      });
                                   } else {
                                     savePayload();
                                  }
                               })
                               .catch(err => {
                                  console.error(err);
                                  setIsSaving(false);
                               });
                             return;
                          }
                       }
                       
                       savePayload();
                    }}
                    disabled={isSaving || !onsetDate}
                    className="px-6 py-2.5 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSaving ? "Saving..." : (editConditionId ? "Save Changes" : "Save Condition")}
                  </button>
                  );})()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
