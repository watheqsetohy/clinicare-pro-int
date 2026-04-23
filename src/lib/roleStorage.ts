/**
 * Role Storage — API Client
 * All role data is now persisted in PostgreSQL via the Express API.
 */

import { fetchWithAuth } from './authSession';

export type EnterpriseScope = string;

export interface Role {
  id: string;
  name: string;
  description: string;
  isCoreLocked: boolean;
  scope: EnterpriseScope;
  targetTags?: string[];
  active?: boolean;
}

const API = '/api/roles';

export const getRoles = async (): Promise<Role[]> => {
  const res = await fetchWithAuth(API);
  if (!res.ok) throw new Error('Failed to fetch roles');
  return res.json();
};

export const createRole = async (role: Role): Promise<{ id: string }> => {
  const res = await fetchWithAuth(API, {
    method: 'POST',

    body: JSON.stringify(role),
  });
  if (!res.ok) throw new Error('Failed to create role');
  return res.json();
};

export const updateRole = async (role: Role): Promise<void> => {
  const res = await fetchWithAuth(`${API}/${role.id}`, {
    method: 'PUT',
    body: JSON.stringify(role),
  });
  if (!res.ok) throw new Error('Failed to update role');
};

export const deleteRole = async (id: string): Promise<void> => {
  const res = await fetchWithAuth(`${API}/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to delete role');
  }
};

/** @deprecated — use getRoles() async instead */
export const getRolesState = (): Role[] => {
  console.warn('[roleStorage] getRolesState() is deprecated — use getRoles() async instead.');
  return [];
};

/** @deprecated */
export const saveRolesState = (_roles: Role[]) => {
  console.warn('[roleStorage] saveRolesState() is deprecated — use updateRole() API instead.');
};

/** @deprecated */
export const resetRolesToDefault = (): Role[] => {
  console.warn('[roleStorage] resetRolesToDefault() is deprecated.');
  return [];
};
