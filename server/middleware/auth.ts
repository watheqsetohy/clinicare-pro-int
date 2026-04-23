/**
 * JWT Authentication Middleware
 * Verifies Bearer tokens on every protected API route.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  userId: string;
  loginId: string;
  roleId: string;
  corporateNodeIds: string[];
}

/** Extend Express Request with typed user payload */
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized — authentication required.' });
    return;
  }

  const token = header.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error('[Auth] JWT_SECRET is not set in environment.');
    res.status(500).json({ error: 'Server configuration error.' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as AuthPayload;
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
}

/** Generate a signed JWT for a successfully authenticated user. */
export function issueToken(payload: AuthPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured.');
  return jwt.sign(payload, secret, { expiresIn: '8h' });
}
