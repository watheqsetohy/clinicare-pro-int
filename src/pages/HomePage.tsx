import { useState, useEffect } from "react";
import React from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, Sun, Moon, Building2, ChevronRight, MapPin, Check, Globe, Network, X, Shield, Lock, ChevronDown, LayoutGrid, CheckCircle2, XCircle, Info, Zap } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { getModules, ModuleNode } from "../lib/moduleStorage";
import * as Icons from "lucide-react";
import { getMyProfile } from "../lib/userStorage";
import { getCorporateTree, CorporateNode } from "../lib/corporateStorage";
import { getActiveSite, setActiveSite, clearActiveSite, ActiveSiteContext, setEnterpriseScope, EnterpriseScope } from "../lib/siteContext";
import { getAuthSession } from "../lib/authSession";
import { getRoles, Role } from "../lib/roleStorage";
import { UserAvatarMenu } from "../components/UserAvatarMenu";
import { ChangePasswordModal } from "../components/ChangePasswordModal";

export function HomePage() {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(false);
  const [modules, setModules] = useState<ModuleNode[]>([]);
  const [allModules, setAllModules] = useState<ModuleNode[]>([]);
  const [deniedModule, setDeniedModule] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState('Guest');
  const [currentRoleObj, setCurrentRoleObj] = useState<Role | null>(null);
  const [showRoleDrawer, setShowRoleDrawer] = useState(false);

  // ---- Auth Context ----
  const session = getAuthSession();

  // ---- Force password change ----
  const [showForcePwd, setShowForcePwd] = useState(false);

  // ---- Site Selector State ----
  const [showSiteSelector, setShowSiteSelector] = useState(false);
  const [activeSite, setActiveSiteState] = useState<ActiveSiteContext | null>(null);
  const [userFacilities, setUserFacilities] = useState<CorporateNode[]>([]);

  const collectFacilities = (nodes: CorporateNode[]): CorporateNode[] => {
    const result: CorporateNode[] = [];
    for (const n of nodes) {
      if (n.facilityCode || n.type === 'Facility') result.push(n);
      if (n.children) result.push(...collectFacilities(n.children));
    }
    return result;
  };

  useEffect(() => {
    if (localStorage.getItem('darkMode') === 'true') {
      document.documentElement.classList.add('dark');
      setDarkMode(true);
    }
    if (!session) return;

    const loadData = async () => {
      // Resolve current role name
      const roles = await getRoles();
      const role = roles.find(r => r.id === session.roleId);
      const roleName = role?.name || 'Guest';
      setCurrentRole(roleName);
      setCurrentRoleObj(role || null);
      const isSuperAdmin = roleName === 'Super Admin';
      const isGlobalAccess = isSuperAdmin || role?.scope === 'Global';

      // Check if temp password reset is needed
      const dbUser = await getMyProfile().catch(() => null);
      if (dbUser?.isTempPassword) setShowForcePwd(true);

      // ---- All modules (for authority matrix) & filtered for display ----
      const allMods = await getModules();
      setAllModules(allMods);
      const filtered = isGlobalAccess
        ? allMods
        : allMods.filter(m => m.allowedRoles?.includes(roleName));
      setModules(filtered);

      // ---- Resolve authorized facilities from user's corporateNodeIds ----
      // Supports both DIRECT facility assignment AND GROUP/BRANCH assignment
      // (assigning a user to a group node gives them access to all child facilities)
      const corporateTree = await getCorporateTree();
      const allFacilities = collectFacilities(corporateTree);

      const resolveFromAssignedNodes = (nodeIds: string[]): CorporateNode[] => {
        if (!nodeIds.length) return [];
        // Walk the full corporate tree and collect all facilities under assigned nodes
        const results: CorporateNode[] = [];
        const seen = new Set<string>();
        const walk = (nodes: CorporateNode[], collecting: boolean) => {
          for (const node of nodes) {
            const shouldCollect = collecting || nodeIds.includes(node.id);
            if (shouldCollect && (node.facilityCode || node.type === 'Facility')) {
              if (!seen.has(node.id)) { seen.add(node.id); results.push(node); }
            }
            walk(node.children || [], shouldCollect);
          }
        };
        walk(corporateTree, false);
        return results;
      };

      let authorizedFacilities: CorporateNode[] = [];
      if (isGlobalAccess) {
        authorizedFacilities = allFacilities;
      } else {
        authorizedFacilities = resolveFromAssignedNodes(dbUser?.corporateNodeIds ?? session.corporateNodeIds);
      }
      setUserFacilities(authorizedFacilities);

      // Write enterprise scope context
      const enterpriseScope: EnterpriseScope = {
        authorizedFacilityIds: authorizedFacilities.map(f => f.id),
        authorizedFacilityTitles: authorizedFacilities.map(f => f.title),
      };
      setEnterpriseScope(enterpriseScope);

      // Resolve active site from session and validate it against permissions
      const existing = getActiveSite();
      if (existing && (isGlobalAccess || authorizedFacilities.some(f => f.id === existing.facilityId))) {
        setActiveSiteState(existing);
      } else {
        if (existing) clearActiveSite(); // Clear invalid cached site
        
        if (authorizedFacilities.length === 1) {
          const site: ActiveSiteContext = {
            facilityId: authorizedFacilities[0].id,
            facilityTitle: authorizedFacilities[0].title,
            facilityCode: authorizedFacilities[0].facilityCode,
          };
          setActiveSite(site);
          setActiveSiteState(site);
        } else if (authorizedFacilities.length > 1) {
          setShowSiteSelector(true);
        }
      }
    };

    loadData().catch(console.error);
  }, []);

  const toggleDarkMode = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', String(isDark));
    setDarkMode(isDark);
  };

  const handleModuleClick = (mod: ModuleNode) => {
    if (!mod.active) return;

    // Access check
    if (!mod.allowedRoles || (!mod.allowedRoles.includes(currentRole) && currentRole !== 'Super Admin')) {
      setDeniedModule(mod.title);
      setTimeout(() => setDeniedModule(null), 3500);
      return;
    }

    const hasSubmodules = mod.submodules && mod.submodules.length > 0;

    // Core modules with a real registered route (e.g. /super-admin, /admin) → navigate directly
    if (mod.isCore && mod.route && mod.route !== '#') {
      navigate(mod.route);
      return;
    }

    // Parent module with sub-nodes → dedicated landing page
    if (hasSubmodules) {
      navigate(`/module/${mod.id}`);
      return;
    }

    // Leaf module — direct link to a real page if flagged, else generic workspace
    if (mod.isDirectLink && mod.route && mod.route !== '#') {
      navigate(mod.route);
      return;
    }
    navigate(`/module-page/${mod.id}`);
  };


  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">

      {/* Force Password Change Overlay */}
      {showForcePwd && session && (
        <ChangePasswordModal
          userId={session.userId}
          onComplete={() => setShowForcePwd(false)}
        />
      )}

      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <img src="/logos/Logo Horizontal.png" alt="CLINICare Logo" className="h-12 object-contain hidden dark:block brightness-0 invert" />
          <img src="/logos/Logo Horizontal.png" alt="CLINICare Logo" className="h-12 object-contain dark:hidden" />
        </div>
        <div className="flex items-center gap-3">
          {/* Action Routing Hub shortcut */}
          <button
            onClick={() => navigate('/action-hub')}
            title="Action Routing Hub"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2960DC]/8 hover:bg-[#2960DC]/15 border border-[#2960DC]/20 hover:border-[#2960DC]/40 transition-all group"
          >
            <Zap className="w-4 h-4 text-[#2960DC] dark:text-[#4F84F6] group-hover:text-yellow-500 dark:group-hover:text-yellow-400 transition-colors" />
            <span className="text-xs font-bold text-[#2960DC] dark:text-[#4F84F6] hidden sm:block">ARH</span>
          </button>

          {/* Dark Mode */}
          <button onClick={toggleDarkMode} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Active Site Badge */}
          {activeSite && (
            <button
              onClick={() => userFacilities.length > 1 && setShowSiteSelector(true)}
              className={cn(
                "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold transition-colors",
                userFacilities.length > 1
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400 cursor-pointer"
                  : "bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 cursor-default"
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span className="truncate max-w-[140px]">{activeSite.facilityTitle}</span>
              {activeSite.facilityCode && <span className="text-[10px] font-mono opacity-60">{activeSite.facilityCode}</span>}
              {userFacilities.length > 1 && <ChevronRight className="w-3 h-3 opacity-50" />}
            </button>
          )}

          {/* Real User Avatar — replaces simulation dropdown */}
          {session
            ? <UserAvatarMenu session={session} />
            : (
              <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 text-sm font-bold">?</div>
            )
          }
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10 w-full">
        {/* Artistic Hero Section */}
        <div className="relative mb-12 rounded-[2rem] overflow-hidden bg-gradient-to-br from-[#2960DC] via-[#1a4bb3] to-[#0f307a] shadow-2xl p-10 sm:p-14 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          
          {/* Abstract background shapes */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-cyan-400/20 blur-3xl opacity-50 mix-blend-overlay"></div>
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-[400px] h-[400px] rounded-full bg-indigo-500/30 blur-[100px] mix-blend-overlay"></div>
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" style={{ pointerEvents: 'none' }}></div>

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-6 text-white text-xs font-bold tracking-widest uppercase shadow-sm">
              <Globe className="w-3.5 h-3.5" />
              Master Portal Enterprise 
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight drop-shadow-md mb-4 bg-clip-text">
              Welcome{session ? `, ${session.fullName.split(' ')[0]}` : ''} 👋
            </h1>
            <p className="mt-5 text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto font-medium leading-relaxed drop-shadow-sm">
              Select a module to enter your workspace. Your access is specially crafted for your{' '}
              <button
                onClick={() => setShowRoleDrawer(true)}
                className="inline-flex items-center mx-1 px-3 py-1 rounded-full bg-white/20 border border-white/30 text-white font-bold text-sm shadow-inner backdrop-blur-md hover:bg-white/30 transition-all cursor-pointer group gap-1.5"
              >
                <Shield className="w-3.5 h-3.5 opacity-80 group-hover:scale-110 transition-transform" />
                {currentRole}
                <Info className="w-3 h-3 opacity-60" />
              </button>
              {' '}role.
            </p>
          </div>

          {/* Access Denied Toast */}
          <div className={cn(
            "absolute top-full mt-4 left-1/2 -translate-x-1/2 min-w-[300px] z-50 transition-all duration-300 pointer-events-none",
            deniedModule ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
          )}>
            <div className="bg-red-50 dark:bg-red-900/90 border-2 border-red-200 dark:border-red-700 text-red-600 dark:text-red-100 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4">
              <ShieldAlert className="w-8 h-8 shrink-0 text-red-500 dark:text-red-400" />
              <div className="text-left">
                <h3 className="font-bold text-sm">Access Denied</h3>
                <p className="text-xs mt-0.5 opacity-90">Your <span className="font-bold">"{currentRole}"</span> credentials do not permit access to <span className="font-semibold italic">[{deniedModule}]</span>.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Routing Hub Shortcut */}
        <button
          onClick={() => navigate('/action-hub')}
          className="w-full text-left mb-6 rounded-2xl border border-[#2960DC]/30 bg-gradient-to-r from-[#2960DC]/5 to-transparent dark:from-[#2960DC]/10 dark:to-transparent p-5 flex items-center gap-4 hover:border-[#2960DC]/60 hover:shadow-md transition-all group relative overflow-hidden animate-in fade-in duration-700"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#2960DC]/0 to-[#2960DC]/0 group-hover:to-[#2960DC]/5 transition-all" />
          <div className="w-12 h-12 rounded-2xl bg-[#2960DC] flex items-center justify-center shrink-0 shadow-lg shadow-blue-300 dark:shadow-none group-hover:scale-105 transition-transform">
            <Icons.Zap className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-extrabold text-slate-800 dark:text-white text-base">Action Routing Hub</p>
              <span className="text-[9px] font-bold uppercase tracking-widest bg-[#2960DC] text-white px-2 py-0.5 rounded-full">New</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Find the right person instantly — by site, module &amp; action intent</p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-[#2960DC] group-hover:translate-x-1 transition-all shrink-0" />
        </button>

        {modules.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <ShieldAlert className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p className="font-semibold text-lg">No modules assigned to your role.</p>
            <p className="text-sm mt-1">Contact your administrator to get access configured.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 mt-8">
            {modules.map((mod) => {
              // @ts-ignore dynamic icon mapping
              const Icon = Icons[mod.iconName] || Icons.Box;
              const canAccess = mod.active && (currentRole === 'Super Admin' || (mod.allowedRoles?.includes(currentRole)));
              const hasSubmodules = mod.submodules && mod.submodules.length > 0;
              return (
                <div
                  key={mod.id}
                  className={cn(
                    "text-left rounded-2xl border transition-all duration-300 flex flex-col group relative overflow-hidden shadow-sm",
                    canAccess
                      ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-[#2960DC] dark:hover:border-[#4F84F6] hover:shadow-xl"
                      : "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 opacity-60 grayscale"
                  )}
                >
                  {canAccess && <div className="absolute inset-0 bg-gradient-to-br from-[#2960DC]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />}

                  {/* Clickable card body — launches module */}
                  <button
                    disabled={!canAccess}
                    onClick={() => handleModuleClick(mod)}
                    className="p-6 flex flex-col flex-1 text-left w-full disabled:cursor-not-allowed"
                    style={{ minHeight: '220px' }}
                  >
                    {/* Data Scope Badge */}
                    {canAccess && mod.dataScope && (
                      <div className={cn(
                        "absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border",
                        mod.dataScope === 'global'      && 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400',
                        mod.dataScope === 'enterprise'  && 'bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-400',
                        mod.dataScope === 'site'        && 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400',
                        mod.dataScope === 'role-driven' && 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400',
                      )}>
                        {mod.dataScope === 'global'      && <><Globe className="w-2.5 h-2.5 mr-0.5" />Global</>}
                        {mod.dataScope === 'enterprise'  && <><Network className="w-2.5 h-2.5 mr-0.5" />Group</>}
                        {mod.dataScope === 'site'        && <><Building2 className="w-2.5 h-2.5 mr-0.5" />Site</>}
                        {mod.dataScope === 'role-driven' && <><Network className="w-2.5 h-2.5 mr-0.5" />Flexible</>}
                      </div>
                    )}

                    <div className={cn(
                      "w-14 h-14 rounded-xl flex items-center justify-center mb-5 transition-colors shadow-sm shrink-0",
                      canAccess
                        ? "bg-slate-100 dark:bg-slate-700 text-[#2960DC] dark:text-[#4F84F6] group-hover:bg-[#2960DC] group-hover:text-white border border-slate-200 dark:border-slate-600 group-hover:border-[#2960DC]"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                    )}>
                      <Icon className="w-7 h-7" />
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 tracking-tight">{mod.title}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{mod.desc}</p>

                    {!mod.active && (
                      <span className="absolute top-4 right-4 text-[10px] uppercase tracking-wider font-bold text-slate-400 bg-slate-200 dark:bg-slate-700 dark:text-slate-300 px-2 py-1 rounded-full">
                        Upcoming
                      </span>
                    )}
                  </button>

                  {/* Footer: sub-module count + enter cue */}
                  {hasSubmodules && canAccess && (
                    <div className="border-t border-slate-100 dark:border-slate-700/50">
                      <div className="w-full flex items-center justify-between px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-[#2960DC] dark:group-hover:text-[#4F84F6] transition-colors pointer-events-none">
                        <span>{mod.submodules.length} Sub-module{mod.submodules.length !== 1 ? 's' : ''}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ---- Site Selector Modal ---- */}
      {showSiteSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-[#2960DC] to-[#1a3fa8] p-8 text-white">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Select Working Site</h2>
                  <p className="text-blue-200 text-sm">Choose the facility you are currently working at</p>
                </div>
              </div>
              <p className="text-[11px] text-blue-200/80 mt-3">All modules will filter data to your selected site.</p>
            </div>
            <div className="p-6 space-y-3 max-h-[55vh] overflow-y-auto">
              {userFacilities.map(facility => {
                const isActive = activeSite?.facilityId === facility.id;
                return (
                  <button
                    key={facility.id}
                    onClick={() => {
                      const site: ActiveSiteContext = {
                        facilityId: facility.id,
                        facilityTitle: facility.title,
                        facilityCode: facility.facilityCode,
                      };
                      setActiveSite(site);
                      setActiveSiteState(site);
                      setShowSiteSelector(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all duration-200 group",
                      isActive
                        ? "border-[#2960DC] bg-blue-50 dark:bg-blue-900/20 shadow-md"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-[#2960DC]/50 hover:shadow-md hover:-translate-y-0.5"
                    )}
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                      isActive ? "bg-[#2960DC] text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 group-hover:bg-[#2960DC]/10 group-hover:text-[#2960DC]"
                    )}>
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("font-bold text-base", isActive ? "text-[#2960DC] dark:text-[#5fa2f6]" : "text-slate-800 dark:text-slate-200")}>{facility.title}</p>
                      {facility.facilityCode && <p className="text-[11px] font-mono text-slate-400 mt-0.5">Code: {facility.facilityCode}</p>}
                    </div>
                    {isActive && (
                      <div className="w-6 h-6 rounded-full bg-[#2960DC] flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {activeSite && (
              <div className="px-6 pb-6">
                <button
                  onClick={() => setShowSiteSelector(false)}
                  className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm"
                >
                  Continue with {activeSite.facilityTitle}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Role Identity Drawer ─────────────────────────────────────── */}
      {showRoleDrawer && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] transition-opacity"
            onClick={() => setShowRoleDrawer(false)}
          />
          {/* Drawer */}
          <aside className="fixed top-0 right-0 h-full w-full max-w-xl z-[70] flex flex-col bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-300">

            {/* Drawer Header */}
            <div className="relative bg-gradient-to-br from-[#2960DC] to-[#1a3fa0] p-6 shrink-0">
              <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/5 -mr-10 -mt-10 blur-2xl" />
              <button
                onClick={() => setShowRoleDrawer(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0 border border-white/20 shadow-lg">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1">Your Active Role</p>
                  <h2 className="text-xl font-extrabold text-white leading-snug">{currentRole}</h2>
                  <div className="flex items-center gap-2 mt-1.5">
                    {currentRoleObj?.scope && (
                      <span className={cn(
                        "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                        currentRoleObj.scope === 'Global'     && 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/30',
                        currentRoleObj.scope === 'Enterprise' && 'bg-violet-400/20 text-violet-200 border border-violet-400/30',
                        currentRoleObj.scope === 'Site'       && 'bg-sky-400/20 text-sky-200 border border-sky-400/30',
                        !['Global','Enterprise','Site'].includes(currentRoleObj.scope) && 'bg-amber-400/20 text-amber-200 border border-amber-400/30',
                      )}>
                        {currentRoleObj.scope} scope
                      </span>
                    )}
                    {currentRoleObj?.isCoreLocked && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/60 border border-white/20 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Core Locked
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto">

              {/* Description */}
              {currentRoleObj?.description && (
                <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Role Description</h3>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{currentRoleObj.description}</p>
                </div>
              )}

              {/* Authority Matrix */}
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                    <LayoutGrid className="w-4 h-4 text-[#2960DC] dark:text-[#4F84F6]" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Authority Matrix</h3>
                  <span className="ml-auto text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Module Access</span>
                </div>
                <div className="space-y-1">
                  {allModules.map(mod => {
                    // @ts-ignore
                    const ModIco = Icons[mod.iconName] || Icons.Box;
                    const hasAccess = currentRole === 'Super Admin' || mod.allowedRoles?.includes(currentRole);
                    const childCount = mod.submodules?.length || 0;
                    return (
                      <div key={mod.id} className={cn(
                        "rounded-xl border px-4 py-3 transition-all",
                        hasAccess
                          ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800"
                          : "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 opacity-60"
                      )}>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                            hasAccess ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" : "bg-slate-200 dark:bg-slate-700 text-slate-400"
                          )}>
                            <ModIco className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm font-semibold truncate", hasAccess ? "text-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-500")}>
                              {mod.title}
                            </p>
                            {childCount > 0 && (
                              <p className="text-[10px] text-slate-400 dark:text-slate-500">{childCount} sub-module{childCount > 1 ? 's' : ''}</p>
                            )}
                          </div>
                          {hasAccess
                            ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                            : <XCircle className="w-5 h-5 text-slate-300 dark:text-slate-600 shrink-0" />
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Corporate Flare */}
              <div className="px-6 py-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Corporate Flare</h3>
                  <span className="ml-auto text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Facility Access</span>
                </div>
                {userFacilities.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 dark:text-slate-500">
                    <Globe className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">Global scope — all facilities accessible</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {userFacilities.map((fac, idx) => (
                      <div key={fac.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 hover:border-violet-200 dark:hover:border-violet-800 transition-all group">
                        <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0 group-hover:bg-violet-200 dark:group-hover:bg-violet-900/60 transition-colors">
                          <Building2 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{fac.title}</p>
                          {fac.facilityCode && (
                            <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{fac.facilityCode}</p>
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-800">
                          Authorized
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>{/* /body */}

            {/* Drawer Footer */}
            <div className="shrink-0 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {allModules.filter(m => currentRole === 'Super Admin' || m.allowedRoles?.includes(currentRole)).length} of {allModules.length} modules accessible
              </p>
              <button
                onClick={() => setShowRoleDrawer(false)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                Close
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
