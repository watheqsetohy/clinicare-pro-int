import React, { useState, useEffect, useRef } from "react";
import {
  Users, Search, Plus, Save, Trash2, Key, ShieldCheck,
  UserCheck, UserX, Network, Check, Briefcase, RefreshCw, AlertTriangle, ArrowLeft,
  Building2, GitMerge, Map, Activity, X, ChevronRight,
  Download, Upload, CheckCircle2, XCircle
} from "lucide-react";
import { UserProfile, getUsers, createUser as apiCreateUser, updateUser as apiUpdateUser, deleteUser as apiDeleteUser, changePassword, mockHashPassword } from "../lib/userStorage";
import { Role, getRoles } from "../lib/roleStorage";
import { CorporateNode, getCorporateTree, getCorporateLayers, CorporateLayerDef } from "../lib/corporateStorage";

export function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [corporateNodes, setCorporateNodes] = useState<CorporateNode[]>([]);
  const [corporateLayers, setCorporateLayers] = useState<CorporateLayerDef[]>([]);
  
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<{pw: string, forId: string} | null>(null);
  const [drillPath, setDrillPath] = useState<CorporateNode[]>([]); // breadcrumb navigation path
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [roleSearch, setRoleSearch] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [u, r, c, l] = await Promise.all([getUsers(), getRoles(), getCorporateTree(), getCorporateLayers()]);
      setUsers(u);
      setRoles(r);
      setCorporateNodes(c);
      setCorporateLayers(l);
      setLoading(false);
    };
    load().catch(console.error);
  }, []);

  const handleSave = async () => {
    const user = users.find(u => u.id === activeUserId);
    if (!user) return;
    try {
      await apiUpdateUser(user);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (e) { console.error(e); }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(users, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'clinicarepro_users.json'; a.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const parsed: UserProfile[] = JSON.parse(text);
      let imported = 0;
      for (const u of parsed) {
        if (!users.find(ex => ex.loginId === u.loginId)) {
          await apiCreateUser(u);
          imported++;
        }
      }
      setImportStatus({ type: 'success', msg: `Imported ${imported} user${imported !== 1 ? 's' : ''}.` });
      const fresh = await getUsers();
      setUsers(fresh);
    } catch {
      setImportStatus({ type: 'error', msg: 'Invalid file format.' });
    }
    setTimeout(() => setImportStatus(null), 4500);
  };

  const addUser = async () => {
    const newUser: UserProfile = {
      id: `usr_${Date.now()}`,
      fullName: "New Appointed User",
      loginId: `user_${Math.floor(Math.random() * 10000)}`,
      roleId: roles.length > 0 ? roles[0].id : "",
      corporateNodeIds: [],
      lexiconTags: [],
      status: "Active",
      isTempPassword: true,
      passwordHash: mockHashPassword("Welcome!123")
    };
    await apiCreateUser(newUser);
    setUsers([newUser, ...users]);
    setActiveUserId(newUser.id);
  };

  const updateUser = (updates: Partial<UserProfile>) => {
    if (!activeUserId) return;
    setUsers(users.map(u => u.id === activeUserId ? { ...u, ...updates } : u));
  };

  const deleteUser = async () => {
    if (window.confirm("Suspend and permanently revoke access for this user?")) {
      await apiDeleteUser(activeUserId!);
      setUsers(users.filter(u => u.id !== activeUserId));
      setActiveUserId(null);
    }
  };

  const resetCredentials = async () => {
    if (!activeUserId) return;
    const tempPass = Math.random().toString(36).slice(-8) + "!Z";
    // Sync local state so "Save Registry" doesn't revert to old hash
    updateUser({ isTempPassword: true, passwordHash: mockHashPassword(tempPass) });
    // Send pass via API and flag as temporary
    await changePassword(activeUserId, tempPass, true);
    setGeneratedPassword({ pw: tempPass, forId: activeUserId });
  };

  const activeUser = users.find(u => u.id === activeUserId);
  const activeRoleConfig = roles.find(r => r.id === activeUser?.roleId);

  const getIconForType = (type: string) => {
    switch (type) {
      case 'Corporate Group': return <Map className="w-4 h-4" />;
      case 'Regional Branch': return <GitMerge className="w-4 h-4" />;
      case 'Facility': return <Building2 className="w-4 h-4" />;
      case 'Department': return <Briefcase className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  // ---- Cascade Helpers ----
  const getAllDescendantIds = (node: CorporateNode): string[] => {
    const ids: string[] = [node.id];
    if (node.children) for (const c of node.children) ids.push(...getAllDescendantIds(c));
    return ids;
  };

  const isFullyChecked = (node: CorporateNode, selected: string[]): boolean => {
    const all = getAllDescendantIds(node);
    return all.length > 0 && all.every(id => selected.includes(id));
  };

  const isPartialChecked = (node: CorporateNode, selected: string[]): boolean => {
    const all = getAllDescendantIds(node);
    const cnt = all.filter(id => selected.includes(id)).length;
    return cnt > 0 && cnt < all.length;
  };

  const toggleNodeCascade = (node: CorporateNode) => {
    if (!activeUser) return;
    const current = new Set<string>(activeUser.corporateNodeIds || []);
    const allIds = getAllDescendantIds(node);
    const isChecked = current.has(node.id) || isFullyChecked(node, [...current]);
    if (isChecked) allIds.forEach(id => current.delete(id));
    else allIds.forEach(id => current.add(id));
    updateUser({ corporateNodeIds: [...current] });
  };

  // ---- Find a node by ID anywhere in the tree ----
  const findNodeById = (nodes: CorporateNode[], id: string): CorporateNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) { const found = findNodeById(n.children, id); if (found) return found; }
    }
    return null;
  };

  // Determine if a node is a Facility (terminal selectable level)
  // A node is a facility if it has a facilityCode OR its layer has requiresCode
  const isFacilityNode = (node: CorporateNode): boolean => {
    if (node.facilityCode) return true;
    const layer = corporateLayers.find(l => l.title === node.type);
    return !!layer?.requiresCode;
  };

  // Collect only FACILITY descendants from a node
  const getFacilityDescendantIds = (node: CorporateNode): string[] => {
    const ids: string[] = [];
    if (isFacilityNode(node)) {
      ids.push(node.id);
      return ids; // don't go deeper than facility
    }
    if (node.children) {
      for (const c of node.children) ids.push(...getFacilityDescendantIds(c));
    }
    return ids;
  };

  // Multi-level agile selection: any node at any layer is selectable, cascades to all children
  const toggleFacilityCascade = (node: CorporateNode) => {
    if (!activeUser) return;
    const current = new Set<string>(activeUser.corporateNodeIds || []);
    const allIds = getAllDescendantIds(node); // includes node.id itself
    const allChecked = allIds.every(id => current.has(id));
    if (allChecked) allIds.forEach(id => current.delete(id));
    else allIds.forEach(id => current.add(id));
    updateUser({ corporateNodeIds: [...current] });
  };

  // ---- Drill-Down Navigator ----
  const currentLevelNodes = drillPath.length === 0
    ? corporateNodes
    : drillPath[drillPath.length - 1].children || [];

  const renderDrillNavigator = () => {
    const selected = activeUser?.corporateNodeIds || [];

    // Collect ALL selected nodes across every level for the tags row
    const selectedFacilities: CorporateNode[] = [];
    const collectSelected = (nodes: CorporateNode[]) => {
      for (const n of nodes) {
        if (selected.includes(n.id)) selectedFacilities.push(n);
        if (n.children) collectSelected(n.children);
      }
    };
    collectSelected(corporateNodes);

    return (
      <div className="space-y-3">
        
        {/* Selected Facilities Tags */}
        {selectedFacilities.length > 0 && (
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Assigned Units ({selectedFacilities.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {selectedFacilities.map(n => (
                <span
                  key={n.id}
                  className="flex items-center gap-1.5 pl-2 pr-1 py-1 bg-[#2960DC] text-white rounded-full text-[11px] font-bold shadow-sm"
                >
                  <span className="[&>svg]:w-3 [&>svg]:h-3">{getIconForType(n.type)}</span>
                  {n.title}
                  <span className="text-[9px] opacity-60 font-normal bg-white/20 px-1.5 py-0.5 rounded-full">{n.type}</span>
                  {n.facilityCode && (
                    <span className="text-[9px] opacity-70 font-mono">{n.facilityCode}</span>
                  )}
                  <button
                    onClick={() => toggleFacilityCascade(n)}
                    className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex-wrap">
          <button
            onClick={() => setDrillPath([])}
            className={`hover:text-[#2960DC] transition-colors ${drillPath.length === 0 ? 'text-[#2960DC] font-bold' : ''}`}
          >
            Enterprise
          </button>
          {drillPath.map((node, i) => (
            <React.Fragment key={node.id}>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <button
                onClick={() => setDrillPath(drillPath.slice(0, i + 1))}
                className={`hover:text-[#2960DC] transition-colors truncate max-w-[120px] ${i === drillPath.length - 1 ? 'text-[#2960DC] font-bold' : ''}`}
              >
                {node.title}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Current Level Items */}
        <div className="space-y-1.5">
          {currentLevelNodes.map(node => {
            const allIds = getAllDescendantIds(node); // includes node.id itself
            const allChecked = allIds.length > 0 && allIds.every(id => selected.includes(id));
            const someChecked = allIds.some(id => selected.includes(id)) && !allChecked;
            const hasChildren = node.children && node.children.length > 0;

            return (
              <div
                key={node.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  allChecked
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                    : someChecked
                    ? 'bg-slate-50/50 dark:bg-slate-800/20 border-dashed border-blue-100 dark:border-blue-900/50'
                    : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-blue-200'
                }`}
              >
                {/* Unified checkbox — works for any node at any level, cascades to children */}
                <button
                  onClick={() => toggleFacilityCascade(node)}
                  title={hasChildren ? `Select "${node.title}" and all nested units` : `Select "${node.title}"`}
                  className={`w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-all ${
                    allChecked
                      ? 'bg-[#2960DC] border-[#2960DC]'
                      : someChecked
                      ? 'bg-slate-200 border-slate-400 dark:bg-slate-700 dark:border-slate-500'
                      : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-[#2960DC]'
                  }`}
                >
                  {allChecked && <Check className="w-3 h-3 text-white" />}
                  {someChecked && <div className="w-2 h-0.5 bg-slate-500 rounded" />}
                </button>

                {/* Icon */}
                <div className={`shrink-0 ${allChecked ? 'text-[#2960DC]' : 'text-slate-400'}`}>
                  {getIconForType(node.type)}
                </div>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate ${allChecked ? 'text-[#2960DC] dark:text-[#5fa2f6]' : 'text-slate-800 dark:text-slate-200'}`}>
                    {node.title}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">{node.type}</p>
                    {node.facilityCode && (
                      <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                        {node.facilityCode}
                      </span>
                    )}
                    {hasChildren && (
                      <span className="text-[10px] text-slate-400">
                        {allIds.filter(id => selected.includes(id)).length}/{allIds.length} selected
                      </span>
                    )}
                  </div>
                </div>

                {/* Drill arrow — available on any parent node */}
                {hasChildren && (
                  <button
                    onClick={() => setDrillPath([...drillPath, node])}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-[#2960DC] hover:text-white text-slate-500 transition-all shrink-0"
                    title={`Browse inside ${node.title}`}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}

          {currentLevelNodes.length === 0 && (
            <p className="text-center text-[11px] text-slate-400 py-4">No facilities found at this level.</p>
          )}
        </div>

        {/* Back button */}
        {drillPath.length > 0 && (
          <button
            onClick={() => setDrillPath(drillPath.slice(0, -1))}
            className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 hover:text-[#2960DC] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to {drillPath.length > 1 ? drillPath[drillPath.length - 2].title : 'Enterprise Root'}
          </button>
        )}
      </div>
    );
  };

  const filteredUsers = users.filter(u => 
    u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.loginId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA] dark:bg-[#0B1120] rounded-tl-3xl shadow-2xl overflow-hidden relative border-l border-t border-white/50 dark:border-white/5">
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 p-5 flex justify-between items-center shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => window.history.back()}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
               <Users className="w-6 h-6 text-[#2960DC] dark:text-[#38bdf8]" /> User Account Management
            </h1>
            <p className="text-[11px] text-slate-500 font-medium uppercase tracking-widest mt-1 ml-9">Matrix Identity & Access Deployment</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Hidden file input for import */}
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            className="hidden"
          />

          {/* Export */}
          <button
            onClick={handleExport}
            title="Export user database as a JSON backup file"
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors border border-slate-200 dark:border-slate-700"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export DB</span>
          </button>

          {/* Import */}
          <button
            onClick={() => importInputRef.current?.click()}
            title="Import a previously exported user database backup"
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors border border-slate-200 dark:border-slate-700"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Import DB</span>
          </button>

          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

          <button
            onClick={addUser}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> Onboard User
          </button>

          <button
            onClick={handleSave}
            className={`px-5 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-all shadow-md ml-2 border ${
              isSaved
                ? 'bg-emerald-500 border-emerald-600 text-white ring-2 ring-emerald-500/50'
                : 'bg-white text-[#2960DC] border-white hover:bg-blue-50'
            }`}
          >
            {isSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {isSaved ? 'Deployed!' : 'Save Registry'}
          </button>
        </div>
      </header>

      {/* Import Status Toast */}
      {importStatus && (
        <div className={`absolute top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border text-sm font-semibold animate-in fade-in slide-in-from-top-3 duration-300 ${
          importStatus.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-900/90 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-200'
            : 'bg-red-50 dark:bg-red-900/90 border-red-200 dark:border-red-700 text-red-700 dark:text-red-200'
        }`}>
          {importStatus.type === 'success'
            ? <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
            : <XCircle className="w-5 h-5 shrink-0 text-red-500" />}
          {importStatus.msg}
        </div>
      )}

      {/* Main Split-Pane Workspace */}
      <main className="flex flex-1 overflow-hidden relative">
        {/* Left Pane - User Explorer */}
        <div className="w-[320px] h-full flex flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 relative overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
             <div className="relative">
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search identities..." 
                  className="w-full px-3 py-2 pl-9 rounded-md bg-slate-100 dark:bg-slate-800 border-transparent focus:bg-white focus:border-[#2960DC] dark:focus:border-blue-500 text-xs outline-none transition-all dark:text-white"
                />
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
              </div>
          </div>
          
          <div className="flex-1 overflow-y-auto w-full pb-20 p-3 space-y-2">
            {filteredUsers.map((u) => {
              const isActive = activeUserId === u.id;
              const mappedRole = roles.find(r => r.id === u.roleId);
              return (
                <button
                  key={u.id}
                  onClick={() => setActiveUserId(u.id)}
                  className={`w-full text-left p-3 rounded-lg transition-all border flex items-center gap-3 ${
                    isActive 
                      ? 'bg-white dark:bg-slate-800 border-[#2960DC] shadow-md ring-1 ring-[#2960DC]' 
                      : 'bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    u.status === 'Suspended' ? 'bg-red-100 text-red-500' : 
                    isActive ? 'bg-blue-100 text-[#2960DC]' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                  }`}>
                    {u.status === 'Suspended' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  </div>
                  <div className="overflow-hidden">
                    <p className={`font-semibold text-sm truncate ${isActive ? 'text-[#2960DC] dark:text-[#4F84F6]' : 'text-slate-700 dark:text-slate-300'}`}>{u.fullName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[10px] text-slate-500 truncate">{mappedRole?.name || 'Unassigned Role'}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Pane - Profile Inspector */}
        <div className="flex-1 h-full bg-white dark:bg-[#0B1120] overflow-y-auto overflow-x-hidden relative flex flex-col">
          {activeUser ? (
            <div className="max-w-4xl w-full mx-auto p-8 lg:p-12 space-y-10 pb-32">
              
              <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                    Identity Profile
                    {activeUser.status === 'Suspended' && <span className="px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 text-[10px] rounded uppercase tracking-wider font-bold">Suspended</span>}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage network access coordinates and credential issuance.</p>
                </div>
                
                <button 
                  onClick={deleteUser}
                  className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Terminate Access
                </button>
              </div>

              {/* Matrix Binding Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Meta Settings */}
                <div className="space-y-6">
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-2"><Briefcase className="w-4 h-4" /> Personal Coordinates</h3>
                    
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Full User Name</label>
                      <input 
                        value={activeUser.fullName}
                        onChange={(e) => updateUser({ fullName: e.target.value })}
                        className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-[#2960DC] transition-all font-semibold text-sm"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">System Login ID</label>
                      <input 
                        value={activeUser.loginId}
                        onChange={(e) => updateUser({ loginId: e.target.value })}
                        className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-[#2960DC] transition-all font-semibold text-sm"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-2 cursor-pointer pt-2">
                        <input 
                          type="checkbox" 
                          checked={activeUser.status === 'Active'}
                          onChange={(e) => updateUser({ status: e.target.checked ? 'Active' : 'Suspended' })}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-600" 
                        />
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Account Active (Permit Login)</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Matrix Authorization Filter */}
                <div className="space-y-6">
                  <div className="bg-blue-50/50 dark:bg-[#2960DC]/5 p-6 rounded-2xl border border-[#2960DC]/20 space-y-5 shadow-sm">
                    <h3 className="text-xs font-bold flex items-center text-[#2960DC] dark:text-[#5fa2f6] uppercase tracking-widest gap-2 mb-2"><ShieldCheck className="w-4 h-4" /> Matrix Authorization Anchor</h3>
                    
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Assigned Security Role</label>
                      {/* Custom searchable role dropdown */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => { setRoleDropdownOpen(o => !o); setRoleSearch(''); }}
                          className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-left font-semibold text-sm flex items-center justify-between gap-2 focus:ring-2 focus:ring-[#2960DC] outline-none transition-all"
                        >
                          <span className="truncate">
                            {(() => {
                              const r = roles.find(r => r.id === activeUser.roleId);
                              return r ? `${r.name} ${r.scope === 'Global' ? '(Global — Full Access)' : `(Scope: ${r.scope})`}` : 'Select Role...';
                            })()}
                          </span>
                          <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>

                        {roleDropdownOpen && (
                          <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                            {/* Search input */}
                            <div className="p-2 border-b border-slate-100 dark:border-slate-700">
                              <div className="relative">
                                <input
                                  autoFocus
                                  type="text"
                                  placeholder="Search roles..."
                                  value={roleSearch}
                                  onChange={(e) => setRoleSearch(e.target.value)}
                                  className="w-full pl-7 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#2960DC] outline-none"
                                />
                                <svg className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" /></svg>
                              </div>
                            </div>
                            {/* Options list */}
                            <div className="max-h-52 overflow-y-auto">
                              {roles
                                .filter(r => r.active !== false)
                                .filter(r => !roleSearch || r.name.toLowerCase().includes(roleSearch.toLowerCase()))
                                .map(r => {
                                  const isSelected = r.id === activeUser.roleId;
                                  return (
                                    <button
                                      key={r.id}
                                      type="button"
                                      onClick={() => {
                                        updateUser({ roleId: r.id, corporateNodeIds: [] });
                                        setRoleDropdownOpen(false);
                                        setRoleSearch('');
                                      }}
                                      className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 transition-colors ${
                                        isSelected
                                          ? 'bg-[#2960DC] text-white'
                                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                                      }`}
                                    >
                                      <span className="font-medium truncate">{r.name}</span>
                                      <span className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded font-semibold ${
                                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                      }`}>{r.scope === 'Global' ? 'Global' : r.scope}</span>
                                    </button>
                                  );
                              })}
                              {roles.filter(r => r.active !== false && (!roleSearch || r.name.toLowerCase().includes(roleSearch.toLowerCase()))).length === 0 && (
                                <p className="text-center text-xs text-slate-400 py-4">No roles match "{roleSearch}"</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="animate-in fade-in slide-in-from-top-2">
                      <label className="block text-[10px] font-bold text-[#2960DC] dark:text-[#5fa2f6] mb-1.5 uppercase tracking-wider">Enterprise Domain Assignment</label>
                      
                      {activeRoleConfig?.scope === 'Global' ? (
                        <div className="w-full p-2.5 bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 flex items-center gap-2">
                          <Network className="w-4 h-4 text-[#2960DC]" />
                          Global Administrator (Full System Coverage)
                        </div>
                      ) : (
                        <div className="mt-2 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                           {renderDrillNavigator()}
                        </div>
                      )}
                    </div>
                  </div>

                   {/* Credentials Box */}
                   <div className="bg-slate-50 dark:bg-slate-900/40 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-2"><Key className="w-4 h-4" /> Identity Credentials</h3>

                      <div className="flex gap-3">
                        <button 
                          onClick={resetCredentials}
                          className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                        >
                           <RefreshCw className="w-4 h-4" /> Reset Initial Password
                        </button>
                      </div>

                      {generatedPassword && generatedPassword.forId === activeUser.id && (
                        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-500/30 rounded-xl animate-in zoom-in-95">
                           <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-2">Temporary Password Generated</p>
                           <div className="flex justify-between items-center bg-white dark:bg-[#0B1120] border border-emerald-200 dark:border-emerald-800 p-2 rounded-lg">
                              <span className="font-mono text-lg font-bold tracking-widest text-slate-800 dark:text-white px-2 select-all">{generatedPassword.pw}</span>
                           </div>
                           <p className="text-xs text-slate-500 mt-3">Provide these credentials securely. The user will be required to change this upon first login.</p>
                        </div>
                      )}

                      {activeUser.isTempPassword && !(generatedPassword && generatedPassword.forId === activeUser.id) && (
                         <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 text-[11px] font-bold uppercase tracking-wider mt-2">
                           <AlertTriangle className="w-3.5 h-3.5" /> Awaiting Initial Login Reset
                         </div>
                      )}
                   </div>
                </div>

              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-600">
              <Users className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">Select a User Profile</p>
              <p className="text-sm">Manage enterprise assignments and identity controls.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
