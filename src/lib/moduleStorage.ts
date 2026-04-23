/**
 * Module Storage — API Client
 * All module tree data is now persisted in PostgreSQL (jsonb) via the Express API.
 */

import { fetchWithAuth } from './authSession';

export type ModuleDataScope = 'global' | 'enterprise' | 'site' | 'role-driven';

export const SCOPE_RANK: Record<ModuleDataScope, number> = {
  'site':        1,
  'role-driven': 2,
  'enterprise':  3,
  'global':      4,
};

export interface ModuleNode {
  id: string;
  title: string;
  iconName: string;
  route: string;
  active: boolean;
  desc: string;
  allowedRoles: string[];
  submodules: ModuleNode[];
  isCore?: boolean;
  dataScope?: ModuleDataScope;
  isDirectLink?: boolean;
}

export const getModules = async (): Promise<ModuleNode[]> => {
  const res = await fetchWithAuth('/api/config/modules_tree');
  if (!res.ok) throw new Error('Failed to fetch modules tree');
  return res.json();
};

export const saveModules = async (modules: ModuleNode[]): Promise<void> => {
  const res = await fetchWithAuth('/api/config/modules_tree', {
    method: 'PUT',

    body: JSON.stringify(modules),
  });
  if (!res.ok) throw new Error('Failed to save modules tree');
};

/** @deprecated — use getModules() async instead */
export const getModulesState = (): ModuleNode[] => {
  console.warn('[moduleStorage] getModulesState() is deprecated — use getModules() async instead.');
  return [];
};

/** @deprecated */
export const saveModulesState = (_modules: ModuleNode[]) => {
  console.warn('[moduleStorage] saveModulesState() is deprecated — use saveModules() async instead.');
};

/** @deprecated */
export const resetModulesToDefault = (): ModuleNode[] => {
  console.warn('[moduleStorage] resetModulesToDefault() is deprecated.');
  return [];
};
