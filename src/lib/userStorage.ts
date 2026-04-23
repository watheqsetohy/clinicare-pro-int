/**
 * User Storage — API Client
 * All user data is now persisted in PostgreSQL via the Express API.
 */

export interface UserProfile {
  id: string;
  fullName: string;
  loginId: string;
  roleId: string;
  corporateNodeIds: string[];
  lexiconTags?: string[];
  status: 'Active' | 'Suspended';
  isTempPassword: boolean;
  passwordHash: string;
  photo?: string;
  phones?: string[];
  email?: string;
}

import { fetchWithAuth } from './authSession';

const API = '/api/users';

export const getUsers = async (): Promise<UserProfile[]> => {
  const res = await fetchWithAuth(API);
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
};

/** Fetch the current authenticated user's own profile — no admin RBAC required. */
export const getMyProfile = async (): Promise<UserProfile> => {
  const res = await fetchWithAuth('/api/users/me');
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
};

export const createUser = async (user: UserProfile): Promise<{ id: string }> => {
  const res = await fetchWithAuth(API, {
    method: 'POST',
    body: JSON.stringify(user),
  });
  if (!res.ok) throw new Error('Failed to create user');
  return res.json();
};

export const updateUser = async (user: UserProfile): Promise<void> => {
  const res = await fetchWithAuth(`${API}/${user.id}`, {
    method: 'PUT',
    body: JSON.stringify(user),
  });
  if (!res.ok) throw new Error('Failed to update user');
};

export const deleteUser = async (id: string): Promise<void> => {
  const res = await fetchWithAuth(`${API}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete user');
};

export const changePassword = async (userId: string, newPassword: string, isTemp: boolean = false): Promise<void> => {
  const res = await fetchWithAuth(`${API}/${userId}/password`, {
    method: 'PUT',
    body: JSON.stringify({ newPassword, isTemp }),
  });
  if (!res.ok) throw new Error('Failed to change password');
};

/** @deprecated — kept for compatibility. Use getUsers() instead. */
export const getUsersState = (): UserProfile[] => {
  console.warn('[userStorage] getUsersState() is deprecated — use getUsers() async instead.');
  return [];
};

/** Mock hash — kept for compatibility with existing components.
 *  Real password changes should use the changePassword() API function. */
export const mockHashPassword = (password: string): string => {
  return btoa(password + '_clinipro_salt').split('').reverse().join('');
};

/** @deprecated */
export const saveUsersState = (_users: UserProfile[]) => {
  console.warn('[userStorage] saveUsersState() is deprecated — use updateUser() API instead.');
};
