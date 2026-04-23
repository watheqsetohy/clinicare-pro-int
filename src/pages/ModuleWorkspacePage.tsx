import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ShieldAlert, Construction, Globe, Network, Building2 } from "lucide-react";
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

// ── Component ─────────────────────────────────────────────────────────────────

export function ModuleWorkspacePage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();

  const [mod, setMod] = useState<ModuleNode | null>(null);
  const [ancestors, setAncestors] = useState<ModuleNode[]>([]);
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
      setMod(found);
      const chain = buildAncestors(allModules, moduleId) ?? [];
      setAncestors(chain);
    };
    load().catch(console.error);
  }, [moduleId]);

  if (!mod) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Module not found.</p>
      </div>
    );
  }

  // @ts-ignore dynamic icon
  const ModIcon = Icons[mod.iconName] || Icons.Box;

  const scopeCfg: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    global:        { cls: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400", icon: <Globe className="w-3 h-3" />,    label: "Global"   },
    enterprise:    { cls: "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-400",     icon: <Network className="w-3 h-3" />,   label: "Group"    },
    site:          { cls: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400",                  icon: <Building2 className="w-3 h-3" />, label: "Site"     },
    "role-driven": { cls: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400",           icon: <Network className="w-3 h-3" />,   label: "Flexible" },
  };
  const scope = mod.dataScope ? scopeCfg[mod.dataScope] : null;

  return (
    <ModuleLayout module={mod} ancestors={ancestors}>
      <div className="p-8 max-w-3xl">

        {/* Module info card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden mb-8 animate-in fade-in slide-in-from-bottom-4 duration-400">
          <div className="h-1 bg-gradient-to-r from-[#2960DC] to-[#6B9FFF]" />
          <div className="p-6 flex items-start gap-5">
            <div className="w-16 h-16 rounded-2xl bg-[#2960DC] text-white flex items-center justify-center shadow-lg shadow-[#2960DC]/25 shrink-0">
              <ModIcon className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{mod.title}</h2>
                {scope && (
                  <span className={cn("flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border", scope.cls)}>
                    {scope.icon}{scope.label}
                  </span>
                )}
              </div>
              {mod.desc && (
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{mod.desc}</p>
              )}
              {mod.allowedRoles && mod.allowedRoles.length > 0 && (
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Access:</span>
                  {mod.allowedRoles.map((r) => (
                    <span
                      key={r}
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                        r === currentRole
                          ? "bg-[#2960DC] border-[#2960DC] text-white"
                          : "bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400"
                      )}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Workspace placeholder */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 p-16 flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-bottom-6 duration-500">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-5">
            <Construction className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-2">Module Under Development</h2>
          <p className="text-sm text-slate-400 dark:text-slate-500 max-w-sm leading-relaxed">
            The <span className="font-semibold text-slate-600 dark:text-slate-300">{mod.title}</span> workspace
            is registered and accessible. Its content interface is being developed
            and will be available in a future release.
          </p>
          <div className="mt-6 flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-[#2960DC] animate-pulse" />
            <span className="text-xs font-semibold text-[#2960DC] dark:text-[#4F84F6]">
              Route registered · Awaiting implementation
            </span>
          </div>
        </div>

      </div>
    </ModuleLayout>
  );
}
