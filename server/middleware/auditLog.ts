/**
 * Audit Logging Middleware
 * Records PHI access and sensitive operations to the server console.
 * In production, redirect stdout/stderr to a rotating log file via the process manager.
 *
 * Format: JSON lines — easy to parse, grep, or forward to a SIEM.
 */

import { Request, Response, NextFunction } from 'express';

export function auditLog(action: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const entry = {
      ts:       new Date().toISOString(),
      action,
      userId:   req.user?.userId  ?? 'anonymous',
      loginId:  req.user?.loginId ?? 'anonymous',
      roleId:   req.user?.roleId  ?? 'none',
      resource: req.params.id ?? req.params.patientId ?? req.path,
      ip:       req.ip ?? req.socket?.remoteAddress ?? 'unknown',
      method:   req.method,
    };
    console.log('[AUDIT]', JSON.stringify(entry));
    next();
  };
}
