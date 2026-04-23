/**
 * Role-Based Access Control (RBAC) Middleware
 * Use after requireAuth — checks that the authenticated user holds one of the allowed roles.
 *
 * Access is granted if ANY of the following is true:
 *   1. The user's roleId is 'r_super' (Super Admin bypass)
 *   2. The user's roleId is in the explicit allowedRoleIds list
 *   3. The user's role has 'Global' scope in the database (enterprise-wide authority)
 */

import { Request, Response, NextFunction } from 'express';
import { query } from '../db.js';

// Cache role scopes to avoid hitting the DB on every request
const scopeCache = new Map<string, { scope: string; ts: number }>();
const CACHE_TTL = 60_000; // 60 seconds

async function getRoleScope(roleId: string): Promise<string | null> {
  const cached = scopeCache.get(roleId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.scope;

  try {
    const { rows } = await query('SELECT scope FROM roles WHERE id=$1', [roleId]);
    const scope = rows[0]?.scope || null;
    if (scope) scopeCache.set(roleId, { scope, ts: Date.now() });
    return scope;
  } catch {
    return null;
  }
}

/**
 * Restrict an endpoint to specific role IDs.
 * Super Admin ('r_super') and Global-scope roles always pass.
 *
 * @example
 *   app.delete('/api/users/:id', requireAuth, requireRole('r_super'), handler)
 *   app.post('/api/roles',       requireAuth, requireRole('r_super', 'r_admin'), handler)
 */
export function requireRole(...allowedRoleIds: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }
    // Super Admin always has access
    if (user.roleId === 'r_super') { next(); return; }
    // Check if user's role is in the allowed list
    if (allowedRoleIds.includes(user.roleId)) { next(); return; }
    // Check if user's role has Global scope (enterprise-wide authority)
    const scope = await getRoleScope(user.roleId);
    if (scope === 'Global' || scope === 'Corporate Group') { next(); return; }

    res.status(403).json({ error: 'Forbidden — insufficient privileges for this operation.' });
  };
}
