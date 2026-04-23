import React, { useState, useEffect } from "react";
import {
  ArrowLeft, RotateCcw, Plus, Save, Trash2,
  ShieldAlert, Shield, ShieldCheck, ChevronRight, ChevronDown, Check, UserPlus, LayoutGrid, Users, PowerOff, Power
} from "lucide-react";
import { Role, EnterpriseScope, getRoles, createRole, updateRole as apiUpdateRole, deleteRole as apiDeleteRole, resetRolesToDefault } from "../lib/roleStorage";
import { ModuleNode, getModules, saveModules } from "../lib/moduleStorage";
import { getCorporateLayers, CorporateLayerDef } from "../lib/corporateStorage";
import { getUsers } from "../lib/userStorage";
import * as Icons from "lucide-react";

export function RoleManagement() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [modules, setModules] = useState<ModuleNode[]>([]);
  const [layers, setLayers] = useState<CorporateLayerDef[]>([]);
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  
  // UI states
  const [isSaved, setIsSaved] = useState(false);
  const [leftWidth, setLeftWidth] = useState(25);
  const [isResizing, setIsResizing] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [roleSearch, setRoleSearch] = useState('');
  const [moduleSearch, setModuleSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      const [r, m, l] = await Promise.all([getRoles(), getModules(), getCorporateLayers()]);
      setRoles(r);
      setModules(m);
      setLayers(l);
    };
    load().catch(console.error);
  }, []);

  const handleSave = async () => {
    for (const r of roles) await apiUpdateRole(r).catch(() => {});
    await saveModules(modules);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleRestoreDefaults = async () => {
    if (window.confirm("Are you sure you want to restore the default roles? Current custom roles will be permanently deleted.")) {
      // Delete all non-core roles via API then re-fetch
      const allRoles = await getRoles();
      for (const r of allRoles) { if (!r.isCoreLocked) await apiDeleteRole(r.id).catch(() => {}); }
      const fresh = await getRoles();
      setRoles(fresh);
      setActiveRoleId(null);
    }
  };

  // Resizing logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = (e.clientX / window.innerWidth) * 100;
      if (newWidth > 15 && newWidth < 60) setLeftWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Debounced Auto-Save — roles (independent of modules so scope changes always persist)
  useEffect(() => {
    if (roles.length === 0) return;
    const timer = setTimeout(async () => {
      for (const r of roles) await apiUpdateRole(r).catch(() => {});
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }, 800);
    return () => clearTimeout(timer);
  }, [roles]);

  // Debounced Auto-Save — modules (independent of roles)
  useEffect(() => {
    if (modules.length === 0) return;
    const timer = setTimeout(async () => {
      await saveModules(modules);
    }, 800);
    return () => clearTimeout(timer);
  }, [modules]);

  // Roles CRUD
  const addNewRole = async () => {
    const newId = `role_${Date.now()}`;
    const newRole: Role = {
      id: newId,
      name: "New Custom Role",
      description: "Define responsibilities and scope for this role.",
      isCoreLocked: false,
      scope: 'Hospital Entity'
    };
    await createRole(newRole);
    setRoles([...roles, newRole]);
    setActiveRoleId(newId);
  };

  const updateActiveRole = (updates: Partial<Role>) => {
    if (!activeRoleId) return;
    setRoles(roles.map(r => r.id === activeRoleId ? { ...r, ...updates } : r));
  };

  const deleteActiveRole = async () => {
    if (!activeRoleId) return;
    const roleNameToRemove = roles.find(r => r.id === activeRoleId)?.name;
    if (!roleNameToRemove) return;
    
    if (window.confirm(`Are you absolutely sure you want to delete the "${roleNameToRemove}" role?`)) {
      try {
        await apiDeleteRole(activeRoleId);
        setRoles(roles.filter(r => r.id !== activeRoleId));
        const cleanModules = (nodes: ModuleNode[]): ModuleNode[] => nodes.map(n => ({
          ...n, allowedRoles: n.allowedRoles.filter(role => role !== roleNameToRemove),
          submodules: n.submodules ? cleanModules(n.submodules) : []
        }));
        setModules(cleanModules(modules));
        setActiveRoleId(null);
      } catch (e: any) {
        alert(e.message || 'Cannot delete role.');
      }
    }
  };

  const duplicateActiveRole = async () => {
    const activeRole = roles.find(r => r.id === activeRoleId);
    if (!activeRole) return;
    
    const baseName = activeRole.name.replace(/ \(\d+\)$/, ''); // Strip trailing numbers if exist
    let newName = `${baseName} (Copy)`;
    
    // Deep check to ensure unique name
    let counter = 1;
    while (roles.some(r => r.name === newName)) {
      counter++;
      newName = `${baseName} (${counter})`;
    }

    const newRole: Role = {
      ...activeRole,
      id: `role_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: newName,
      isCoreLocked: false,
    };

    // Persist to DB first — same pattern as addNewRole
    try {
      await createRole(newRole);
    } catch (e) {
      console.error('Failed to duplicate role:', e);
      return;
    }
    
    setRoles([...roles, newRole]);
    
    const cloneModuleAccess = (nodes: ModuleNode[]): ModuleNode[] => {
      return nodes.map(n => {
        let newAllowed = [...(n.allowedRoles || [])];
        if (newAllowed.includes(activeRole.name) && !newAllowed.includes(newName)) {
          newAllowed.push(newName);
        }
        return {
          ...n,
          allowedRoles: newAllowed,
          submodules: n.submodules ? cloneModuleAccess(n.submodules) : []
        };
      });
    };
    
    setModules(cloneModuleAccess(modules));
    setActiveRoleId(newRole.id);
  };

  const activeRole = roles.find(r => r.id === activeRoleId);

  // Authority Matrix Logic
  const hasAccess = (node: ModuleNode, roleName: string): boolean => {
    return node.allowedRoles?.includes(roleName);
  };

  const traverseAndToggleAccess = (nodes: ModuleNode[], nodeIdToToggle: string, roleName: string, shouldAdd: boolean, applyCascade = false, foundParentStatus = false): ModuleNode[] => {
    return nodes.map(node => {
      let isTarget = node.id === nodeIdToToggle;
      
      // If we found the target OR we are cascading down from a target
      if (isTarget || applyCascade) {
        let newAllowed = [...(node.allowedRoles || [])];
        if (shouldAdd && !newAllowed.includes(roleName)) {
          newAllowed.push(roleName);
        } else if (!shouldAdd) {
          newAllowed = newAllowed.filter(r => r !== roleName);
        }
        
        return {
          ...node,
          allowedRoles: newAllowed,
          submodules: node.submodules ? traverseAndToggleAccess(node.submodules, nodeIdToToggle, roleName, shouldAdd, true, true) : []
        };
      }
      
      // If not target, continue searching downward
      return {
        ...node,
        submodules: node.submodules ? traverseAndToggleAccess(node.submodules, nodeIdToToggle, roleName, shouldAdd, false, foundParentStatus) : []
      };
    });
  };

  /** Ancestor chain for a node ID — used for upward permission propagation */
  const getAncestorChain = (nodes: ModuleNode[], targetId: string, chain: ModuleNode[] = []): ModuleNode[] | null => {
    for (const node of nodes) {
      if (node.id === targetId) return chain;
      if (node.submodules) {
        const r = getAncestorChain(node.submodules, targetId, [...chain, node]);
        if (r !== null) return r;
      }
    }
    return null;
  };

  /** Add a role to a single node only (no cascade) — safe for ancestor propagation */
  const addRoleToSingleNode = (nodes: ModuleNode[], nodeId: string, role: string): ModuleNode[] =>
    nodes.map(node => {
      if (node.id === nodeId) {
        const roles = node.allowedRoles || [];
        return { ...node, allowedRoles: roles.includes(role) ? roles : [...roles, role] };
      }
      if (node.submodules) return { ...node, submodules: addRoleToSingleNode(node.submodules, nodeId, role) };
      return node;
    });

  const toggleModuleAccess = (nodeId: string, currentState: boolean) => {
    if (!activeRole) return;
    const shouldAdd = !currentState;

    // Apply toggle with downward cascade (existing behavior for both add and remove)
    let newModules = traverseAndToggleAccess(modules, nodeId, activeRole.name, shouldAdd);

    // If ADDING: also propagate UP so every ancestor node also includes this role
    // (a child can only be meaningful if its parent is accessible)
    if (shouldAdd) {
      const ancestors = getAncestorChain(modules, nodeId) ?? [];
      for (const anc of ancestors) {
        newModules = addRoleToSingleNode(newModules, anc.id, activeRole.name);
      }
    }

    setModules(newModules);
  };

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderModuleTree = (nodes: ModuleNode[], level = 0): React.ReactNode => {
    if (!activeRole) return null;
    
    return nodes.map((node) => {
      const hasChildren = node.submodules && node.submodules.length > 0;
      const isExpanded = moduleSearch ? true : expandedNodes.has(node.id);
      const isGranted = hasAccess(node, activeRole.name);
      
      // @ts-ignore dynamic mapping
      const IconCmp = Icons[node.iconName] || Icons.Box;

      return (
        <div key={node.id} className="select-none">
          <div 
            onClick={() => toggleModuleAccess(node.id, isGranted)}
            style={{ paddingLeft: `${(level * 1.5) + 0.5}rem` }}
            className={`flex items-center justify-between py-2.5 pr-4 border-b border-transparent cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 group ${isGranted ? 'bg-blue-50/30' : ''}`}
          >
            <div className="flex items-center gap-2">
              <div 
                onClick={hasChildren ? (e) => toggleExpand(node.id, e) : undefined}
                className={`w-6 h-6 flex items-center justify-center shrink-0 rounded-md transition-colors ${hasChildren ? 'hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer' : ''}`}
              >
                {hasChildren ? (
                  isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <IconCmp className={`w-4 h-4 ${isGranted ? 'text-[#2960DC]' : 'text-slate-400'}`} />
                <span className={`text-sm ${isGranted ? 'font-semibold text-slate-900 dark:text-white' : 'font-medium text-slate-500 dark:text-slate-400'}`}>
                  {node.title}
                </span>
              </div>
            </div>
            
            {/* The Checkbox Checkmark */}
            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${isGranted ? 'bg-[#2960DC] border-[#2960DC] shadow-sm' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'}`}>
               {isGranted && <Check className="w-3.5 h-3.5 text-white" />}
            </div>
          </div>
          
          {hasChildren && isExpanded && (
            <div className="w-full border-l border-slate-100 dark:border-slate-800/50 ml-[1.125rem]">
              {renderModuleTree(node.submodules, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 font-sans overflow-hidden">
      {/* Header */}
      <header className="h-16 shrink-0 bg-[#2960DC] text-white flex items-center justify-between px-6 shadow-md z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => window.history.back()} className="hover:bg-white/10 p-2 rounded-full transition-colors" title="Back to Super Admin Dashboard">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 border-l border-white/20 pl-4">
            <ShieldCheck className="w-6 h-6 text-blue-100" />
            <div>
              <h1 className="font-semibold text-lg leading-tight tracking-wide shadow-sm">Global Role Access Management</h1>
              <p className="text-[10px] text-blue-200 font-medium uppercase tracking-widest opacity-90">RBAC Authority Matrices</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handleRestoreDefaults}
            className="px-4 py-2 hover:bg-slate-800/50 text-white text-sm border-transparent font-semibold rounded-lg flex items-center gap-2 transition-colors opacity-80 hover:opacity-100"
          >
            <RotateCcw className="w-4 h-4" /> Reset Defaults
          </button>
          
          <button 
            onClick={addNewRole}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm border border-white/20 font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-inner ml-2"
          >
            <UserPlus className="w-4 h-4" /> Create Custom Role
          </button>

          <button 
            onClick={handleSave}
            className={`px-5 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-all shadow-md ml-4 border ${
              isSaved 
                ? 'bg-emerald-500 border-emerald-600 text-white ring-2 ring-emerald-500/50' 
                : 'bg-white text-[#2960DC] border-white hover:bg-blue-50'
            }`}
          >
            {isSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {isSaved ? 'Saved & Synced!' : 'Publish Matrix'}
          </button>
        </div>
      </header>

      {/* Main Split-Pane Workspace */}
      <main className="flex flex-1 overflow-hidden relative">
        {/* Left Pane - Roles Explorer */}
        <div style={{ width: `${leftWidth}%` }} className="h-full flex flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 relative overflow-hidden">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 space-y-2">
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Defined Roles</h2>
            <div className="relative">
              <input
                type="text"
                placeholder="Search roles..."
                value={roleSearch}
                onChange={(e) => setRoleSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#2960DC] outline-none transition-all"
              />
              <svg className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" /></svg>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto w-full pb-20 p-3 space-y-2">
            {roles.filter(r => !roleSearch || r.name.toLowerCase().includes(roleSearch.toLowerCase())).map((r) => {
              const isSelected = activeRoleId === r.id;
              const isDeactivated = r.active === false;
              return (
                <button
                  key={r.id}
                  onClick={() => setActiveRoleId(r.id)}
                  className={`w-full text-left p-4 rounded-xl transition-all border flex items-center gap-3 ${
                    isDeactivated ? 'opacity-50' : ''
                  } ${
                    isSelected
                      ? 'bg-white dark:bg-slate-800 border-[#2960DC] shadow-md ring-1 ring-[#2960DC]'
                      : 'bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    isDeactivated ? 'bg-slate-100 text-slate-400 dark:bg-slate-800' :
                    isSelected ? 'bg-blue-100 text-[#2960DC]' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                  }`}>
                    {isDeactivated ? <PowerOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                  </div>
                  <div className="overflow-hidden flex-1 min-w-0">
                    <p className={`font-semibold text-sm truncate ${
                      isDeactivated ? 'text-slate-400 line-through' :
                      isSelected ? 'text-[#2960DC] dark:text-[#4F84F6]' : 'text-slate-700 dark:text-slate-300'
                    }`}>{r.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <p className="text-[10px] text-slate-500 truncate">{r.isCoreLocked ? 'System Locked' : 'Custom Role'}</p>
                      {isDeactivated ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                          Deactivated
                        </span>
                      ) : (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider ${
                          r.scope === 'Global' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30' :
                          r.scope === 'National' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30' :
                          'bg-slate-100 text-slate-500 dark:bg-slate-800'
                        }`}>
                          {r.scope}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Resizer */}
        <div 
          onMouseDown={() => setIsResizing(true)}
          className="w-2 cursor-col-resize hover:bg-[#2960DC]/20 active:bg-[#2960DC]/40 z-10 -ml-1 transition-colors relative"
          style={{ height: '100%' }}
        />

        {/* Right Pane - Inspector & MatrixBuilder */}
        <div className="flex-1 h-full bg-white dark:bg-[#0B1120] overflow-y-auto overflow-x-hidden relative flex flex-col">
          {activeRole ? (
            <div className="max-w-4xl w-full mx-auto p-8 lg:p-12 space-y-10 pb-32">
              
              {/* Role Header Info */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                    Authority Matrix Editor
                    {activeRole.isCoreLocked && <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] rounded uppercase tracking-wider font-bold">System Default</span>}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configure systemic module access levels for this credential cohort.</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={duplicateActiveRole}
                    className="px-4 py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    <Icons.Copy className="w-4 h-4" /> Duplicate
                  </button>

                  {/* Deactivate / Activate toggle — custom roles only */}
                  {!activeRole.isCoreLocked && (
                    <button
                      onClick={() => updateActiveRole({ active: activeRole.active === false ? true : false })}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 border ${
                        activeRole.active === false
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400'
                          : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400'
                      }`}
                      title={activeRole.active === false
                        ? 'Re-activate this role — it will appear in new user assignments again'
                        : 'Deactivate — existing users keep the role, but no new assignments allowed'}
                    >
                      {activeRole.active === false
                        ? <><Power className="w-4 h-4" /> Activate Role</>
                        : <><PowerOff className="w-4 h-4" /> Deactivate</>
                      }
                    </button>
                  )}

                  {!activeRole.isCoreLocked && (() => {
                    // Assigned count shown via server guard — display a static 0 until user actually tries to delete
                    const assignedCount = roles.find(r => r.id === activeRole.id) ? 0 : 0;
                    const canDelete = true; // Server enforces the actual guard
                    return (
                      <div className="relative group">
                        <button 
                          onClick={canDelete ? deleteActiveRole : undefined}
                          disabled={!canDelete}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                            canDelete
                              ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 cursor-pointer'
                              : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed opacity-60'
                          }`}
                        >
                          <Trash2 className="w-4 h-4" /> Delete Role
                          {!canDelete && (
                            <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-1.5 py-0.5 rounded-full ml-1">
                              <Users className="w-2.5 h-2.5" />{assignedCount}
                            </span>
                          )}
                        </button>
                        {!canDelete && (
                          <div className="absolute right-0 top-full mt-2 z-50 w-56 bg-slate-900 text-white text-xs rounded-xl px-3 py-2.5 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <p className="font-bold mb-0.5">Cannot Delete Role</p>
                            <p className="opacity-75">{assignedCount} user{assignedCount !== 1 ? 's are' : ' is'} assigned to this role. Reassign them first in User Management.</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Deactivation Warning Banner */}
              {activeRole.active === false && (
                <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl px-5 py-4">
                  <PowerOff className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm text-red-700 dark:text-red-400">Role Deactivated</p>
                    <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-0.5 leading-relaxed">
                      This role is no longer available for new user assignments. All existing users assigned to <strong>{activeRole.name}</strong> retain their access until manually changed. Click <strong>Activate Role</strong> to re-enable it.
                    </p>
                  </div>
                </div>
              )}

              {/* Role Metadata Form */}
              <div className="bg-slate-50 dark:bg-slate-900/40 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4 md:col-span-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Role Title String</label>
                    <input 
                      value={activeRole.name}
                      onChange={(e) => updateActiveRole({ name: e.target.value })}
                      disabled={activeRole.isCoreLocked}
                      placeholder="e.g. Staff Nurse..."
                      className={`w-full p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none transition-all font-semibold text-sm ${activeRole.isCoreLocked ? 'opacity-70 cursor-not-allowed' : 'focus:ring-2 focus:ring-[#2960DC]'}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Description</label>
                    <textarea 
                      value={activeRole.description}
                      onChange={(e) => updateActiveRole({ description: e.target.value })}
                      placeholder="Role responsibilities..."
                      rows={2}
                      className="w-full p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#2960DC] transition-all text-sm resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Enterprise Authority Scope</label>
                    <select
                      value={activeRole.scope}
                      onChange={(e) => updateActiveRole({ scope: e.target.value as EnterpriseScope })}
                      disabled={activeRole.isCoreLocked}
                      className={`w-full p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none transition-all font-semibold text-sm appearance-none cursor-pointer ${activeRole.isCoreLocked ? 'opacity-70 cursor-not-allowed' : 'focus:ring-2 focus:ring-[#2960DC]'}`}
                    >
                      <option value="Global">Global (All Entities & Settings)</option>
                      {layers.map(layer => (
                         <option key={layer.id} value={layer.title}>{layer.title} (Matrix Alignment)</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Lexicon tags are now assigned per-user in User Management, not per-role */}
                  {(() => {
                    const activeLayerConfig = layers.find(l => l.title === activeRole.scope);
                    if (activeLayerConfig?.useReferenceList && activeLayerConfig.validLexicon && activeLayerConfig.validLexicon.length > 0) {
                      return (
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800/50">
                            <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
                            <div>
                              <p className="text-[11px] font-bold text-purple-700 dark:text-purple-300">{activeLayerConfig.title} Scope — Lexicon-Guided</p>
                              <p className="text-[10px] text-purple-600/70 dark:text-purple-400/70 mt-0.5">Specific dictionary tags (e.g. ICU, Pharmacy) are assigned individually per user in User Management.</p>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
                
                {/* Visual Security Badge */}
                <div className="md:col-span-1 flex flex-col justify-center border-l border-slate-200 dark:border-slate-800 pl-8">
                   <div className="flex items-center gap-4 text-slate-600 dark:text-slate-300">
                      <div className="w-16 h-16 rounded-2xl bg-[#2960DC]/10 dark:bg-[#38bdf8]/10 text-[#2960DC] dark:text-[#38bdf8] flex items-center justify-center border border-[#2960DC]/20 shadow-inner">
                        <Shield className="w-8 h-8" />
                      </div>
                      <div>
                        <p className="font-bold">{activeRole.name}</p>
                        <p className="text-xs opacity-70 max-w-[200px] leading-relaxed mt-1">Matrix changes are saved bi-directionally to the master Module Composer.</p>
                      </div>
                   </div>
                </div>
              </div>

              {/* Authority Matrix Tree Builder */}
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-3">
                  <LayoutGrid className="w-5 h-5 text-[#2960DC]" /> Module Access Matrix
                </h3>
                
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                   <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center mb-3">
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">N-Level Module Tree</span>
                     {/* Module-specific search */}
                     <div className="relative">
                       <input
                         type="text"
                         placeholder="Filter modules..."
                         value={moduleSearch}
                         onChange={(e) => setModuleSearch(e.target.value)}
                         className="pl-6 pr-3 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#2960DC] outline-none transition-all w-40"
                       />
                       <svg className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" /></svg>
                     </div>
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Authority Grant</span>
                   </div>
                   <div className="w-full">
                     {renderModuleTree((() => {
                       if (!moduleSearch) return modules;
                       const q = moduleSearch.toLowerCase();
                       const filter = (nodes: ModuleNode[]): ModuleNode[] =>
                         nodes.reduce<ModuleNode[]>((acc, n) => {
                           const kids = filter(n.submodules || []);
                           if (n.title.toLowerCase().includes(q) || kids.length > 0)
                             acc.push({ ...n, submodules: kids });
                           return acc;
                         }, []);
                       return filter(modules);
                     })())}
                   </div>
                   {modules.length === 0 && (
                     <p className="text-center p-8 text-sm text-slate-500 italic">No modules defined in the Master Composer yet.</p>
                   )}
                </div>
              </div>

            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-600">
              <ShieldAlert className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">Select a Role to Manage Matrix</p>
              <p className="text-sm mt-2 opacity-70">Design the precise module accessibility for a user cohort.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
