/**
 * Auth Session Utility
 * Login hits the PostgreSQL-backed API.
 * The JWT token is stored in sessionStorage and sent as Authorization header on all API calls.
 */

const AUTH_KEY  = 'clinicare_auth_session';
const TOKEN_KEY = 'clinicare_auth_token';

export interface AuthSession {
  userId: string;
  loginId: string;
  fullName: string;
  roleId: string;
  roleName?: string;
  corporateNodeIds: string[];
  lexiconTags?: string[];
  isTempPassword?: boolean;
}

export const getAuthSession = (): AuthSession | null => {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
};

export const setAuthSession = (session: AuthSession): void => {
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(session));
};

export const clearAuthSession = (): void => {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
};

export const isAuthenticated = (): boolean => {
  return getAuthSession() !== null && !!sessionStorage.getItem(TOKEN_KEY);
};

/** Get the stored JWT token for use in Authorization header. */
export const getAuthToken = (): string | null => {
  return sessionStorage.getItem(TOKEN_KEY);
};

/** Store the JWT token (called after successful login). */
export const setAuthToken = (token: string): void => {
  sessionStorage.setItem(TOKEN_KEY, token);
};

/**
 * Authenticated fetch — automatically attaches the Bearer token.
 * Use this for ALL API calls that require authentication.
 *
 * @example
 *   const res = await fetchWithAuth('/api/users');
 *   const res = await fetchWithAuth('/api/users', { method: 'POST', body: JSON.stringify(data) });
 */
export const fetchWithAuth = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, { ...options, headers });
};

/**
 * Attempt login via the PostgreSQL API.
 * Returns the user session on success, or an error string on failure.
 */
export const attemptLogin = async (
  loginId: string,
  password: string
): Promise<{ success: true; user: AuthSession } | { success: false; error: string }> => {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, password }),
    });

    const body = await res.json().catch(() => ({}));

    if (res.ok && body.token) {
      // Store JWT for subsequent API calls
      setAuthToken(body.token);

      return {
        success: true,
        user: {
          userId:           body.id,
          loginId:          body.loginId,
          fullName:         body.fullName,
          roleId:           body.roleId,
          roleName:         body.roleName,
          corporateNodeIds: body.corporateNodeIds ?? [],
          lexiconTags:      body.lexiconTags      ?? [],
          isTempPassword:   body.isTempPassword   ?? false,
        },
      };
    }

    return { success: false, error: body.error || 'Login failed. Please try again.' };
  } catch {
    return { success: false, error: 'Cannot reach the server. Please ensure the backend is running.' };
  }
};
