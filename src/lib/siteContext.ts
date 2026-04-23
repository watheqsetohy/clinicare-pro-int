/**
 * Session-level Site & Scope Context
 * Stored in sessionStorage (resets on browser close, not localStorage)
 */

import type { ModuleDataScope } from './moduleStorage';

export interface ActiveSiteContext {
  facilityId: string;
  facilityTitle: string;
  facilityCode?: string;
}

/** Enterprise scope: all facility IDs the user is authorized for (for 'enterprise' and 'role-driven' modules) */
export interface EnterpriseScope {
  authorizedFacilityIds: string[];
  authorizedFacilityTitles: string[];
}

const SESSION_KEY = 'clinicare_active_site';
const ENTERPRISE_KEY = 'clinicare_enterprise_scope';

// ---- Active Site (single facility) ----
export const getActiveSite = (): ActiveSiteContext | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveSiteContext;
  } catch {
    return null;
  }
};

export const setActiveSite = (site: ActiveSiteContext): void => {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(site));
};

export const clearActiveSite = (): void => {
  sessionStorage.removeItem(SESSION_KEY);
};

// ---- Enterprise Scope (all authorized facilities) ----
export const getEnterpriseScope = (): EnterpriseScope | null => {
  try {
    const raw = sessionStorage.getItem(ENTERPRISE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EnterpriseScope;
  } catch {
    return null;
  }
};

export const setEnterpriseScope = (scope: EnterpriseScope): void => {
  sessionStorage.setItem(ENTERPRISE_KEY, JSON.stringify(scope));
};

/**
 * Resolve the effective data scope context for a given module's dataScope setting.
 * Returns a human-readable label and facility context for use by any module.
 */
export const resolveModuleScope = (dataScope: ModuleDataScope) => {
  const activeSite = getActiveSite();
  const enterpriseScope = getEnterpriseScope();

  switch (dataScope) {
    case 'global':
      return {
        label: 'Global — All Facilities',
        facilityIds: null, // no filter
        isGlobal: true,
      };
    case 'site':
      return {
        label: activeSite?.facilityTitle || 'No Site Selected',
        facilityIds: activeSite ? [activeSite.facilityId] : [],
        isGlobal: false,
      };
    case 'enterprise':
      return {
        label: `Enterprise (${enterpriseScope?.authorizedFacilityIds.length ?? 0} facilities)`,
        facilityIds: enterpriseScope?.authorizedFacilityIds || [],
        isGlobal: false,
      };
    case 'role-driven':
    default:
      // Falls back to site if no enterprise scope, role-driven uses all authorized facilities
      return {
        label: enterpriseScope
          ? `Group View (${enterpriseScope.authorizedFacilityIds.length} facilities)`
          : activeSite?.facilityTitle || 'No Site Selected',
        facilityIds: enterpriseScope?.authorizedFacilityIds || (activeSite ? [activeSite.facilityId] : []),
        isGlobal: false,
      };
  }
};

