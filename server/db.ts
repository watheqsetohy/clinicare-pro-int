/**
 * PostgreSQL Connection Pool
 * Single shared pool for the entire Express server.
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set. Please check your .env.local file.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false, // Local development — no SSL needed
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err);
});

/** Helper: run a query and return rows */
export const query = async (text: string, params?: any[]) => {
  const res = await pool.query(text, params);
  return res;
};

console.log('[DB] PostgreSQL pool initialised → clinicarepro_app');
