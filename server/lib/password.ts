/**
 * Password Security — bcrypt-based hashing
 * Replaces the previous base64+reversal mock implementation.
 *
 * Migration: legacy hashes do NOT start with '$2b$'.
 * The login handler detects these and upgrades them on first login.
 */

import bcrypt from 'bcrypt';

const ROUNDS = 12;

/** Hash a plaintext password using bcrypt. */
export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, ROUNDS);

/** Verify a plaintext password against a bcrypt hash. */
export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

/** Synchronous bcrypt hash — use only in seeding scripts (not in request handlers). */
export const hashPasswordSync = (plain: string): string =>
  bcrypt.hashSync(plain, ROUNDS);

/** Detect legacy mock-hash format (base64+reversal, does NOT start with $2b$). */
export const isLegacyHash = (hash: string): boolean =>
  !hash.startsWith('$2b$') && !hash.startsWith('$2a$');

/** Verify a password against the OLD mock algorithm (migration only). */
export const verifyLegacyPassword = (plain: string, storedHash: string): boolean => {
  const legacy = Buffer.from(plain + '_clinipro_salt')
    .toString('base64')
    .split('')
    .reverse()
    .join('');
  return legacy === storedHash;
};
