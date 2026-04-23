import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ShieldAlert, ChevronRight, Globe, Network, Building2, Home } from "lucide-react";
import * as Icons from "lucide-react";
import { cn } from "@/src/lib/utils";
import { getModules, ModuleNode } from "../lib/moduleStorage";
import { getAuthSession } from "../lib/authSession";
import { getRoles } from "../lib/roleStorage";
import { ModuleLayout } from "../components/layout/ModuleLayout";

// ── Helpers ──────────────────────────────────────────────────────────────────

const findNodeById = (nodes: ModuleNode[], id: string): ModuleNode | null => {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.submodules?.length) {
      const found = findNodeById(n.submodules, id);
      if (found) return found;
    }
  }
  return null;
};

const buildAncestors = (
  nodes: ModuleNode[],
  targetId: string,
  chain: ModuleNode[] = []
): ModuleNode[] | null => {
  for (const n of nodes) {
    if (n.id === targetId) return chain;
    if (n.submodules?.length) {
      const result = buildAncestors(n.submodules, targetId, [...chain, n]);
      if (result !== null) return result;
    }
  }
  return null;
};

// ── Scope badge helper ────────────────────────────────────────────────────────

const ScopeBadge = ({ scope }: { scope?: string }) => {
  if (!scope) return null;
  const cfgs: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    global:        { cls: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400", icon: <Globe className="w-2.5 h-2.5 mr-0.5" />,    label: "Global"   },
    enterprise:    { cls: "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-400",     icon: <Network className="w-2.5 h-2.5 mr-0.5" />,   label: "Group"    },
    site:          { cls: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400",                  icon: <Building2 className="w-2.5 h-2.5 mr-0.5" />, label: "Site"     },
    "role-driven": { cls: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400",           icon: <Network className="w-2.5 h-2.5 mr-0.5" />,   label: "Flexible" },
  };
  const cfg = cfgs[scope];
  if (!cfg) return null;
  return (
    <span className={cn("flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border", cfg.cls)}>
      {cfg.icon}{cfg.label}
    </span>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ModuleLandingPage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();

  const session = getAuthSession();

  const [parentModule, setParentModule] = useState<ModuleNode | null>(null);
  const [ancestors, setAncestors] = useState<ModuleNode[]>([]);
  const [deniedModule, setDeniedModule] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentRole, setCurrentRole] = useState('Guest');

  useEffect(() => {
    if (!moduleId) return;
    const load = async () => {
      const [allModules, roles] = await Promise.all([getModules(), getRoles()]);
      const session = getAuthSession();
      if (session) {
        const role = roles.find(r => r.id === session.roleId);
        setCurrentRole(role?.name || 'Guest');
      }
      const found = findNodeById(allModules, moduleId);
      setParentModule(found);
      const chain = buildAncestors(allModules, moduleId) ?? [];
      setAncestors(chain);
    };
    load().catch(console.error);
  }, [moduleId]);

  const handleSubClick = (sub: ModuleNode) => {
    if (!sub.active) return;

    // Hierarchical guard: if ANY ancestor (including the current parent) blocks this role,
    // the child is also blocked — parent permission is a prerequisite for child access
    const parentChainBlocked = currentRole !== 'Super Admin' &&
      [...ancestors, ...(parentModule ? [parentModule] : [])].some(
        anc => Array.isArray(anc.allowedRoles) && !anc.allowedRoles.includes(currentRole)
      );

    if (
      parentChainBlocked ||
      (sub.allowedRoles &&
        !sub.allowedRoles.includes(currentRole) &&
        currentRole !== "Super Admin")
    ) {
      setDeniedModule(sub.title);
      setTimeout(() => setDeniedModule(null), 3500);
      return;
    }
    if (sub.submodules && sub.submodules.length > 0) {
      navigate(`/module/${sub.id}`);
      return;
    }
    if (sub.isDirectLink && sub.route && sub.route !== "#") {
      navigate(sub.route);
      return;
    }
    navigate(`/module-page/${sub.id}`);
  };

  if (!parentModule) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <ShieldAlert className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p className="font-semibold text-lg">Module not found.</p>
          <button onClick={() => navigate("/")} className="mt-4 text-sm text-[#2960DC] hover:underline">
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  const submodules = parentModule.submodules || [];
  const filtered = searchQuery
    ? submodules.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : submodules;

  // Parent-chain access guard:
  // If the current parent (or any of its ancestors) does NOT include the role,
  // every child is automatically blocked — parent access is a prerequisite.
  const isParentLineBlocked = currentRole !== 'Super Admin' &&
    [...ancestors, parentModule].some(
      anc => Array.isArray(anc.allowedRoles) && !anc.allowedRoles.includes(currentRole)
    );

  return (
    <ModuleLayout
      module={parentModule}
      ancestors={ancestors}
      sidebarItems={submodules}
      onSidebarItemClick={handleSubClick}
    >
      {/* Access Denied Toast */}
      <div className={cn(
        "fixed top-24 left-1/2 -translate-x-1/2 min-w-[300px] z-50 transition-all duration-300 pointer-events-none",
        deniedModule ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
      )}>
        <div className="bg-red-50 dark:bg-red-900/90 border-2 border-red-200 dark:border-red-700 text-red-600 dark:text-red-100 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4">
          <ShieldAlert className="w-8 h-8 shrink-0 text-red-500" />
          <div>
            <h3 className="font-bold text-sm">Access Denied</h3>
            <p className="text-xs mt-0.5 opacity-90">
              Your <span className="font-bold">"{currentRole}"</span> credentials do not permit access to{" "}
              <span className="font-semibold italic">[{deniedModule}]</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-8">

        {/* ── Navigation Map ── */}
        <div className="mb-8">
          <div className="flex items-center flex-wrap gap-0">

            {/* Home node */}
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-[#2960DC] hover:text-[#2960DC] dark:hover:text-[#4F84F6] transition-all text-xs font-semibold shadow-sm group"
            >
              <Home className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              <span>Home</span>
            </button>

            {/* Ancestor nodes */}
            {ancestors.map((anc) => {
              // @ts-ignore
              const AncIcon = Icons[anc.iconName] || Icons.Box;
              const target = anc.submodules?.length ? `/module/${anc.id}` : `/module-page/${anc.id}`;
              return (
                <React.Fragment key={anc.id}>
                  {/* Connector line + arrow */}
                  <div className="flex items-center mx-1 gap-0.5">
                    <div className="w-6 h-px bg-slate-300 dark:bg-slate-600" />
                    <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500 -ml-1" />
                  </div>
                  <button
                    onClick={() => navigate(target)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-[#2960DC] hover:text-[#2960DC] dark:hover:text-[#4F84F6] transition-all text-xs font-semibold shadow-sm group max-w-[160px]"
                  >
                    <AncIcon className="w-3.5 h-3.5 shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="truncate">{anc.title}</span>
                  </button>
                </React.Fragment>
              );
            })}

            {/* Connector to current */}
            <div className="flex items-center mx-1 gap-0.5">
              <div className="w-6 h-px bg-[#2960DC]/40 dark:bg-[#4F84F6]/40" />
              <ChevronRight className="w-3 h-3 text-[#2960DC]/60 dark:text-[#4F84F6]/60 -ml-1" />
            </div>

            {/* Current module node — highlighted */}
            {(() => {
              // @ts-ignore
              const CurrIcon = Icons[parentModule.iconName] || Icons.Box;
              return (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2960DC] border border-[#2960DC] text-white text-xs font-bold shadow-md shadow-[#2960DC]/25 max-w-[200px]">
                  <CurrIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{parentModule.title}</span>
                </div>
              );
            })()}

            {/* Trailing dots hint — sub-modules follow */}
            {submodules.length > 0 && (
              <div className="flex items-center mx-1 gap-1">
                <div className="w-6 h-px bg-slate-200 dark:bg-slate-700" />
                <div className="flex gap-0.5">
                  {Array.from({ length: Math.min(submodules.length, 3) }).map((_, i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                  ))}
                  {submodules.length > 3 && (
                    <span className="text-[9px] text-slate-400 ml-0.5 font-bold">+{submodules.length - 3}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* thin separator */}
          <div className="mt-5 h-px bg-slate-100 dark:bg-slate-700/60" />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <ShieldAlert className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p className="font-semibold text-lg">
              {searchQuery ? "No sub-modules match your search." : "No sub-modules configured yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-400">
            {filtered.map((sub) => {
              // @ts-ignore dynamic icon
              const SubIcon = Icons[sub.iconName] || Icons.Box;
              const canAccess =
                !isParentLineBlocked &&
                sub.active &&
                (currentRole === "Super Admin" || sub.allowedRoles?.includes(currentRole));
              const hasChildren = sub.submodules && sub.submodules.length > 0;

              return (
                <button
                  key={sub.id}
                  disabled={!canAccess}
                  onClick={() => handleSubClick(sub)}
                  className={cn(
                    "text-left rounded-xl border transition-all duration-300 flex flex-col group relative overflow-hidden shadow-sm p-6",
                    canAccess
                      ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-[#2960DC] dark:hover:border-[#4F84F6] hover:shadow-xl cursor-pointer"
                      : "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 opacity-60 grayscale cursor-not-allowed"
                  )}
                >
                  {canAccess && (
                    <div className="absolute inset-0 bg-gradient-to-br from-[#2960DC]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  )}

                  {/* Scope badge */}
                  {canAccess && sub.dataScope && (
                    <div className="absolute top-3 right-3">
                      <ScopeBadge scope={sub.dataScope} />
                    </div>
                  )}

                  {/* Icon */}
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors shadow-sm shrink-0 border",
                    canAccess
                      ? "bg-slate-100 dark:bg-slate-700 text-[#2960DC] dark:text-[#4F84F6] group-hover:bg-[#2960DC] group-hover:text-white border-slate-200 dark:border-slate-600 group-hover:border-[#2960DC]"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-500 border-slate-300 dark:border-slate-600"
                  )}>
                    <SubIcon className="w-6 h-6" />
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5 tracking-tight leading-snug">
                    {sub.title}
                  </h3>
                  {sub.desc && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                      {sub.desc}
                    </p>
                  )}

                  <div className="mt-auto pt-3 flex items-center justify-between">
                    {hasChildren ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {sub.submodules!.length} sub-module{sub.submodules!.length !== 1 ? "s" : ""}
                      </span>
                    ) : <span />}
                    {canAccess && (
                      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-[#2960DC] dark:group-hover:text-[#4F84F6] transition-colors shrink-0" />
                    )}
                  </div>

                  {!sub.active && (
                    <span className="absolute top-3 right-3 text-[10px] uppercase tracking-wider font-bold text-slate-400 bg-slate-200 dark:bg-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full">
                      Upcoming
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
