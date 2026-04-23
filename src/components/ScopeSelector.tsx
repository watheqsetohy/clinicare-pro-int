/**
 * ScopeSelector — A reusable scope switcher component for dashboards.
 * 
 * Usage:
 *   <ScopeSelector dataScope="role-driven" availableScopes={['site', 'enterprise']} onChange={setScope} />
 *
 * Modules with dataScope='global' never show this — they see everything.
 * Modules with dataScope='site' show only the active facility (no switcher needed unless user wants to confirm).
 * Modules with dataScope='role-driven' show the full switcher so the user can pick Site / Area / Group view.
 */

import React, { useState } from 'react';
import { Globe, Building2, Network, ChevronDown, Check, Map } from 'lucide-react';
import type { ModuleDataScope } from '../lib/moduleStorage';
import { getActiveSite, getEnterpriseScope, resolveModuleScope } from '../lib/siteContext';

export type ScopeLevel = 'site' | 'enterprise' | 'global';

interface ScopeSelectorProps {
  /** The module's declared dataScope — determines which options are available */
  dataScope: ModuleDataScope;
  /** Controlled: currently selected scope level */
  value: ScopeLevel;
  /** Callback when user changes scope */
  onChange: (scope: ScopeLevel) => void;
  className?: string;
}

const SCOPE_META: Record<ScopeLevel, { label: string; icon: React.ReactNode; color: string }> = {
  site: {
    label: 'Site View',
    icon: <Building2 className="w-3.5 h-3.5" />,
    color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800',
  },
  enterprise: {
    label: 'Group View',
    icon: <Network className="w-3.5 h-3.5" />,
    color: 'text-violet-600 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-900/20 dark:border-violet-800',
  },
  global: {
    label: 'Global View',
    icon: <Globe className="w-3.5 h-3.5" />,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800',
  },
};

export function ScopeSelector({ dataScope, value, onChange, className = '' }: ScopeSelectorProps) {
  const [open, setOpen] = useState(false);
  const activeSite = getActiveSite();
  const enterpriseScope = getEnterpriseScope();

  // Determine which scope options are available for this module
  const availableScopes: ScopeLevel[] = (() => {
    if (dataScope === 'global') return ['global'];
    if (dataScope === 'site') return ['site'];
    if (dataScope === 'enterprise') return ['enterprise'];
    // role-driven: show all available based on user data
    const opts: ScopeLevel[] = [];
    if (activeSite) opts.push('site');
    if (enterpriseScope && enterpriseScope.authorizedFacilityIds.length > 1) opts.push('enterprise');
    return opts;
  })();

  // If only one option, don't show a switcher — just display the badge
  if (availableScopes.length <= 1) {
    const scope = availableScopes[0] || 'site';
    const meta = SCOPE_META[scope];
    const resolved = resolveModuleScope(dataScope);
    return (
      <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${meta.color} ${className}`}>
        {meta.icon}
        <span>{resolved.label}</span>
      </div>
    );
  }

  const current = SCOPE_META[value];

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${current.color}`}
      >
        {current.icon}
        <span>{current.label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-0 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden min-w-[200px] animate-in fade-in zoom-in-95 duration-150">
          <div className="p-2 space-y-0.5">
            {availableScopes.map(scope => {
              const meta = SCOPE_META[scope];
              const isActive = value === scope;
              // Build a context label for this scope option
              const contextLabel = (() => {
                if (scope === 'site') return activeSite?.facilityTitle || 'Active Site';
                if (scope === 'enterprise') return `${enterpriseScope?.authorizedFacilityIds.length ?? 0} Facilities`;
                return 'All Data';
              })();

              return (
                <button
                  key={scope}
                  onClick={() => { onChange(scope); setOpen(false); }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors ${
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-800'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${meta.color}`}>
                    {meta.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{meta.label}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{contextLabel}</p>
                  </div>
                  {isActive && <Check className="w-4 h-4 text-[#2960DC]" />}
                </button>
              );
            })}
          </div>
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700">
            <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
              Data will filter to selected scope
            </p>
          </div>
        </div>
      )}

      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  );
}

/**
 * Hook for using scope in any module component.
 * Returns the current scope level and a setter.
 */
export function useModuleScope(dataScope: ModuleDataScope): [ScopeLevel, (s: ScopeLevel) => void] {
  const defaultScope = (): ScopeLevel => {
    if (dataScope === 'global') return 'global';
    if (dataScope === 'enterprise') return 'enterprise';
    return 'site';
  };
  const [scope, setScope] = useState<ScopeLevel>(defaultScope);
  return [scope, setScope];
}
