/**
 * ModuleLayout — Shared layout for all dynamic module pages (landing + workspace).
 * Matches the Super Admin DNA: left sidebar + blue top header + scrollable content.
 */
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ChevronRight, Sun, Moon, Home,
  Globe, Network, Building2, Search, Zap
} from "lucide-react";
import * as Icons from "lucide-react";
import { cn } from "@/src/lib/utils";
import { ModuleNode } from "../../lib/moduleStorage";
import { getAuthSession } from "../../lib/authSession";
import { UserAvatarMenu } from "../UserAvatarMenu";

interface ModuleLayoutProps {
  /** The module this page represents */
  module: ModuleNode;
  /** Ancestor chain (root → direct parent), empty for top-level modules */
  ancestors: ModuleNode[];
  /** Optional: sub-modules to list in sidebar (for landing pages) */
  sidebarItems?: ModuleNode[];
  /** Called when a sidebar sub-item is clicked */
  onSidebarItemClick?: (node: ModuleNode) => void;
  /** Active sub-item ID (for sidebar highlight) */
  activeSidebarId?: string;
  children: React.ReactNode;
}

export function ModuleLayout({
  module,
  ancestors,
  sidebarItems,
  onSidebarItemClick,
  activeSidebarId,
  children,
}: ModuleLayoutProps) {
  const navigate = useNavigate();
  const session = getAuthSession();
  const [darkMode, setDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (localStorage.getItem("darkMode") === "true") {
      document.documentElement.classList.add("dark");
      setDarkMode(true);
    }
  }, []);

  const toggleDarkMode = () => {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("darkMode", String(isDark));
    setDarkMode(isDark);
  };

  // @ts-ignore dynamic icon
  const ModIcon = Icons[module.iconName] || Icons.Box;

  const scopeLabels: Record<string, { label: string; cls: string }> = {
    global:        { label: "Global",   cls: "bg-emerald-500/20 text-emerald-200" },
    enterprise:    { label: "Group",    cls: "bg-violet-500/20 text-violet-200"   },
    site:          { label: "Site",     cls: "bg-blue-400/20 text-blue-100"       },
    "role-driven": { label: "Flexible", cls: "bg-amber-400/20 text-amber-200"     },
  };
  const scope = module.dataScope ? scopeLabels[module.dataScope] : null;

  return (
    <div className="flex h-screen antialiased bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 transition-colors overflow-hidden">

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="w-72 flex flex-col shrink-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.05)] transition-colors overflow-hidden">

        {/* Logo */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <img src="/logos/Logo Horizontal.png" className="h-11 object-contain hidden dark:block brightness-0 invert" alt="CLINIcare" />
          <img src="/logos/Logo Horizontal.png" className="h-11 object-contain dark:hidden" alt="CLINIcare" />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">

          {/* Home */}
          <button
            onClick={() => navigate("/")}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-[#2960DC] dark:hover:text-[#4F84F6] rounded-lg transition-colors text-sm font-medium"
          >
            <Home className="w-4 h-4 shrink-0" />
            <span>Master Portal</span>
          </button>

          {/* Ancestor breadcrumb trail */}
          {ancestors.length > 0 && (
            <div className="pt-2 pb-1">
              <p className="px-3 text-[9px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 mb-1">Path</p>
              {ancestors.map((anc, idx) => {
                // @ts-ignore
                const AncIcon = Icons[anc.iconName] || Icons.Box;
                const target = anc.submodules?.length ? `/module/${anc.id}` : `/module-page/${anc.id}`;
                return (
                  <button
                    key={anc.id}
                    onClick={() => navigate(target)}
                    style={{ paddingLeft: `${0.75 + idx * 0.75}rem` }}
                    className="w-full flex items-center gap-2 pr-3 py-2 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-[#2960DC] dark:hover:text-[#4F84F6] rounded-lg transition-colors text-sm"
                  >
                    <AncIcon className="w-3.5 h-3.5 shrink-0 opacity-60" />
                    <span className="truncate">{anc.title}</span>
                    <ChevronRight className="w-3 h-3 opacity-30 ml-auto shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Current module — highlighted */}
          <div className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm font-semibold",
            "bg-[#2960DC]/8 border-[#2960DC]/20 text-[#2960DC] dark:text-[#4F84F6] dark:bg-[#2960DC]/10 dark:border-[#2960DC]/20"
          )}>
            <ModIcon className="w-4 h-4 shrink-0" />
            <span className="truncate">{module.title}</span>
          </div>

          {/* Sub-items (landing page only) */}
          {sidebarItems && sidebarItems.length > 0 && (
            <div className="pt-2">
              <p className="px-3 text-[9px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 mb-1">
                Contents
              </p>
              {sidebarItems.map((item) => {
                // @ts-ignore
                const ItemIcon = Icons[item.iconName] || Icons.Box;
                const isActive = item.id === activeSidebarId;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSidebarItemClick?.(item)}
                    disabled={!item.active}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                      isActive
                        ? "bg-[#2960DC] text-white font-semibold shadow-sm"
                        : item.active
                          ? "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                          : "text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-50"
                    )}
                  >
                    <ItemIcon className="w-4 h-4 shrink-0" />
                    <span className="truncate flex-1">{item.title}</span>
                    {item.submodules?.length > 0 && (
                      <ChevronRight className="w-3 h-3 opacity-50 shrink-0" />
                    )}
                    {!item.active && (
                      <span className="text-[8px] uppercase font-bold opacity-60 shrink-0">Up</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0 text-center">
          <p className="text-[10px] text-slate-400 dark:text-slate-500">CLINIcare Pro © 2026</p>
        </div>
      </aside>

      {/* ── Main Area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Blue Header */}
        <header className="bg-[#2960DC] border-b border-white/10 px-6 py-4 flex items-center justify-between shrink-0 shadow-xl">

          {/* Left: icon + title + scope badge */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <ModIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-white leading-tight">{module.title}</h1>
                {scope && (
                  <span className={cn("text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", scope.cls)}>
                    {scope.label}
                  </span>
                )}
              </div>
              {/* Breadcrumb under title */}
              <div className="flex items-center gap-1 mt-0.5">
                <button onClick={() => navigate("/")} className="text-white/50 hover:text-white/90 transition-colors text-xs flex items-center gap-1">
                  <LayoutDashboard className="w-3 h-3" />
                  <span>Home</span>
                </button>
                {ancestors.map((anc) => (
                  <React.Fragment key={anc.id}>
                    <ChevronRight className="w-3 h-3 text-white/30" />
                    <button
                      onClick={() => navigate(anc.submodules?.length ? `/module/${anc.id}` : `/module-page/${anc.id}`)}
                      className="text-white/50 hover:text-white/90 transition-colors text-xs truncate max-w-[120px]"
                    >
                      {anc.title}
                    </button>
                  </React.Fragment>
                ))}
                <ChevronRight className="w-3 h-3 text-white/30" />
                <span className="text-white/80 text-xs font-medium truncate max-w-[160px]">{module.title}</span>
              </div>
            </div>
          </div>

          {/* Right: ARH shortcut + search + dark mode + avatar */}
          <div className="flex items-center gap-3">
            {sidebarItems && sidebarItems.length > 0 && (
              <div className="relative hidden md:block">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search sub-modules…"
                  className="w-56 px-4 py-2 pl-9 rounded-lg bg-white/10 border border-transparent focus:bg-white focus:text-[#2960DC] focus:border-white text-sm outline-none transition-all placeholder-white/50 text-white"
                />
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
              </div>
            )}

            {/* Action Routing Hub — persistent shortcut */}
            <button
              onClick={() => navigate('/action-hub')}
              title="Action Routing Hub"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 transition-all text-white group"
            >
              <Zap className="w-4 h-4 text-white group-hover:text-yellow-300 transition-colors" />
              <span className="text-xs font-bold tracking-wide hidden lg:block">ARH</span>
            </button>

            <button onClick={toggleDarkMode} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors">
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            {session && <UserAvatarMenu session={session} dark />}
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto">
          {/* Pass searchQuery as context if needed via children — keep it simple with cloneElement approach */}
          {React.Children.map(children, child => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child as React.ReactElement<any>, { _searchQuery: searchQuery });
            }
            return child;
          })}
        </main>
      </div>
    </div>
  );
}
